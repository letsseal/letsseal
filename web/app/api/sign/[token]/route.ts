import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { readFile, saveFile } from "@/lib/storage";
import { sealPdf, anchorPdf, qrPng } from "@/lib/signing";
import { appendAudit } from "@/lib/audit";
import { sendEnvelopeCompleted, sendEnvelopeCompletedSender } from "@/lib/mailer";
import { recordSend } from "@/lib/send-guard";
import { advanceSequence } from "@/lib/envelope-routing";
import { clientIp } from "@/lib/ip";
import { ctEqual } from "@/lib/ct";

const suppliedCode = (req: NextRequest) =>
  req.nextUrl.searchParams.get("code") ?? req.headers.get("x-access-code");

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const signer = await db.signer.findUnique({
    where: { token },
    include: { envelope: { include: { org: true, fields: { include: { signer: true } } } } },
  });
  if (!signer) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  if (signer.accessCode && !ctEqual(signer.accessCode, suppliedCode(req))) {
    return NextResponse.json({
      signer: { id: signer.id, name: signer.name, kind: signer.kind, status: signer.status, hasAccessCode: true },
      needsAccessCode: true,
    });
  }

  if (signer.status === "pending") {
    const ip = clientIp(req);
    const ua = req.headers.get("user-agent") ?? "";
    await db.signer.update({ where: { id: signer.id }, data: { status: "viewed" } });
    await appendAudit(signer.envelope.id, signer.id, "viewed", { ip, userAgent: ua, details: signer.name });
  }

  return NextResponse.json({
    signer: { id: signer.id, name: signer.name, kind: signer.kind, status: signer.status,
              hasAccessCode: !!signer.accessCode },
    envelope: {
      id: signer.envelope.id,
      title: signer.envelope.title,
      status: signer.envelope.status,
      org: { name: signer.envelope.org.name, brandColor: signer.envelope.org.brandColor },
      fields: signer.envelope.fields.map((f) => ({
        id: f.id, type: f.type, label: f.label, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
        value: (f.signerId === signer.id || f.signerId === null) ? f.value : null,
        signerId: f.signerId, signerName: f.signer?.name ?? null,
        mine: f.signerId === signer.id,
      })),
    },
  });
}

const MAX_SIGN_JSON_BYTES = 2_000_000; 
const MAX_FIELD_VALUE = 200_000; 

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_SIGN_JSON_BYTES)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const { values, accessCode } = (await req.json()) as {
    values: Record<string, string>; accessCode?: string;
  };
  const signer = await db.signer.findUnique({
    where: { token },
    include: { envelope: { include: { org: true } } },
  });
  if (!signer) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  if (signer.status === "signed")
    return NextResponse.json({ error: "already signed" }, { status: 409 });
  if (signer.accessCode && !ctEqual(signer.accessCode, accessCode))
    return NextResponse.json({ error: "bad access code" }, { status: 403 });

  if (signer.envelope.sequential) {
    const ahead = await db.signer.count({
      where: {
        envelopeId: signer.envelope.id,
        role: { in: ["signer", "in_person"] },
        status: { notIn: ["signed", "declined"] },
        order: { lt: signer.order },
      },
    });
    if (ahead > 0) return NextResponse.json({ error: "It's not your turn to sign yet." }, { status: 409 });
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  for (const [fieldId, value] of Object.entries(values ?? {})) {
    const field = await db.field.findUnique({ where: { id: fieldId } });
    if (!field || field.signerId !== signer.id) continue;
    await db.field.update({ where: { id: fieldId }, data: { value: String(value ?? "").slice(0, MAX_FIELD_VALUE) } });
    await appendAudit(signer.envelope.id, signer.id, "field_filled", { ip, userAgent: ua, details: field.type });
  }
  await db.signer.update({ where: { id: signer.id }, data: { status: "signed", signedAt: new Date() } });
  await appendAudit(signer.envelope.id, signer.id, "signed", { ip, userAgent: ua, details: signer.name });

  const remaining = await db.signer.count({
    where: { envelopeId: signer.envelope.id, role: { in: ["signer", "in_person"] }, status: { not: "signed" } },
  });
  if (remaining > 0) {
    await advanceSequence(signer.envelope.id);
    return NextResponse.json({ ok: true, completed: false });
  }

  const sealed = await completeAndSeal(signer.envelope.id, signer.envelope.org.slug, ip, ua);
  return NextResponse.json({ ok: true, completed: true, ...sealed });
}

