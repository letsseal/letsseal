import { ROOT_CA_PEM, ROOT_CA_FINGERPRINT_SHA256, ROOT_CA_SUBJECT } from "@/lib/trust";
import { makeZip, type ZipEntry } from "@/lib/zip";

const APP_URL = process.env.APP_URL ?? "https://letsseal.org";

export type BundleResult = { zip: Uint8Array; filename: string };

export type Claim = { claim: string; state: string; evidence: string | null; detail?: string };

export type SealRecord = {
  sha256: string;
  certCN: string;
  sealType: string;
  sealedAt: Date;
  title: string | null;
  detachedSig: string | null;
  proofCode: string | null;
  otsProof: string | null;
  anchorState: string;
  anchorProvider: string;
  btcBlock: number | null;
  oidcProvider: string | null;
  oidcIssuer: string | null;
  orgName: string | null;
  verifiedDomain: string | null;
  envelope: { title: string; sequential: boolean; signers: unknown[] } | null;
};

export type EvidenceInput = {
  rec: SealRecord;
  pdfBytes: Uint8Array | null;
  log: { proof: { index: number; treeSize: number } & Record<string, unknown>; sth: unknown } | null;
  auditEvents: unknown[] | null;
  revocations: unknown | null;
};

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function composeBundle(input: EvidenceInput): BundleResult {
  const { rec, pdfBytes, log, auditEvents, revocations } = input;
  const title = rec.title ?? rec.envelope?.title ?? "sealed document";
  const entries: ZipEntry[] = [];
  const claims: Claim[] = [];

  let documentFile: string | null = null;
  if (pdfBytes) {
    documentFile = "document.sealed.pdf";
    entries.push({ name: documentFile, data: pdfBytes });
    claims.push({
      claim: "The sealed document, carrying its signature",
      state: "included",
      evidence: documentFile,
      detail: "A PAdES signature covering the entire file, embedded in the PDF.",
    });
  } else if (rec.detachedSig) {
    documentFile = "signature.sig";
    entries.push({ name: documentFile, data: new Uint8Array(Buffer.from(rec.detachedSig, "base64")) });
    claims.push({
      claim: "The detached signature over the artifact",
      state: "included",
      evidence: documentFile,
      detail: "A CAdES/CMS signature over the artifact's SHA-256. Pair it with the artifact you hold.",
    });
  } else {
    claims.push({
      claim: "The sealed document itself",
      state: "held by the parties",
      evidence: null,
      detail: "The proof is retained permanently and is what this bundle carries. "
            + "Pair it with the copy of the document you hold: if it hashes to the digest in evidence.json, it is the sealed document.",
    });
  }

  if (rec.otsProof) {
    const otsName = documentFile === "document.sealed.pdf" ? "document.sealed.pdf.ots" : `${rec.sha256}.ots`;
    entries.push({ name: otsName, data: new Uint8Array(Buffer.from(rec.otsProof, "base64")) });
    claims.push({
      claim: "The document existed by a given moment on the public ledger",
      state: rec.anchorState === "confirmed"
        ? `confirmed${rec.btcBlock ? ` in block ${rec.btcBlock}` : ""}`
        : rec.anchorState,
      evidence: otsName,
      detail: rec.anchorState === "confirmed"
        ? "The proof commits this digest to a block on the public ledger. `ots verify` establishes it independently."
        : "The calendar has accepted the digest and the attestation is settling. Running `ots upgrade` on the "
        + "proof, or re-downloading this bundle once it confirms, yields the ledger attestation.",
    });
  }

  entries.push({ name: "letsseal-root.crt", data: ROOT_CA_PEM });
  claims.push({
    claim: "The signing certificate chains to a published root",
    state: "included",
    evidence: "letsseal-root.crt",
    detail: `Root subject ${ROOT_CA_SUBJECT}, SHA-256 fingerprint ${ROOT_CA_FINGERPRINT_SHA256}. `
          + `The same certificate is published at ${APP_URL}/api/root-ca and at ${APP_URL}/trust.`,
  });

  if (log) {
    entries.push({ name: "transparency-log/inclusion-proof.json", data: json(log.proof) });
    entries.push({ name: "transparency-log/signed-tree-head.json", data: json(log.sth) });
    claims.push({
      claim: "The seal is recorded in the public transparency log",
      state: `included at index ${log.proof.index} of ${log.proof.treeSize}`,
      evidence: "transparency-log/inclusion-proof.json",
      detail: "Standard RFC 6962 arithmetic verifies the proof against the tree head. "
            + "The log's history is itself anchored to the public ledger, so it cannot be rewritten behind you.",
    });
  } else {
    claims.push({
      claim: "The seal is recorded in the public transparency log",
      state: "not fetched when this bundle was built",
      evidence: null,
      detail: `Fetch it directly: ${APP_URL}/api/log/proof?sha256=${rec.sha256}, and the tree head at ${APP_URL}/api/log/sth.`,
    });
  }

  if (auditEvents && rec.envelope) {
    entries.push({
      name: "audit-trail.json",
      data: json({
        envelopeTitle: rec.envelope.title,
        sequential: rec.envelope.sequential,
        signers: rec.envelope.signers,
        chain: "Each event commits to the one before it: sha256(prevHash + event). Recomputing the chain detects any later edit.",
        events: auditEvents,
      }),
    });
    claims.push({
      claim: "The order of events during signing",
      state: `${auditEvents.length} events`,
      evidence: "audit-trail.json",
      detail: "A hash-linked chain, ordered by position rather than by clock, so two events in the same millisecond still have a defined order.",
    });
  }

  if (revocations) {
    entries.push({
      name: "revocations.json",
      data: json({
        note: `A snapshot taken when this bundle was built. The live list is published at ${APP_URL}/revocations.json.`,
        ...(revocations as object),
      }),
    });
  }
  claims.push({
    claim: "The signing certificate stands unrevoked",
    state: revocations ? "checked at export" : "check the published list",
    evidence: revocations ? "revocations.json" : null,
    detail: `The live list is at ${APP_URL}/revocations.json. Reasons carry meaning: a compromise reaches every seal under the certificate, `
          + "while an orderly retirement leaves seals made before that date standing, which is what the anchor establishes independently.",
  });

  const summary = {
    document: {
      title,
      sha256: rec.sha256,
      sealType: rec.sealType,
      sealedAt: rec.sealedAt.toISOString(),
      proofPage: `${APP_URL}/d/${rec.sha256}`,
      proofCode: rec.proofCode,
    },
    issuer: {
      certificateCommonName: rec.certCN,
      organisation: rec.orgName,
      verifiedDomain: rec.verifiedDomain,
      identityBasis: rec.verifiedDomain
        ? "Control of the domain above was demonstrated to the CA and is bound into the signing certificate."
        : "The issuer name is the account's own, carried in the certificate as a self-asserted label.",
      ...(rec.oidcProvider ? { verifiedEmailProvider: rec.oidcProvider, oidcIssuer: rec.oidcIssuer } : {}),
    },
    anchor: { state: rec.anchorState, provider: rec.anchorProvider, block: rec.btcBlock },
    claims,
    standard: `${APP_URL}/SPEC.md`,
    certificatePolicy: "https://github.com/letsseal/letsseal/blob/main/CPS.md",
  };
  entries.unshift({ name: "evidence.json", data: json(summary) });
  entries.unshift({ name: "VERIFY.md", data: verifyGuide(rec.sha256, documentFile, !!rec.otsProof) });
  entries.unshift({ name: "README.md", data: readme(title, rec.sha256, claims) });

  return {
    zip: makeZip(entries, rec.sealedAt),
    filename: `letsseal-evidence-${rec.sha256.slice(0, 12)}.zip`,
  };
}

