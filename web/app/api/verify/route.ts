import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPdf, verifyDetached, verifyC2pa, verifyXml, verifySmime, verifyBlob, verifyIdentity, verifyAttestation, upgradeAnchor, type VerifyResult } from "@/lib/signing";
import { overContentLength, tooLarge } from "@/lib/limits";
import { canonicalProofQuery, coIssuersFor, readSidecar } from "@/lib/proofs";
import { rateLimitedAsync } from "@/lib/ratelimit";
import { clientIp } from "@/lib/ip";

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

export async function POST(req: NextRequest) {
  if (await rateLimitedAsync(`verify:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "too many requests, try again shortly" }, { status: 429 });
  }
  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const sigField = form?.get("sig");
  const uploadedSig = sigField instanceof File ? Buffer.from(await sigField.arrayBuffer()) : null;
  if (uploadedSig && uploadedSig.length > 1_000_000) {
    return NextResponse.json({ error: "signature too large" }, { status: 413 });
  }

  const rec = await db.sealedDocument.findFirst({
    ...canonicalProofQuery(sha256),
    include: { org: true, envelope: { include: { org: true, _count: { select: { audit: true } } } } },
  });

  let crypto: VerifyResult;
  if (rec?.sealType === "blob" && !uploadedSig) {
    const sigB64 = rec.detachedSig;
    const leaf = await readSidecar(rec, "artifact.pem");
    if (sigB64 && leaf) {
      const chain = (await readSidecar(rec, "artifact.chain.pem")) ?? "";
      const d = await verifyBlob(bytes, sigB64, leaf + chain);
      crypto = {
        sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
        authentic: d.valid && d.trusted, signer: d.signer,
      };
    } else {
      crypto = { sealed: true, sha256, signer: rec.certCN ?? undefined };
    }
  } else if (rec?.sealType === "identity" && !uploadedSig) {
    const sigB64 = rec.detachedSig;
    const leaf = await readSidecar(rec, "artifact.pem");
    if (sigB64 && leaf) {
      const chain = (await readSidecar(rec, "artifact.chain.pem")) ?? "";
      const d = await verifyIdentity(bytes, sigB64, leaf + chain);
      crypto = {
        sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
        authentic: d.valid && d.trusted, signer: d.identity || d.signer,
      };
    } else {
      crypto = { sealed: true, sha256, signer: rec.certCN ?? undefined };
    }
  } else if (rec?.sealType === "attestation" && !uploadedSig) {
    const bundle = await readSidecar(rec, "attestation.bundle");
    const cert = await readSidecar(rec, "attestation.pem");
    if (bundle && cert) {
      const d = await verifyAttestation(bytes, bundle, cert);
      crypto = {
        sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
        authentic: d.valid && d.trusted && d.subject_ok !== false, signer: d.signer,
      };
    } else {
      crypto = { sealed: true, sha256, signer: rec.certCN ?? undefined };
    }
  } else if (uploadedSig || rec?.sealType === "detached") {
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
  } else if (rec?.sealType === "smime" || isSmime(bytes)) {
    const d = await verifySmime(bytes, { filename: file.name });
    crypto = {
      sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
      authentic: d.valid && d.trusted, signer: d.signer,
    };
  } else if (rec?.sealType === "c2pa" || isC2paMedia(bytes)) {
    const d = await verifyC2pa(bytes, { contentType: file.type });
    crypto = {
      sealed: d.sealed, sha256, intact: d.valid, valid: d.valid, trusted: d.trusted,
      authentic: d.valid && d.trusted, signer: d.signer,
    };
  } else if (rec?.sealType === "xmldsig" || isXml(bytes)) {
    const d = await verifyXml(bytes, { filename: file.name });
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
  let alsoSealedBy: Awaited<ReturnType<typeof coIssuersFor>> = [];

  if (rec) {
    alsoSealedBy = await coIssuersFor(sha256, rec.id);
    registry = {
      org: rec.org?.name ?? rec.envelope?.org.name ?? null,
      title: rec.title ?? rec.envelope?.title ?? null,
      completedAt: (rec.envelope?.completedAt ?? rec.sealedAt).toISOString(),
      auditEvents: rec.envelope?._count.audit ?? 0,
    };
    anchor = { state: rec.anchorState, btcBlock: rec.btcBlock };
    if (rec.otsProof) otsUrl = rec.envelopeId ? `/api/file/${rec.envelopeId}?variant=ots` : `/api/anchor/${rec.sha256}`;
    if (rec.anchorState === "pending" && rec.otsProof && !(await rateLimitedAsync(`otsupgrade:${sha256}`, 1, 10 * 60_000))) {
      try {
        const up = await upgradeAnchor(rec.otsProof);
        if (up.status.state === "confirmed") {
          await db.sealedDocument.update({
            where: { id: rec.id },
            data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
          });
          anchor = { state: "confirmed", btcBlock: up.status.bitcoin_block ?? null };
        }
      } catch {  }
    }
  }

  return NextResponse.json({
    ...crypto,
    onRecord: !!registry,
    registry,
    anchor,
    otsUrl,
    ...(alsoSealedBy.length ? { alsoSealedBy } : {}),
  });
}
