import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { sealPdf, anchorHash } from "@/lib/signing";
import { stampVerifyBadge } from "@/lib/stamp";

export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
export const proofUrl = (ref: string) => `${appUrl()}/d/${ref}`;

export type HostedSeal = {
  pdf: Buffer;
  sha256: string;
  certCN: string;
  anchorState: string; // none | pending | confirmed
  proofUrl: string;
};

// Seal a PDF for a business and persist it. When `anchor` is set, also anchor
// the sealed PDF's digest to Bitcoin (best-effort — a calendar hiccup leaves the
// doc sealed-but-unanchored rather than failing the whole call).
export async function hostedSeal(
  org: { id: string; slug: string; name: string },
  pdf: Buffer,
  opts: { title?: string | null; reason?: string; anchor?: boolean; stamp?: boolean } = {},
): Promise<HostedSeal> {
  // Pre-mint the document id so a verify QR can point at a stable proof URL that
  // is known *before* sealing (the sealed PDF's hash isn't). The `sd_` prefix
  // keeps it distinct from a 64-hex SHA and self-identifying in the /d resolver.
  const docId = `sd_${randomBytes(16).toString("hex")}`;
  const docProofUrl = proofUrl(docId);

  // Stamp the single corner verify-badge before sealing, so the signature covers
  // it (tamper-evident). Best-effort — a badge failure must not fail the seal.
  let toSeal = pdf;
  if (opts.stamp) {
    try { toSeal = await stampVerifyBadge(pdf, { proofUrl: docProofUrl, orgName: org.name }); }
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
      title: opts.title ?? null,
      pdfPath,
      sha256: sealed.sha256,
      certCN: sealed.certCN,
      otsProof,
      anchorState,
    },
    select: { id: true },
  });

  return { pdf: sealed.pdf, sha256: sealed.sha256, certCN: sealed.certCN, anchorState, proofUrl: proofUrl(rec.id) };
}