function readme(title: string, sha256: string, claims: Claim[]): string {
  const rows = claims.map((c) => `| ${c.claim} | ${c.state} | ${c.evidence ?? "see evidence.json"} |`).join("\n");
  return `# Evidence bundle

**Document:** ${title}
**SHA-256:** \`${sha256}\`

This bundle carries everything required to establish what this document is and when
it existed. Every check runs on public standards with widely available tools, and
none of them contacts Let's Seal. That is deliberate: evidence is worth what it is
worth when the party holding it is unavailable, uncooperative, or gone.

## What is established, and by what

| Claim | State | Material |
|---|---|---|
${rows}

## Where to start

Read **VERIFY.md**. It gives the exact commands, in order, for checking each claim
yourself. **evidence.json** carries the same information in machine-readable form.

## What each claim means

**Integrity.** The signature covers the entire file. A single changed byte breaks it,
which is what makes an unaltered document distinguishable from an altered one.

**Time.** The document's digest is committed to a public ledger that nobody owns. The
ledger's record places the document before a given block, and that record is
checkable by anyone, permanently, without reference to Let's Seal or to any
timestamping authority remaining in business.

**Issuer.** The signature identifies the certificate that made it. Where the issuer
demonstrated control of a domain, that domain is bound into the certificate itself,
so an off-platform verifier reads it straight from the signature.

**Transparency.** The seal is recorded in a public, append-only log, and the proof of
its inclusion is here. The log's own history is anchored to the public ledger.

## The standard

The format and the verification algorithm are published as SEAL. Section 8 states,
normatively, what counts as authentic: a signature that is valid, over intact bytes,
chaining to the published root.
`;
}

