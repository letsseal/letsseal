import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { sealPdf, sealDetached, anchorHash } from "@/lib/signing";
import { stampVerifyBadge } from "@/lib/stamp";
import { uniqueProofCode } from "@/lib/proofcode";

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

  return {
    sha256: sha, sig: sig_b64, certCN: cert_cn || org.name,
    anchorState, proofUrl: proofUrl(rec.id), proofCode: rec.proofCode ?? null,
  };
}
