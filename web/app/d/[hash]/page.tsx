import Link from "next/link";
import type { Metadata } from "next";
import { ShieldX, ArrowLeft, Download, FileArchive } from "lucide-react";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { readFile, fileExists } from "@/lib/storage";
import { verifyPdf, verifyC2pa, verifyXml, verifySmime, upgradeAnchor } from "@/lib/signing";
import { getBlockInfo } from "@/lib/bitcoin";
import { getSigningTrail } from "@/lib/signing-audit";
import { getInclusionProof } from "@/lib/translog";
import { TopBar } from "@/components/TopBar";
import { ProofCertificate, type ProofData } from "@/components/ProofCertificate";
import { Button } from "@/components/ui/button";
import { canonicalProofQuery, coIssuersFor, readSidecar } from "@/lib/proofs";

export const dynamic = "force-dynamic";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

// Pull the predicate type (SPDX / CycloneDX / SLSA / …) out of a stored
async function attestationPredicateType(rec: { id: string; sha256: string }): Promise<string> {
  try {
    const raw = await readSidecar(rec, "attestation.bundle");
    if (!raw) return "";
    const bundle = JSON.parse(raw);
    const payloadB64 = bundle?.dsseEnvelope?.payload;
    if (!payloadB64) return "";
    const stmt = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    return typeof stmt?.predicateType === "string" ? stmt.predicateType : "";
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const { hash } = await params;
  return { title: `Proof · ${hash.slice(0, 12)}… · Let's Seal`, robots: { index: false, follow: false } };
}

export default async function ProofPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const ref = hash.toLowerCase();

  const orgInc = { include: { tenant: { select: { verifiedDomain: true, domainVerifiedVia: true } } } } as const;
  const include = { envelope: { include: { org: orgInc, _count: { select: { audit: true } } } }, org: orgInc } as const;
  let rec = isHash(ref)
    ? await db.sealedDocument.findFirst({ ...canonicalProofQuery(ref), include })
    : await db.sealedDocument.findUnique({ where: { envelopeId: hash }, include });

  if (!rec && !isHash(ref)) {
    rec = await db.sealedDocument.findUnique({ where: { id: hash }, include });
  }

  if (!rec && !isHash(ref)) {
    const cred = await db.credential.findUnique({ where: { id: hash }, select: { sha256: true } });
    if (cred?.sha256) rec = await db.sealedDocument.findFirst({ ...canonicalProofQuery(cred.sha256), include });
  }

  if (!rec && isHash(ref)) {
    const anchor = await db.anchor.findUnique({ where: { sha256: ref } });
    if (anchor) return <TimestampProof anchor={anchor} />;
  }

  if (!rec) return <NotAProof reason="No sealed document or timestamp on record matches this reference." sha={hash} />;
  const sha256 = rec.sha256;
  const detached = rec.sealType === "detached";
  const isC2pa = rec.sealType === "c2pa";
  const isXmlSeal = rec.sealType === "xmldsig";
  const isSmimeSeal = rec.sealType === "smime";
  const isBlobSeal = rec.sealType === "blob";
  const isIdentitySeal = rec.sealType === "identity";
  const isAttestation = rec.sealType === "attestation";

  let crypto: ProofData["crypto"] = { sealed: true, onRecordOnly: true };
  const key = detached || isBlobSeal || isIdentitySeal || isAttestation ? null : rec.pdfPath; 
  const docOnFile = key ? await fileExists(key) : false;
  if (detached || isBlobSeal || isIdentitySeal || isAttestation) {
    crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN };
  } else if (isC2pa) {
    if (docOnFile && key) {
      try {
        const v = await verifyC2pa(await readFile(key));
        crypto = { sealed: v.sealed, intact: v.valid, valid: v.valid, trusted: v.trusted, signer: v.signer, onRecordOnly: false };
      } catch { crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN }; }
    } else {
      crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN };
    }
  } else if (isXmlSeal) {
    if (docOnFile && key) {
      try {
        const v = await verifyXml(await readFile(key));
        crypto = { sealed: v.sealed, intact: v.valid, valid: v.valid, trusted: v.trusted, signer: v.signer, onRecordOnly: false };
      } catch { crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN }; }
    } else {
      crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN };
    }
  } else if (isSmimeSeal) {
    if (docOnFile && key) {
      try {
        const v = await verifySmime(await readFile(key));
        crypto = { sealed: v.sealed, intact: v.valid, valid: v.valid, trusted: v.trusted, signer: v.signer, onRecordOnly: false };
      } catch { crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN }; }
    } else {
      crypto = { sealed: true, onRecordOnly: true, signer: rec.certCN };
    }
  } else if (docOnFile && key) {
    try {
      const v = await verifyPdf(await readFile(key));
      crypto = {
        sealed: v.sealed, intact: v.intact, valid: v.valid, trusted: v.trusted,
        signer: v.signer, signed_at: v.signed_at, onRecordOnly: false,
        revoked: v.revoked ?? null,
      };
    } catch {  }
  }

  let anchorState = rec.anchorState;
  let btcBlock = rec.btcBlock;
  if (anchorState === "pending" && rec.otsProof) {
    try {
      const up = await upgradeAnchor(rec.otsProof);
      if (up.status.state === "confirmed") {
        anchorState = "confirmed";
        btcBlock = up.status.bitcoin_block ?? null;
        await db.sealedDocument.update({
          where: { id: rec.id },
          data: { anchorState: "confirmed", btcBlock, otsProof: up.ots_b64 },
        });
      }
    } catch {  }
  }
  const block = anchorState === "confirmed" && btcBlock != null ? await getBlockInfo(btcBlock) : null;

  const trail = rec.envelopeId ? await getSigningTrail(rec.envelopeId) : null;

  const cred = rec.source === "credential"
    ? await db.credential.findUnique({ where: { sha256 } })
    : null;

  const uid = await apiUser();
  const orgId = rec.org?.id ?? rec.envelope?.org.id ?? null;
  const orgSlug = rec.org?.slug ?? rec.envelope?.org.slug ?? null;
  const viewerIsIssuer = !!(uid && orgId) && !!(await db.membership.findFirst({ where: { userId: uid, orgId }, select: { id: true } }));
  const isCredential = !!cred;
  const rawTitle = rec.title ?? rec.envelope?.title ?? null;
  const hasTrail = !!trail && trail.signers.length > 0;
  const gateContent = !viewerIsIssuer && !isCredential; 
  const gate = !viewerIsIssuer && ((gateContent && !!rawTitle) || hasTrail)
    ? { hash: sha256, hasTrail }
    : null;

  const data: ProofData = {
    sha256,
    onRecord: true,
    issuer: rec.org?.name ?? rec.envelope?.org.name ?? null,
    verification: (() => {
      const o = rec.org ?? rec.envelope?.org ?? null;
      if (!o) return null;
      const dom = o.tenant?.verifiedDomain ?? null;
      return dom
        ? { verified: true as const, domain: dom, via: o.tenant?.domainVerifiedVia ?? null }
        : { verified: false as const, domain: null, via: null };
    })(),
    suspended: (rec.org ?? rec.envelope?.org)?.status === "suspended",
    suspendedReason: (rec.org ?? rec.envelope?.org)?.suspendedReason ?? null,
    orgSlug,
    title: gateContent ? null : rawTitle,
    completedAt: (rec.envelope?.completedAt ?? rec.sealedAt).toISOString(),
    auditEvents: rec.envelope?._count.audit ?? 0,
    alsoSealedBy: (await coIssuersFor(sha256, rec.id)).map((c) => ({
      ...c,
      sealedAt: c.sealedAt.toISOString(),
    })),
    crypto,
    anchor: { state: anchorState, btcBlock, blockHash: block?.hash ?? null, blockTime: block?.time ?? null },
    otsUrl: rec.otsProof ? (rec.envelopeId ? `/api/file/${rec.envelopeId}?variant=ots` : `/api/anchor/${sha256}`) : null,
    sigUrl: detached ? `/api/seal/${sha256}/sig` : null,
    imageUrl: isC2pa ? `/api/seal/${sha256}/image` : null,
    xmlUrl: isXmlSeal ? `/api/seal/${sha256}/xml` : null,
    emlUrl: isSmimeSeal ? `/api/seal/${sha256}/eml` : null,
    artifactUrl: isBlobSeal || isIdentitySeal ? `/api/seal/${sha256}/artifact` : null,
    identity: isIdentitySeal
      ? { email: rec.certCN, provider: rec.oidcProvider, issuer: rec.oidcIssuer }
      : null,
    attestation: isAttestation
      ? { predicateType: await attestationPredicateType(rec), bundleUrl: `/api/seal/${sha256}/artifact` }
      : null,
    log: await getInclusionProof({ sha256 }).then((p) => (p ? { index: p.index, treeSize: p.treeSize } : null)).catch(() => null),
    trail: viewerIsIssuer ? trail : null,
    credential: cred ? {
      recipientName: cred.recipientName,
      credType: cred.credType,
      title: cred.title,
      description: cred.description,
      credentialCode: cred.credentialCode,
      issuedOn: cred.issuedOn.toISOString(),
      expiresOn: cred.expiresOn?.toISOString() ?? null,
      revokedAt: cred.revokedAt?.toISOString() ?? null,
      revokedReason: cred.revokedReason,
    } : null,
  };

  return (
    <div className="min-h-screen">
      <TopBar href="/" />
      <main className="mx-auto max-w-3xl px-6 py-12">
        {viewerIsIssuer && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">This is the <b>public</b> proof — anyone with the link sees only the hash &amp; timestamp.</span>
            <div className="ml-auto flex items-center gap-2">
              {orgSlug && (
                <Button asChild variant="ghost" size="sm" className="gap-1.5">
                  <Link href={`/${orgSlug}/documents`}><ArrowLeft className="h-3.5 w-3.5" /> Back to documents</Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="gap-1.5"
                      title="Every proof, the pinned root and the commands to check them, in one file">
                <a href={`/api/d/${sha256}/evidence`}><FileArchive className="h-3.5 w-3.5" /> Evidence bundle</a>
              </Button>
              {docOnFile && (
                <Button asChild size="sm" className="gap-1.5">
                  <a href={`/api/documents/${sha256}`} target="_blank"><Download className="h-3.5 w-3.5" /> Download sealed copy</a>
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public proof of authenticity</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {isC2pa ? "Media proof" : isXmlSeal ? "XML proof" : isSmimeSeal ? "Email proof" : isIdentitySeal ? "Identity proof" : isAttestation ? "Attestation proof" : isBlobSeal ? "Artifact proof" : detached ? "File proof" : "Document proof"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isC2pa
              ? "A permanent record that this file carries signed Content Credentials (C2PA) and is timestamped. Download the signed file and verify it in any C2PA-aware tool."
              : isXmlSeal
                ? "A permanent record that this XML document carries an embedded XML-DSig signature and is timestamped. Download the signed XML and verify it with any XML Signature tool."
                : isSmimeSeal
                  ? "A permanent record that this email message carries an S/MIME signature and is timestamped. Download the signed message and verify it with any S/MIME tool (openssl smime -verify)."
                  : isIdentitySeal
                    ? "A permanent record that this artifact was signed under a third-party-verified identity and is timestamped. The signer's email was verified by their identity provider (Google/GitHub/…), not by Let's Seal. Download the cosign signature set or drop the artifact to verify."
                    : isAttestation
                    ? "A permanent record of a signed attestation about this artifact — an SBOM or provenance claim bound to its digest and timestamped. Download the cosign bundle and verify it with cosign verify-blob-attestation, or drop the artifact to confirm it's the attestation's subject."
                    : isBlobSeal
                    ? "A permanent record that this artifact is signed and timestamped. Download the cosign signature set and verify it with sealbot, openssl, or stock cosign verify-blob."
                    : detached
                      ? "A permanent record that this file is sealed and timestamped. Download the .sig and confirm it hasn't been altered by uploading the file."
                      : "A permanent record that this document is sealed and timestamped. The subject and signer details stay private — unlock them by uploading the file."}
          </p>
        </div>
        <ProofCertificate data={data} gate={gate} />
      </main>
    </div>
  );
}

async function TimestampProof({
  anchor,
}: { anchor: { id: string; sha256: string; label: string | null; otsProof: string | null; anchorState: string; btcBlock: number | null } }) {
  let anchorState = anchor.anchorState;
  let btcBlock = anchor.btcBlock;
  if (anchorState === "pending" && anchor.otsProof) {
    try {
      const up = await upgradeAnchor(anchor.otsProof);
      if (up.status.state === "confirmed") {
        anchorState = "confirmed";
        btcBlock = up.status.bitcoin_block ?? null;
        await db.anchor.update({ where: { id: anchor.id }, data: { anchorState: "confirmed", btcBlock, otsProof: up.ots_b64 } });
      }
    } catch {  }
  }
  const block = anchorState === "confirmed" && btcBlock != null ? await getBlockInfo(btcBlock) : null;

  const data: ProofData = {
    sha256: anchor.sha256,
    onRecord: false,
    title: anchor.label,
    crypto: { sealed: false },
    anchor: { state: anchorState, btcBlock, blockHash: block?.hash ?? null, blockTime: block?.time ?? null },
    otsUrl: anchor.otsProof ? `/api/anchor/${anchor.sha256}` : null,
  };

  return (
    <div className="min-h-screen">
      <TopBar href="/" />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public timestamp proof</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Independent timestamp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A file&apos;s fingerprint anchored to a decentralised public ledger. Anyone can open this straight from the link — the fingerprint alone is enough.
          </p>
        </div>
        <ProofCertificate data={data} variant="timestamp" />
      </main>
    </div>
  );
}

function NotAProof({ reason, sha }: { reason: string; sha?: string }) {
  return (
    <div className="min-h-screen">
      <TopBar href="/" />
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">No proof found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
        {sha && <code className="mt-3 block break-all font-mono text-xs text-muted-foreground/70">{sha}</code>}
        <div className="mt-6">
          <Button asChild variant="outline"><Link href="/verify">Verify a file instead</Link></Button>
        </div>
      </main>
    </div>
  );
}