function verifyGuide(sha256: string, documentFile: string | null, hasAnchor: boolean): string {
  const doc = documentFile ?? "<your copy of the document>";
  const otsFile = documentFile === "document.sealed.pdf" ? "document.sealed.pdf.ots" : `${sha256}.ots`;
  return `# Verifying this bundle yourself

Every command below runs against public standards, with no Let's Seal service
involved. Tools: \`sha256sum\` (or \`shasum\`), the OpenTimestamps client \`ots\`, and
any PDF reader. Each is free and independently maintained.

## 1. The document is the one this bundle describes

\`\`\`
sha256sum ${doc}
\`\`\`

Expected:

\`\`\`
${sha256}
\`\`\`

This single line ties everything else in the bundle to the file in your hands. On
macOS, \`shasum -a 256\` prints the same value.

${hasAnchor ? `## 2. The document existed by the anchored date

Install the client (\`pip install opentimestamps-client\`), then:

\`\`\`
ots verify ${otsFile}
\`\`\`

The client reads the public ledger and reports the block the digest was committed
in, together with that block's time. A pending result means the attestation is
still settling: run \`ots upgrade\` on the proof and verify again.

Worth holding on to: this step involves the ledger and your own client. It holds
whether or not Let's Seal exists on the day you run it.

` : ""}## ${hasAnchor ? "3" : "2"}. The signature is valid and covers the whole file

Open \`document.sealed.pdf\` in any PDF reader with a signature panel. The reader
reports the signature as valid and covering the entire document.

The reader shows the signer as unrecognised until the published root is added to its
trust list, because trust here is pinned by the verifier rather than granted by a
vendor list. Add \`letsseal-root.crt\` from this bundle, and confirm its SHA-256
fingerprint against the value published at https://letsseal.org/trust. That
fingerprint check establishes the root, and everything else follows from it.

Command line, for a detached seal:

\`\`\`
openssl cms -verify -inform DER -in signature.sig -content <artifact> \\
  -binary -CAfile letsseal-root.crt
\`\`\`

\`-binary\` matters: it stops OpenSSL applying text canonicalisation before hashing,
and the seal is over the file's raw bytes.

## ${hasAnchor ? "4" : "3"}. The seal is in the public transparency log

\`transparency-log/inclusion-proof.json\` holds the leaf's index, the audit path and
the tree size. Verify it against the tree head in
\`transparency-log/signed-tree-head.json\` using standard RFC 6962 arithmetic: hash
the leaf, fold in each element of the path in order, and the result equals the tree
head's root hash.

Leaves are \`SHA-256(0x00 || payload)\` and interior nodes are
\`SHA-256(0x01 || left || right)\`, exactly as in RFC 6962.

Consistency between two tree sizes is served at
https://letsseal.org/api/log/consistency, which is how the log is shown never to
have been rewritten.

## ${hasAnchor ? "5" : "4"}. The certificate stands unrevoked

\`revocations.json\` is the position at the time of export. The live list is at
https://letsseal.org/revocations.json.

Each entry carries a reason, and the reason decides its reach. A key compromise
reaches every seal under that certificate whatever its date. An orderly retirement
leaves seals made before the revocation date standing, and the anchor is the
independent evidence of which side of that date this document falls.

## If a step disagrees with this bundle

The specification governs, and it is published at https://letsseal.org/SPEC.md.
Section 8 states the verification algorithm normatively. Reports of a discrepancy
are wanted: https://github.com/letsseal/letsseal.
`;
}
