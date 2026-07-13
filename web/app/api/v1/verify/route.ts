import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, type VerifyResult } from "@/lib/signing";
import { withCors, preflight } from "@/lib/cors";
import { overContentLength, tooLarge } from "@/lib/limits";

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";

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
