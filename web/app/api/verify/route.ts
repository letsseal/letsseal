import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, verifyC2pa, upgradeAnchor, type VerifyResult } from "@/lib/signing";
import { overContentLength, tooLarge } from "@/lib/limits";

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
const isC2paMedia = (b: Buffer) => {
  const h4 = b.subarray(0, 4).toString("latin1");
  return (
    b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||                              
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || 
    (h4 === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") ||                    
    h4 === "II\x2a\x00" || h4 === "MM\x00\x2a" ||                                            
    ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) ||                    
    h4 === "fLaC" ||                                                                          
    b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || 
    b.subarray(4, 8).toString("latin1") === "ftyp"                                           
  );
};

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
  } else if (rec?.sealType === "c2pa" || isC2paMedia(bytes)) {
    const d = await verifyC2pa(bytes, { contentType: file.type });
    crypto = {
      sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
      authentic: d.valid && d.trusted, signer: d.signer,
    };
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
