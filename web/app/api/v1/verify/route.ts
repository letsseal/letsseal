import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, verifyC2pa, type VerifyResult } from "@/lib/signing";
import { withCors, preflight } from "@/lib/cors";
import { overContentLength, tooLarge } from "@/lib/limits";

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
const isImage = (b: Buffer) => {
  const h4 = b.subarray(0, 4).toString("latin1");
  return (
    b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (h4 === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") ||
    h4 === "II\x2a\x00" || h4 === "MM\x00\x2a" ||
    ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) ||
    b.subarray(4, 8).toString("latin1") === "ftyp"
  );
};

export function OPTIONS() { return preflight(); }

export async function POST(req: NextRequest) {
  if (overContentLength(req)) return withCors(NextResponse.json({ error: "file too large" }, { status: 413 }));
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return withCors(NextResponse.json({ error: "multipart form with a 'file' field required" }, { status: 400 }));
  }
  if (tooLarge(file)) return withCors(NextResponse.json({ error: "file too large" }, { status: 413 }));
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const sigField = form?.get("sig");
  const uploadedSig = sigField instanceof File ? Buffer.from(await sigField.arrayBuffer()) : null;
  if (uploadedSig && uploadedSig.length > 1_000_000) {
    return withCors(NextResponse.json({ error: "signature too large" }, { status: 413 }));
  }

  try {
    let v: VerifyResult;
    if (uploadedSig) {
      const d = await verifyDetached(bytes, uploadedSig);
      v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
    } else if (isImage(bytes)) {
      const d = await verifyC2pa(bytes, { contentType: file.type });
      v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
    } else if (isPdf(bytes)) {
      v = await verifyPdf(bytes);
    } else {
      const rec = await db.sealedDocument.findUnique({ where: { sha256 }, select: { sealType: true, detachedSig: true } });
      if (rec?.sealType === "detached" && rec.detachedSig) {
        const d = await verifyDetached(bytes, Buffer.from(rec.detachedSig, "base64"));
        v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
      } else {
        v = { sealed: false, sha256 };
      }
    }
    return withCors(NextResponse.json(v));
  } catch (e) {
    return withCors(NextResponse.json({ error: `verify failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