async function completeAndSeal(envelopeId: string, orgSlug: string, ip: string, ua: string) {
  const env = await db.envelope.findUnique({ where: { id: envelopeId }, include: { fields: true, org: true, signers: true } });
  if (!env) throw new Error("envelope gone");
  const signerById = new Map(env.signers.map((s) => [s.id, s]));

  const pdfBytes = await readFile(env.pdfPath);
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const f of env.fields) {
    if (!f.value) continue;
    const page = pages[f.page];
    if (!page) continue;
    const { width, height } = page.getSize();
    const x = f.x * width;
    const boxH = f.h * height;
    const y = height - (f.y + f.h) * height; 
    try {
      if (f.type === "signature" && f.value.startsWith("data:image")) {
        const png = await doc.embedPng(Buffer.from(f.value.split(",")[1], "base64"));
        page.drawImage(png, { x, y, width: f.w * width, height: boxH });
        const signer = f.signerId ? signerById.get(f.signerId) : null;
        const sigHash = createHash("sha256")
          .update(`${f.signerId ?? ""}:${signer?.signedAt?.toISOString() ?? ""}:${f.id}`)
          .digest("hex").slice(0, 18).toUpperCase();
        const grey = rgb(0.46, 0.46, 0.5);
        try {
          page.drawText(`Signed by:${signer?.name ? " " + signer.name.slice(0, 40) : ""}`,
            { x, y: y + boxH + 1.5, size: 5, font, color: grey });
          page.drawText(`${sigHash}…`, { x, y: Math.max(y - 6, 2), size: 5, font, color: grey });
        } catch (err) { console.error("sig stamp skipped:", err); }
      } else {
        const size = Math.min(boxH * 0.7, 14);
        // Cap length and drop non-WinAnsi glyphs Helvetica can't encode.
        const text = f.value.slice(0, 500).replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
        page.drawText(text, { x: x + 2, y: y + boxH * 0.3, size, font, color: rgb(0.05, 0.05, 0.2) });
      }
    } catch (e) {
      console.error(`field ${f.id} render skipped:`, e);
    }
  }

  // Stamp a proof footer + QR on every page BEFORE sealing, so the link is
  // covered by the cryptographic signature. Keyed on the envelope id (stable),
  // not the file hash (which sealing changes). Best-effort — never fail the seal.
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const proofUrl = `${base}/d/${envelopeId}`;
  try {
    await stampProofFooter(doc, font, proofUrl, env.org.name, envelopeId);
  } catch (e) {
    console.error("footer stamp failed (sealing without it):", e);
  }

  const filled = Buffer.from(await doc.save());
  // Seal with the org's certificate (timestamp off for local speed).
  const res = await sealPdf(orgSlug, filled, { reason: `Executed: ${env.title}`, timestamp: false });
  await saveFile(`envelopes/${envelopeId}/sealed.pdf`, res.pdf);

  // Anchor the sealed hash on Bitcoin via OpenTimestamps (best-effort — a
  // network hiccup must never fail the seal itself).
  let otsProof: string | null = null;
  let anchorState = "none";
  try {
    const anchored = await anchorPdf(res.pdf);
    otsProof = anchored.ots_b64;
    anchorState = anchored.status.state; // "pending" immediately after stamping
    await saveFile(`envelopes/${envelopeId}/sealed.pdf.ots`, Buffer.from(otsProof, "base64"));
  } catch (e) {
    console.error("anchor failed (seal still valid):", e);
  }

  await db.sealedDocument.upsert({
    where: { envelopeId },
    update: { sha256: res.sha256, certCN: res.certCN, pdfPath: `envelopes/${envelopeId}/sealed.pdf`, otsProof, anchorState },
    create: { envelopeId, sha256: res.sha256, certCN: res.certCN, pdfPath: `envelopes/${envelopeId}/sealed.pdf`, otsProof, anchorState },
  });
  await db.envelope.update({ where: { id: envelopeId }, data: { status: "completed", completedAt: new Date() } });
  await appendAudit(envelopeId, "system", "sealed", { ip, userAgent: ua, details: `${res.certCN} ${res.sha256.slice(0, 12)}` });
  if (anchorState !== "none") await appendAudit(envelopeId, "system", "anchored", { details: `OpenTimestamps ${anchorState}` });

  // Notify every party their completed, sealed copy is ready — the DocuSign-style
  // "all parties have signed, here is the completed document". Each remote signer
  // gets a direct, tokened download link that works from the inbox (no account).
  // Best-effort: a mail hiccup (or unconfigured SMTP) never fails the seal.
  try {
    // 1. Each remote signer → their own tokened direct download.
    const signers = await db.signer.findMany({
      where: { envelopeId, email: { not: null } },
      select: { name: true, email: true, token: true },
    });
    const signerNotes = await Promise.all(
      signers.map((s) =>
        sendEnvelopeCompleted({
          to: s.email!,
          signerName: s.name,
          envelopeTitle: env.title,
          orgName: env.org.name,
          brandColor: env.org.brandColor ?? undefined,
          replyTo: env.org.fromEmail ?? undefined,
          downloadUrl: `${base}/api/file/${envelopeId}?variant=sealed&token=${s.token}`,
          proofUrl,
        })
          .then(async (sent) => { if (sent) await recordSend(env.orgId, s.email!, "completed"); return sent; })
          .catch(() => false),
      ),
    );

    // 2. The sender(s) — org owners/admins — get a "complete" notice too, deduped
    //    against anyone who already got a signer copy (a self-signing owner).
    const signerEmails = new Set(signers.map((s) => s.email!.toLowerCase()));
    const owners = await db.membership.findMany({
      where: { orgId: env.orgId, role: { in: ["owner", "admin"] } },
      select: { user: { select: { name: true, email: true } } },
    });
    const senders = owners
      .map((m) => m.user)
      .filter((u) => u.email && !signerEmails.has(u.email.toLowerCase()));
    const senderNotes = await Promise.all(
      senders.map((u) =>
        sendEnvelopeCompletedSender({
          to: u.email,
          name: u.name ?? "",
          envelopeTitle: env.title,
          orgName: env.org.name,
          brandColor: env.org.brandColor ?? undefined,
          replyTo: env.org.fromEmail ?? undefined,
          proofUrl,
        })
          .then(async (sent) => { if (sent) await recordSend(env.orgId, u.email, "completed_sender"); return sent; })
          .catch(() => false),
      ),
    );

    const sent = [...signerNotes, ...senderNotes].filter(Boolean).length;
    if (sent) {
      await appendAudit(envelopeId, "system", "completed_notified", {
        details: `emailed ${signerNotes.filter(Boolean).length} signer(s) + ${senderNotes.filter(Boolean).length} sender(s)`,
      });
    }
  } catch (e) {
    console.error("completion emails failed (seal still valid):", e);
  }

  return { sha256: res.sha256, certCN: res.certCN, anchorState };
}

