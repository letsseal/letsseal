import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { readFile, saveFile } from "@/lib/storage";
import { sealPdf, anchorPdf } from "@/lib/signing";
import { appendAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const signer = await db.signer.findUnique({
    where: { token },
    include: { envelope: { include: { org: true, fields: { include: { signer: true } } } } },
  });
  if (!signer) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  return NextResponse.json({
    signer: { id: signer.id, name: signer.name, kind: signer.kind, status: signer.status,
              hasAccessCode: !!signer.accessCode },
    envelope: {
      id: signer.envelope.id,
      title: signer.envelope.title,
      status: signer.envelope.status,
      org: { name: signer.envelope.org.name, brandColor: signer.envelope.org.brandColor },
      fields: signer.envelope.fields.map((f) => ({
        id: f.id, type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
        value: f.value, signerId: f.signerId, signerName: f.signer?.name ?? null,
        mine: f.signerId === signer.id,
      })),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
  if (signer.accessCode && signer.accessCode !== accessCode)
    return NextResponse.json({ error: "bad access code" }, { status: 403 });

  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const ua = req.headers.get("user-agent") ?? "";

  for (const [fieldId, value] of Object.entries(values ?? {})) {
    const field = await db.field.findUnique({ where: { id: fieldId } });
    if (!field || field.signerId !== signer.id) continue;
    await db.field.update({ where: { id: fieldId }, data: { value } });
    await appendAudit(signer.envelope.id, signer.id, "field_filled", { ip, userAgent: ua, details: field.type });
  }
  await db.signer.update({ where: { id: signer.id }, data: { status: "signed", signedAt: new Date() } });
  await appendAudit(signer.envelope.id, signer.id, "signed", { ip, userAgent: ua, details: signer.name });

  const remaining = await db.signer.count({
    where: { envelopeId: signer.envelope.id, status: { not: "signed" } },
  });
  if (remaining > 0) return NextResponse.json({ ok: true, completed: false });

  const sealed = await completeAndSeal(signer.envelope.id, signer.envelope.org.slug, ip, ua);
  return NextResponse.json({ ok: true, completed: true, ...sealed });
}

async function completeAndSeal(envelopeId: string, orgSlug: string, ip: string, ua: string) {
  const env = await db.envelope.findUnique({ where: { id: envelopeId }, include: { fields: true } });
  if (!env) throw new Error("envelope gone");

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
    if (f.type === "signature" && f.value.startsWith("data:image")) {
      const png = await doc.embedPng(Buffer.from(f.value.split(",")[1], "base64"));
      page.drawImage(png, { x, y, width: f.w * width, height: boxH });
    } else {
      const size = Math.min(boxH * 0.7, 14);
      page.drawText(f.value, { x: x + 2, y: y + boxH * 0.3, size, font, color: rgb(0.05, 0.05, 0.2) });
    }
  }

  const filled = Buffer.from(await doc.save());
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

  return { sha256: res.sha256, certCN: res.certCN, anchorState };
}
