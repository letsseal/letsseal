import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, upgradeAnchor, type VerifyResult } from "@/lib/signing";
import { overContentLength, tooLarge } from "@/lib/limits";

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";

export async function POST(req: NextRequest) {
  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const sigField = form.get("sig");
  const uploadedSig = sigField instanceof File ? Buffer.from(await sigField.arrayBuffer()) : null;
  if (uploadedSig && uploadedSig.length > 1_000_000) {
    return NextResponse.json({ error: "signature too large" }, { status: 413 });
  }

  const rec = await db.sealedDocument.findUnique({
    where: { sha256 },
    include: { org: true, envelope: { include: { org: true, _count: { select: { audit: true } } } } },
  });

  let crypto: VerifyResult;
  if (uploadedSig || rec?.sealType === "detached") {
    const sigBuf = uploadedSig ?? (rec?.detachedSig ? Buffer.from(rec.detachedSig, "base64") : null);
    if (!sigBuf) {
      crypto = { sealed: true, sha256 };
    } else {
      const d = await verifyDetached(bytes, sigBuf);
      crypto = {
        sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
        authentic: d.valid && d.trusted, signer: d.signer,
      };
    }
  } else if (isPdf(bytes)) {
    crypto = await verifyPdf(bytes);
  } else {
    crypto = { sealed: false, sha256 };
  }

  let registry: null | {
    org: string | null; title: string | null; completedAt: string | null; auditEvents: number;
  } = null;
  let anchor: null | { state: string; btcBlock: number | null } = null;
  let otsUrl: string | null = null;

  if (rec) {
    registry = {
      org: rec.org?.name ?? rec.envelope?.org.name ?? null,
      title: rec.title ?? rec.envelope?.title ?? null,
      completedAt: (rec.envelope?.completedAt ?? rec.sealedAt).toISOString(),
      auditEvents: rec.envelope?._count.audit ?? 0,
    };
    anchor = { state: rec.anchorState, btcBlock: rec.btcBlock };
    if (rec.otsProof) otsUrl = rec.envelopeId ? `/api/file/${rec.envelopeId}?variant=ots` : `/api/anchor/${rec.sha256}`;
    // If still pending, opportunistically ask the calendars whether the
    // Bitcoin tx has confirmed, and persist an upgrade.
    if (rec.anchorState === "pending" && rec.otsProof) {
      try {
        const up = await upgradeAnchor(rec.otsProof);
        if (up.status.state === "confirmed") {
          await db.sealedDocument.update({
            where: { id: rec.id },
            data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
          });
          anchor = { state: "confirmed", btcBlock: up.status.bitcoin_block ?? null };
        }
      } catch { /* still pending / offline — keep prior state */ }
    }
  }

  return NextResponse.json({ ...crypto, onRecord: !!registry, registry, anchor, otsUrl });
}