// Draw a subtle proof footer + QR on every page: wax seal dot, "Sealed by …",
// the verify URL, and a scannable QR pointing to the public proof page.
async function stampProofFooter(
  doc: PDFDocument,
  font: import("pdf-lib").PDFFont,
  proofUrl: string,
  orgName: string,
  envelopeId: string,
) {
  const png = await qrPng(proofUrl);
  const qr = await doc.embedPng(png);
  const wax = rgb(0.102, 0.451, 0.910); // brand blue seal dot
  const grey = rgb(0.42, 0.42, 0.45);
  const faint = rgb(0.62, 0.62, 0.66);
  const label = proofUrl.replace(/^https?:\/\//, "");
  const line = `Sealed by ${orgName}  ·  Verify at ${label}`;
  const envLine = `Let's Seal Envelope ID: ${envelopeId.toUpperCase()}`;
  const QR = 26; 

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    try { page.drawText(envLine, { x: 30, y: height - 12, size: 6, font, color: faint }); } catch {}
    const baseY = 5;
    page.drawCircle({ x: 36, y: baseY + 12, size: 3, color: wax });
    page.drawText(line, { x: 44, y: baseY + 14, size: 6.5, font, color: grey });
    page.drawText("Cryptographically sealed & anchored to the public ledger. Proof is public and independently verifiable.",
      { x: 44, y: baseY + 5, size: 5, font, color: grey });
    page.drawImage(qr, { x: width - 30 - QR, y: baseY, width: QR, height: QR });
  }
}
