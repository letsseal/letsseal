import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { sealPdf, sealDetached, sealC2pa, sealXml, sealSmime, sealBlob, sealIdentity, signAttestation, anchorHash } from "@/lib/signing";
import { stampVerifyBadge } from "@/lib/stamp";
import { uniqueProofCode } from "@/lib/proofcode";
import { appendToLog } from "@/lib/translog";
import { buildBlobCosignBundle, buildAttestCosignBundle } from "@/lib/cosign-tlog";
import { sidecarPath } from "@/lib/proofs";

async function logSeal(sha256: string, sealType: string, certCN: string): Promise<void> {
  try {
    await appendToLog({ sha256, sealType, certCN });
  } catch {
  }
}

export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
export const proofUrl = (ref: string) => `${appUrl()}/d/${ref}`;

async function mintProofCode(): Promise<string> {
  return uniqueProofCode(async (code) => {
    const [doc, anch] = await Promise.all([
      db.sealedDocument.findUnique({ where: { proofCode: code }, select: { id: true } }),
      db.anchor.findUnique({ where: { proofCode: code }, select: { id: true } }),
    ]);
    return !!doc || !!anch;
  });
}

async function tryAnchor(sha256: string, wanted: boolean): Promise<{ otsProof: string | null; anchorState: string }> {
  if (!wanted) return { otsProof: null, anchorState: "none" };
  try {
    const a = await anchorHash(sha256);
    return { otsProof: a.ots_b64, anchorState: a.status.state };
  } catch {
    return { otsProof: null, anchorState: "none" };
  }
}

type SealRecordInput = {
  org: { id: string };
  sha256: string;
  sealType: string;
  certCN: string;
  title?: string | null;
  pdfPath?: string | null;
  detachedSig?: string | null;
  oidcProvider?: string | null;
  oidcIssuer?: string | null;
  otsProof: string | null;
  anchorState: string;
  id?: string;
  proofCode?: string;
};

async function recordSeal(input: SealRecordInput): Promise<{ id: string; proofCode: string | null; sha256: string }> {
  const sha = input.sha256.trim().toLowerCase();

  const existing = await db.sealedDocument.findFirst({
    where: { orgId: input.org.id, sha256: sha, sealType: input.sealType },
    select: { id: true, proofCode: true, sha256: true },
  });
  if (existing) return existing;

  try {
    return await db.sealedDocument.create({
      data: {
        id: input.id ?? `sd_${randomBytes(16).toString("hex")}`,
        org: { connect: { id: input.org.id } },
        source: "api",
        sealType: input.sealType,
        title: input.title ?? null,
        pdfPath: input.pdfPath ?? null,
        detachedSig: input.detachedSig ?? null,
        sha256: sha,
        proofCode: input.proofCode ?? (await mintProofCode()),
        certCN: input.certCN,
        oidcProvider: input.oidcProvider ?? null,
        oidcIssuer: input.oidcIssuer ?? null,
        otsProof: input.otsProof,
        anchorState: input.anchorState,
      },
      select: { id: true, proofCode: true, sha256: true },
    });
  } catch {
    const row = await db.sealedDocument.findFirst({
      where: { orgId: input.org.id, sha256: sha, sealType: input.sealType },
      select: { id: true, proofCode: true, sha256: true },
    });
    if (row) return row;
    throw new Error("could not record the seal");
  }
}

