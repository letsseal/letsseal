import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { sealPdf, sealDetached, sealC2pa, sealXml, sealSmime, sealBlob, sealIdentity, anchorHash } from "@/lib/signing";
import { stampVerifyBadge } from "@/lib/stamp";
import { uniqueProofCode } from "@/lib/proofcode";
import { appendToLog } from "@/lib/translog";

async function logSeal(sha256: string, sealType: string, certCN: string): Promise<void> {
  try {
    await appendToLog({ sha256, sealType, certCN });
  } catch {
  }
}

export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
export const proofUrl = (ref: string) => `${appUrl()}/d/${ref}`;

// Mint a proof code unique across BOTH proof-bearing tables (sealed docs and
// standalone anchors share the /v/<code> namespace).
async function mintProofCode(): Promise<string> {
  return uniqueProofCode(async (code) => {
    const [doc, anch] = await Promise.all([
      db.sealedDocument.findUnique({ where: { proofCode: code }, select: { id: true } }),
      db.anchor.findUnique({ where: { proofCode: code }, select: { id: true } }),
    ]);
    return !!doc || !!anch;
  });
}

export type HostedSeal = {
  pdf: Buffer;
  sha256: string;
  certCN: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// Seal a PDF for a business and persist it. When `anchor` is set, also anchor
// the sealed PDF's digest to Bitcoin (best-effort — a calendar hiccup leaves the
// doc sealed-but-unanchored rather than failing the whole call).
export async function hostedSeal(
  org: { id: string; slug: string; name: string },
  pdf: Buffer,
  opts: { title?: string | null; reason?: string; anchor?: boolean; stamp?: boolean } = {},
): Promise<HostedSeal> {
  // Pre-mint the document id AND the short proof code so the verify stamp is
  // known *before* sealing (the sealed PDF's hash isn't). The QR encodes the
  // short /v/<code> URL and the stamp prints the same code as a typable line.
  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const proofCode = await mintProofCode();
  const verifyUrl = `${appUrl()}/v/${proofCode}`;

  // Stamp the single corner verify-badge before sealing, so the signature covers
  // it (tamper-evident). Best-effort — a badge failure must not fail the seal.
  let toSeal = pdf;
  if (opts.stamp) {
    try { toSeal = await stampVerifyBadge(pdf, { proofUrl: verifyUrl, orgName: org.name, proofCode }); }
    catch { toSeal = pdf; }
  }

  const sealed = await sealPdf(org.slug, toSeal, { reason: opts.reason, timestamp: false });

  // Persist the sealed bytes so /d/<hash> can re-verify live and the org can
  // re-download later via a link. Storage is free for hosted users (the infra
  // is sponsor-funded); self-hosters store on their own disk. Deduped by digest
  // via the upsert below, and gzip-compressed at rest by the storage layer.
  const pdfPath = `hosted/${sealed.sha256}/sealed.pdf`;
  await saveFile(pdfPath, sealed.pdf);

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor) {
    try {
      const a = await anchorHash(sealed.sha256);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none"; // sealed but not anchored; caller can retry anchoring
    }
  }

  // Idempotent on the sealed digest (distinct seals produce distinct digests).
  // On the rare exact-collision, the existing row (and its id) wins; the badge
  // still resolves because /d also accepts the sealed SHA-256.
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sealed.sha256 },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "pades",
      title: opts.title ?? null,
      pdfPath,
      sha256: sealed.sha256,
      proofCode,
      certCN: sealed.certCN,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sealed.sha256, "pades", sealed.certCN);
  return {
    pdf: sealed.pdf, sha256: sealed.sha256, certCN: sealed.certCN,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedDetachedSeal = {
  sha256: string;
  sig: string; // base64 detached CMS
  certCN: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// Seal ANY file for a business: a detached CAdES/CMS signature over its SHA-256,
// anchored to Bitcoin, persisted as a permanent verifiable proof. Digest-only —
// the file bytes never reach us; `sha256` is the caller's locally-computed hash.
// There is no PDF to stamp or store, so this is pure proof: hash + .sig + anchor.
export async function hostedSealDetached(
  org: { id: string; slug: string; name: string },
  sha256: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedDetachedSeal> {
  const sha = sha256.trim().toLowerCase();
  const { sig_b64, cert_cn } = await sealDetached(org.slug, sha);

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sha);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none"; // sealed but not anchored; caller can retry anchoring
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sha },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "detached",
      title: opts.title ?? null,
      pdfPath: null,
      detachedSig: sig_b64,
      sha256: sha,
      proofCode: await mintProofCode(),
      certCN: cert_cn || org.name,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sha, "detached", cert_cn || org.name);
  return {
    sha256: sha, sig: sig_b64, certCN: cert_cn || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedBlobSeal = {
  sha256: string;
  sig: string; // base64 raw ECDSA signature (cosign form)
  certPem: string;
  chainPem: string;
  certCN: string;
  identity: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// cosign-compatible artifact seal for a business: a raw ECDSA signature over the
// artifact's SHA-256 + the org's codeSigning cert, anchored to Bitcoin, persisted
// as a permanent verifiable proof. Digest-only — the artifact bytes never reach
// us. We store the small sig/cert/chain so /d can serve the cosign sidecar set.
export async function hostedSealBlob(
  org: { id: string; slug: string; name: string },
  sha256: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedBlobSeal> {
  const sha = sha256.trim().toLowerCase();
  const r = await sealBlob(org.slug, sha);

  // Store the cosign sidecar set so the proof page can offer them for download.
  await saveFile(`hosted/${sha}/artifact.sig`, Buffer.from(r.sig_b64));
  await saveFile(`hosted/${sha}/artifact.pem`, Buffer.from(r.cert_pem));
  await saveFile(`hosted/${sha}/artifact.chain.pem`, Buffer.from(r.chain_pem));

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sha);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none";
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sha },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "blob",
      title: opts.title ?? null,
      pdfPath: null,
      detachedSig: r.sig_b64, // the raw sig, for drop-the-file-only verification
      sha256: sha,
      proofCode: await mintProofCode(),
      certCN: r.cert_cn || org.name,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sha, "blob", r.cert_cn || org.name);
  return {
    sha256: sha, sig: r.sig_b64, certPem: r.cert_pem, chainPem: r.chain_pem,
    certCN: r.cert_cn || org.name, identity: r.identity,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedIdentitySeal = {
  sha256: string;
  sig: string; // base64 raw ECDSA signature (cosign form)
  certPem: string;
  chainPem: string;
  identity: string; // provider-verified email bound into the cert SAN
  issuer: string;   // the OIDC issuer that vouched
  provider: string; // google | github | ...
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// Identity seal for the hosted API: the signing service re-verifies a
// Google/GitHub/OIDC proof, mints a short-lived leaf binding the verified email,
// and signs the artifact's SHA-256 with it. Digest-only — the artifact bytes
// never reach us. We persist the small cosign sidecar set + the verified identity
// and the issuer that vouched, so /d can attribute the seal forever. The org is
// the account that made the call; the identity is WHO signed (a third party
// verified them — we never assert identity ourselves).
export async function hostedSealIdentity(
  org: { id: string; slug: string; name: string },
  sha256: string,
  provider: string,
  token: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedIdentitySeal> {
  const sha = sha256.trim().toLowerCase();
  const r = await sealIdentity(provider, sha, token);

  await saveFile(`hosted/${sha}/artifact.sig`, Buffer.from(r.sig_b64));
  await saveFile(`hosted/${sha}/artifact.pem`, Buffer.from(r.cert_pem));
  await saveFile(`hosted/${sha}/artifact.chain.pem`, Buffer.from(r.chain_pem));

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sha);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none";
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sha },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "identity",
      title: opts.title ?? null,
      pdfPath: null,
      detachedSig: r.sig_b64, // the raw sig, for drop-the-file-only verification
      sha256: sha,
      proofCode: await mintProofCode(),
      certCN: r.cert_cn || r.identity,
      oidcProvider: r.provider,
      oidcIssuer: r.issuer,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sha, "identity", r.identity);
  return {
    sha256: sha, sig: r.sig_b64, certPem: r.cert_pem, chainPem: r.chain_pem,
    identity: r.identity, issuer: r.issuer, provider: r.provider,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedC2paSeal = {
  image: Buffer;
  sha256: string;
  certCN: string;
  format: string; // MIME of the signed image
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// File extension for a signed-media MIME, for the stored path (the download route
// serves the right Content-Type from it).
const C2PA_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/tiff": "tiff",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
  "image/x-adobe-dng": "dng",
  "video/mp4": "mp4", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/flac": "flac", "audio/mp4": "m4a",
};

// Seal an IMAGE for a business: embed a signed C2PA (Content Credentials) manifest,
// anchor the signed image's hash to Bitcoin, and persist it as a permanent
// verifiable proof. The seal lives inside the image, so we store and serve the
// signed bytes (like the PDF path). `image` is the original; we return the signed one.
export async function hostedSealC2pa(
  org: { id: string; slug: string; name: string },
  image: Buffer,
  opts: { filename?: string; contentType?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedC2paSeal> {
  const sealed = await sealC2pa(org.slug, image, {
    filename: opts.filename, contentType: opts.contentType, title: opts.title,
  });

  // Persist the signed image so /d can offer it for download and re-verification.
  const ext = C2PA_EXT[sealed.format] ?? "bin";
  const imgPath = `hosted/${sealed.sha256}/sealed.${ext}`;
  await saveFile(imgPath, sealed.image);

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sealed.sha256);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none";
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sealed.sha256 },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "c2pa",
      title: opts.title ?? null,
      pdfPath: imgPath, // the stored signed image (column is the generic "sealed file path")
      sha256: sealed.sha256,
      proofCode: await mintProofCode(),
      certCN: sealed.certCN || org.name,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sealed.sha256, "c2pa", sealed.certCN || org.name);
  return {
    image: sealed.image, sha256: sealed.sha256, certCN: sealed.certCN || org.name,
    format: sealed.format, anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedXmlSeal = {
  xml: Buffer;
  sha256: string;
  certCN: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// Seal an XML document for a business: embed an enveloped XML-DSig signature,
// anchor the signed document's hash to Bitcoin, and persist it as a permanent
// verifiable proof. The seal lives inside the XML, so we store and serve the
// signed bytes (like the PDF/image path). `xml` is the original; we return the signed one.
export async function hostedSealXml(
  org: { id: string; slug: string; name: string },
  xml: Buffer,
  opts: { filename?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedXmlSeal> {
  const sealed = await sealXml(org.slug, xml, { filename: opts.filename });

  const xmlPath = `hosted/${sealed.sha256}/sealed.xml`;
  await saveFile(xmlPath, sealed.xml);

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sealed.sha256);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none";
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sealed.sha256 },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "xmldsig",
      title: opts.title ?? null,
      pdfPath: xmlPath, // the stored signed XML (generic "sealed file path")
      sha256: sealed.sha256,
      proofCode: await mintProofCode(),
      certCN: sealed.certCN || org.name,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sealed.sha256, "xmldsig", sealed.certCN || org.name);
  return {
    xml: sealed.xml, sha256: sealed.sha256, certCN: sealed.certCN || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedSmimeSeal = {
  eml: Buffer;
  sha256: string;
  certCN: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
  proofCode: string | null;
};

// Seal an email message for a business: wrap it in a signed S/MIME
// multipart/signed envelope, anchor the signed message's hash to Bitcoin, and
// persist it as a permanent verifiable proof. The signature travels inside the
// .eml, so we store and serve the signed bytes. `message` is the original; we
// return the signed one.
export async function hostedSealSmime(
  org: { id: string; slug: string; name: string },
  message: Buffer,
  opts: { filename?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedSmimeSeal> {
  const sealed = await sealSmime(org.slug, message, { filename: opts.filename });

  const emlPath = `hosted/${sealed.sha256}/sealed.eml`;
  await saveFile(emlPath, sealed.eml);

  let otsProof: string | null = null;
  let anchorState = "none";
  if (opts.anchor ?? true) {
    try {
      const a = await anchorHash(sealed.sha256);
      otsProof = a.ots_b64;
      anchorState = a.status.state;
    } catch {
      anchorState = "none";
    }
  }

  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const rec = await db.sealedDocument.upsert({
    where: { sha256: sealed.sha256 },
    update: {},
    create: {
      id: docId,
      org: { connect: { id: org.id } },
      source: "api",
      sealType: "smime",
      title: opts.title ?? null,
      pdfPath: emlPath, // the stored signed .eml (generic "sealed file path")
      sha256: sealed.sha256,
      proofCode: await mintProofCode(),
      certCN: sealed.certCN || org.name,
      otsProof,
      anchorState,
    },
    select: { id: true, proofCode: true },
  });

  await logSeal(sealed.sha256, "smime", sealed.certCN || org.name);
  return {
    eml: sealed.eml, sha256: sealed.sha256, certCN: sealed.certCN || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}
