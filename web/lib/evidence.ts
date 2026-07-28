import { db } from "@/lib/db";
import { readFile, fileExists } from "@/lib/storage";
import { canonicalProofQuery } from "@/lib/proofs";
import { issuerFrom } from "@/lib/issuer";
import { getInclusionProof, getSignedTreeHead } from "@/lib/translog";
import { getRevocations } from "@/lib/signing";
import { composeBundle, type BundleResult, type SealRecord } from "@/lib/evidence-bundle";

export type { BundleResult } from "@/lib/evidence-bundle";

export async function buildEvidenceBundle(sha256: string): Promise<BundleResult | null> {
  const row = await db.sealedDocument.findFirst({
    ...canonicalProofQuery(sha256),
    select: {
      sha256: true, certCN: true, sealType: true, sealedAt: true, title: true,
      pdfPath: true, detachedSig: true, proofCode: true,
      otsProof: true, anchorState: true, anchorProvider: true, btcBlock: true,
      oidcProvider: true, oidcIssuer: true,
      org: { select: { name: true, status: true, tenant: { select: { verifiedDomain: true } } } },
      envelope: {
        select: {
          id: true, title: true, sequential: true,
          org: { select: { name: true, status: true, tenant: { select: { verifiedDomain: true } } } },
          signers: {
            select: { name: true, email: true, role: true, order: true, status: true,
                      viewedAt: true, signedAt: true },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  if (!row) return null;

  const org = row.org ?? row.envelope?.org ?? null;
  const rec: SealRecord = {
    sha256: row.sha256, certCN: row.certCN, sealType: row.sealType, sealedAt: row.sealedAt,
    title: row.title, detachedSig: row.detachedSig, proofCode: row.proofCode,
    otsProof: row.otsProof, anchorState: row.anchorState, anchorProvider: row.anchorProvider,
    btcBlock: row.btcBlock, oidcProvider: row.oidcProvider, oidcIssuer: row.oidcIssuer,
    orgName: org?.name ?? null,
    verifiedDomain: org ? issuerFrom(org) : null,
    envelope: row.envelope
      ? { title: row.envelope.title, sequential: row.envelope.sequential, signers: row.envelope.signers }
      : null,
  };

  const pdfBytes = row.sealType !== "detached" && row.pdfPath && (await fileExists(row.pdfPath))
    ? new Uint8Array(await readFile(row.pdfPath))
    : null;

  const log = await Promise.all([getInclusionProof({ sha256: row.sha256 }), getSignedTreeHead()])
    .then(([proof, sth]) => (proof ? { proof, sth } : null))
    .catch(() => null);
  const revocations = await getRevocations().catch(() => null);
  const auditEvents = row.envelope
    ? await db.auditEvent.findMany({
        where: { envelopeId: row.envelope.id },
        orderBy: { seq: "asc" },
        select: { seq: true, actor: true, action: true, ip: true, userAgent: true,
                  prevHash: true, hash: true, createdAt: true },
      }).catch(() => null)
    : null;

  return composeBundle({ rec, pdfBytes, log, auditEvents, revocations });
}