export type HostedSeal = {
  pdf: Buffer;
  sha256: string;
  certCN: string;
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSeal(
  org: { id: string; slug: string; name: string },
  pdf: Buffer,
  opts: { title?: string | null; reason?: string; anchor?: boolean; stamp?: boolean } = {},
): Promise<HostedSeal> {
  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const proofCode = await mintProofCode();
  const verifyUrl = `${appUrl()}/v/${proofCode}`;

  let toSeal = pdf;
  if (opts.stamp) {
    try { toSeal = await stampVerifyBadge(pdf, { proofUrl: verifyUrl, orgName: org.name, proofCode }); }
    catch { toSeal = pdf; }
  }

  const sealed = await sealPdf(org.slug, toSeal, { reason: opts.reason });

  const pdfPath = `hosted/${sealed.sha256}/sealed.pdf`;
  await saveFile(pdfPath, sealed.pdf);

  const { otsProof, anchorState } = await tryAnchor(sealed.sha256, !!opts.anchor);

  const rec = await recordSeal({
    org, sha256: sealed.sha256, sealType: "pades",
    certCN: sealed.certCN, title: opts.title ?? null, pdfPath,
    otsProof, anchorState, id: docId, proofCode,
  });

  await logSeal(sealed.sha256, "pades", sealed.certCN);
  return {
    pdf: sealed.pdf, sha256: sealed.sha256, certCN: sealed.certCN,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedDetachedSeal = {
  sha256: string;
  sig: string; 
  certCN: string;
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSealDetached(
  org: { id: string; slug: string; name: string },
  sha256: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedDetachedSeal> {
  const sha = sha256.trim().toLowerCase();
  const { sig_b64, cert_cn } = await sealDetached(org.slug, sha);

  const { otsProof, anchorState } = await tryAnchor(sha, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sha, sealType: "detached",
    certCN: cert_cn || org.name, title: opts.title ?? null,
    detachedSig: sig_b64,
    otsProof, anchorState,
  });

  await logSeal(sha, "detached", cert_cn || org.name);
  return {
    sha256: sha, sig: sig_b64, certCN: cert_cn || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedBlobSeal = {
  sha256: string;
  sig: string; 
  certPem: string;
  chainPem: string;
  certCN: string;
  identity: string;
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
  bundle: unknown | null; 
};

export async function hostedSealBlob(
  org: { id: string; slug: string; name: string },
  sha256: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedBlobSeal> {
  const sha = sha256.trim().toLowerCase();
  const r = await sealBlob(org.slug, sha);

  const { otsProof, anchorState } = await tryAnchor(sha, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sha, sealType: "blob",
    certCN: r.cert_cn || org.name,
    title: opts.title ?? null,
    detachedSig: r.sig_b64, 
    otsProof, anchorState,
  });

  await saveFile(sidecarPath(rec, "artifact.sig"), Buffer.from(r.sig_b64));
  await saveFile(sidecarPath(rec, "artifact.pem"), Buffer.from(r.cert_pem));
  await saveFile(sidecarPath(rec, "artifact.chain.pem"), Buffer.from(r.chain_pem));

  let cosignBundle: unknown = null;
  try {
    cosignBundle = await buildBlobCosignBundle({ artifactSha256: sha, sigB64: r.sig_b64, certPem: r.cert_pem });
    await saveFile(sidecarPath(rec, "artifact.cosign.bundle"), Buffer.from(JSON.stringify(cosignBundle)));
  } catch (e) {
    console.error("cosign tlog bundle failed (sidecars still valid):", e instanceof Error ? e.message : e);
  }

  await logSeal(sha, "blob", r.cert_cn || org.name);
  return {
    sha256: sha, sig: r.sig_b64, certPem: r.cert_pem, chainPem: r.chain_pem,
    certCN: r.cert_cn || org.name, identity: r.identity,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
    bundle: cosignBundle,
  };
}

export type HostedIdentitySeal = {
  sha256: string;
  sig: string; 
  certPem: string;
  chainPem: string;
  identity: string; 
  issuer: string;   
  provider: string; 
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSealIdentity(
  org: { id: string; slug: string; name: string },
  sha256: string,
  provider: string,
  token: string,
  opts: { title?: string | null; anchor?: boolean } = {},
): Promise<HostedIdentitySeal> {
  const sha = sha256.trim().toLowerCase();
  const r = await sealIdentity(provider, sha, token);

  const { otsProof, anchorState } = await tryAnchor(sha, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sha, sealType: "identity",
    certCN: r.cert_cn || r.identity,
    title: opts.title ?? null,
    detachedSig: r.sig_b64, 
    oidcProvider: r.provider,
    oidcIssuer: r.issuer,
    otsProof, anchorState,
  });

  await saveFile(sidecarPath(rec, "artifact.sig"), Buffer.from(r.sig_b64));
  await saveFile(sidecarPath(rec, "artifact.pem"), Buffer.from(r.cert_pem));
  await saveFile(sidecarPath(rec, "artifact.chain.pem"), Buffer.from(r.chain_pem));

  await logSeal(sha, "identity", r.identity);
  return {
    sha256: sha, sig: r.sig_b64, certPem: r.cert_pem, chainPem: r.chain_pem,
    identity: r.identity, issuer: r.issuer, provider: r.provider,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedAttestation = {
  sha256: string;
  bundle: unknown;      
  pubkey: string;       
  certPem: string;
  predicateType: string;
  certCN: string;
  anchorState: string;
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSealAttestation(
  org: { id: string; slug: string; name: string },
  sha256: string,
  predicate: unknown,
  opts: { predicateType?: string; subjectName?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedAttestation> {
  const sha = sha256.trim().toLowerCase();
  const r = await signAttestation(org.slug, sha, predicate, {
    predicateType: opts.predicateType, subjectName: opts.subjectName ?? opts.title ?? "artifact",
  });

  let bundle: unknown = r.bundle;
  try {
    bundle = await buildAttestCosignBundle({
      artifactSha256: sha, dsse: r.dsse as { payload: string; payloadType: string; signatures: { sig: string }[] }, certPem: r.cert_pem,
    });
  } catch (e) {
    console.error("cosign tlog attest bundle failed (falling back to --key bundle):", e instanceof Error ? e.message : e);
  }

  const { otsProof, anchorState } = await tryAnchor(sha, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sha, sealType: "attestation",
    certCN: r.cert_cn || org.name,
    title: opts.title ?? null,
    otsProof, anchorState,
  });

  await saveFile(sidecarPath(rec, "attestation.bundle"), Buffer.from(JSON.stringify(bundle)));
  await saveFile(sidecarPath(rec, "attestation.pem"), Buffer.from(r.cert_pem + r.chain_pem));
  await saveFile(sidecarPath(rec, "attestation.pub"), Buffer.from(r.pubkey_pem));

  await logSeal(sha, "attestation", r.cert_cn || org.name);
  return {
    sha256: sha, bundle, pubkey: r.pubkey_pem, certPem: r.cert_pem,
    predicateType: r.predicate_type, certCN: r.cert_cn || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}

export type HostedC2paSeal = {
  image: Buffer;
  sha256: string;
  certCN: string;
  format: string; 
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

const C2PA_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/tiff": "tiff",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
  "image/x-adobe-dng": "dng",
  "video/mp4": "mp4", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/flac": "flac", "audio/mp4": "m4a",
};

export async function hostedSealC2pa(
  org: { id: string; slug: string; name: string },
  image: Buffer,
  opts: { filename?: string; contentType?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedC2paSeal> {
  const sealed = await sealC2pa(org.slug, image, {
    filename: opts.filename, contentType: opts.contentType, title: opts.title,
  });

  const ext = C2PA_EXT[sealed.format] ?? "bin";
  const imgPath = `hosted/${sealed.sha256}/sealed.${ext}`;
  await saveFile(imgPath, sealed.image);

  const { otsProof, anchorState } = await tryAnchor(sealed.sha256, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sealed.sha256, sealType: "c2pa",
    certCN: sealed.certCN || org.name, title: opts.title ?? null,
    pdfPath: imgPath, 
    otsProof, anchorState,
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
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSealXml(
  org: { id: string; slug: string; name: string },
  xml: Buffer,
  opts: { filename?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedXmlSeal> {
  const sealed = await sealXml(org.slug, xml, { filename: opts.filename });

  const xmlPath = `hosted/${sealed.sha256}/sealed.xml`;
  await saveFile(xmlPath, sealed.xml);

  const { otsProof, anchorState } = await tryAnchor(sealed.sha256, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sealed.sha256, sealType: "xmldsig",
    certCN: sealed.certCN || org.name, title: opts.title ?? null,
    pdfPath: xmlPath, 
    otsProof, anchorState,
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
  anchorState: string; 
  proofUrl: string;
  proofCode: string | null;
};

export async function hostedSealSmime(
  org: { id: string; slug: string; name: string },
  message: Buffer,
  opts: { filename?: string; title?: string | null; anchor?: boolean } = {},
): Promise<HostedSmimeSeal> {
  const sealed = await sealSmime(org.slug, message, { filename: opts.filename });

  const emlPath = `hosted/${sealed.sha256}/sealed.eml`;
  await saveFile(emlPath, sealed.eml);

  const { otsProof, anchorState } = await tryAnchor(sealed.sha256, opts.anchor ?? true);

  const rec = await recordSeal({
    org, sha256: sealed.sha256, sealType: "smime",
    certCN: sealed.certCN || org.name, title: opts.title ?? null,
    pdfPath: emlPath, 
    otsProof, anchorState,
  });

  await logSeal(sealed.sha256, "smime", sealed.certCN || org.name);
  return {
    eml: sealed.eml, sha256: sealed.sha256, certCN: sealed.certCN || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}
