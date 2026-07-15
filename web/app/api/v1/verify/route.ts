import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, verifyC2pa, verifyXml, verifySmime, verifyBlob, verifyIdentity, verifyAttestation, type VerifyResult } from "@/lib/signing";
import { readFile, fileExists } from "@/lib/storage";
import { withCors, preflight } from "@/lib/cors";
import { overContentLength, tooLarge } from "@/lib/limits";

const isXml = (b: Buffer) => {
  let i = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  return b[i] === 0x3c;
};

const isPdf = (b: Buffer) => b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
const isSmime = (b: Buffer) => {
  const head = b.subarray(0, 4096).toString("latin1").toLowerCase();
  return head.includes("multipart/signed") && head.includes("pkcs7-signature");
};
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
    } else if (isSmime(bytes)) {
      const d = await verifySmime(bytes, { filename: file.name });
      v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
    } else if (isC2paMedia(bytes)) {
      const d = await verifyC2pa(bytes, { contentType: file.type });
      v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
    } else if (isXml(bytes)) {
      const d = await verifyXml(bytes, { filename: file.name });
      v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
    } else if (isPdf(bytes)) {
      v = await verifyPdf(bytes);
    } else {
      const rec = await db.sealedDocument.findUnique({ where: { sha256 }, select: { sealType: true, detachedSig: true } });
      if (rec?.sealType === "detached" && rec.detachedSig) {
        const d = await verifyDetached(bytes, Buffer.from(rec.detachedSig, "base64"));
        v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer: d.signer };
      } else if ((rec?.sealType === "blob" || rec?.sealType === "identity") && rec.detachedSig && (await fileExists(`hosted/${sha256}/artifact.pem`))) {
        const leaf = (await readFile(`hosted/${sha256}/artifact.pem`)).toString("utf8");
        const chain = (await fileExists(`hosted/${sha256}/artifact.chain.pem`)) ? (await readFile(`hosted/${sha256}/artifact.chain.pem`)).toString("utf8") : "";
        // Identity seals surface the verified email as the signer; blob seals the cert CN.
        const d = rec.sealType === "identity"
          ? await verifyIdentity(bytes, rec.detachedSig, leaf + chain)
          : await verifyBlob(bytes, rec.detachedSig, leaf + chain);
        const signer = ("identity" in d && d.identity) ? d.identity : d.signer;
        v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted, signer };
      } else if (rec?.sealType === "attestation" && (await fileExists(`hosted/${sha256}/attestation.bundle`))) {
        const bundle = (await readFile(`hosted/${sha256}/attestation.bundle`)).toString("utf8");
        const cert = (await readFile(`hosted/${sha256}/attestation.pem`)).toString("utf8");
        const d = await verifyAttestation(bytes, bundle, cert);
        v = { sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted, authentic: d.valid && d.trusted && d.subject_ok !== false, signer: d.signer };
      } else {
        v = { sealed: false, sha256 };
      }
    }
    return withCors(NextResponse.json(v));
  } catch (e) {
    return withCors(NextResponse.json({ error: `verify failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
