import { Anchor, ShieldCheck, ShieldAlert, Building2, Clock, Download, ExternalLink, FileText, Users, Mail, Link2, Contact, AlertTriangle, Award, Ban } from "lucide-react";
import { SealMark } from "@/components/brand/SealMark";
import { EXPLORER_BLOCK } from "@/lib/bitcoin";
import type { SigningTrail } from "@/lib/signing-audit";
import { RevealDetails } from "@/components/RevealDetails";

export type ProofData = {
  sha256: string;
  onRecord: boolean;
  issuer?: string | null;
  title?: string | null;
  completedAt?: string | null;
  auditEvents?: number;
  crypto: {
    sealed: boolean; intact?: boolean; valid?: boolean; trusted?: boolean;
    signer?: string; signed_at?: string;
    onRecordOnly?: boolean;
  };
  anchor?: { state: string; btcBlock: number | null; blockHash?: string | null; blockTime?: string | null } | null;
  otsUrl?: string | null;
  sigUrl?: string | null;
  imageUrl?: string | null;
  xmlUrl?: string | null;
  emlUrl?: string | null;
  artifactUrl?: string | null;
  identity?: { email: string; provider?: string | null; issuer?: string | null } | null;
  attestation?: { predicateType: string; bundleUrl: string } | null;
  log?: { index: number; treeSize: number } | null;
  trail?: SigningTrail | null; 
  credential?: {
    recipientName: string; credType: string; title: string; description?: string | null;
    credentialCode?: string | null; issuedOn: string; expiresOn?: string | null;
    revokedAt?: string | null; revokedReason?: string | null;
  } | null;
};

const PREDICATES: Record<string, { label: string; type: string }> = {
  "https://spdx.dev/Document": { label: "SPDX SBOM", type: "spdxjson" },
  "https://cyclonedx.org/bom": { label: "CycloneDX SBOM", type: "cyclonedx" },
  "https://slsa.dev/provenance/v1": { label: "SLSA provenance", type: "slsaprovenance1" },
  "https://cosign.sigstore.dev/attestation/vuln/v1": { label: "vulnerability scan", type: "vuln" },
};
function predicateLabel(uri: string): string {
  return PREDICATES[uri]?.label ?? (uri ? "custom" : "supply-chain");
}
function predicateCosignType(uri: string): string {
  return PREDICATES[uri]?.type ?? "custom";
}

function CredentialCard({ c }: { c: NonNullable<ProofData["credential"]> }) {
  const revoked = !!c.revokedAt;
  const expired = !revoked && c.expiresOn && new Date(c.expiresOn) < new Date();
  return (
    <div className="rounded-2xl border bg-card p-5">
      {revoked && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Revoked by the issuer</b>{c.revokedAt ? ` on ${new Date(c.revokedAt).toLocaleDateString()}` : ""}
            {c.revokedReason ? ` — ${c.revokedReason}` : ""}. The seal still proves it was genuinely issued and unaltered; the issuer has since withdrawn it.</span>
        </div>
      )}
      {expired && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Clock className="h-4 w-4 shrink-0" /> This credential expired on {new Date(c.expiresOn!).toLocaleDateString()}.
        </div>
      )}
      <div className="flex items-center gap-2 text-sm font-medium">
        <Award className="h-4 w-4 text-brand" /> {c.credType}
      </div>
      <div className="mt-3">
        <div className="text-xs text-muted-foreground">Issued to</div>
        <div className="text-lg font-semibold">{c.recipientName}</div>
      </div>
      <div className="mt-3 divide-y">
        <Row label="Credential">{c.title}</Row>
        {c.description && <Row label="Details">{c.description}</Row>}
        {c.credentialCode && <Row label="Reference">{c.credentialCode}</Row>}
        <Row label="Issued">{new Date(c.issuedOn).toLocaleDateString()}</Row>
        {c.expiresOn && <Row label="Expires">{new Date(c.expiresOn).toLocaleDateString()}</Row>}
      </div>
    </div>
  );
}

const CHANNEL = {
  email: { icon: Mail, label: "Signed via emailed link" },
  link: { icon: Link2, label: "Signed via shared link" },
  in_person: { icon: Contact, label: "Signed in person" },
} as const;

const ACTION_LABEL: Record<string, string> = {
  sent: "Envelope sent", invite_sent: "Invite emailed to signer", viewed: "Opened by signer",
  field_filled: "Field completed", signed: "Signed", sealed: "Sealed",
  anchored: "Timestamp submitted", anchor_confirmed: "Timestamp confirmed",
};

// Tier-1 attribution: how each party was bound to the signing, plus the
// tamper-evident trail. This is control-of-channel evidence, NOT identity proof —
// stated plainly so the claim stays defensible.
function SigningTrailCard({ trail }: { trail: SigningTrail }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4 text-muted-foreground" /> Signers &amp; audit trail
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        How each party reached and signed the document, recorded in a tamper-evident log.
      </p>

      {trail.sharedSession && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Two or more signers signed from the same network. Attribution to distinct parties is weaker for this document.</span>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {trail.signers.map((s, i) => {
          const ch = CHANNEL[s.channel];
          const Icon = ch.icon;
          return (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="h-3 w-3" /> {ch.label}{s.email ? ` · ${s.email}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                {s.signedAt ? new Date(s.signedAt).toLocaleString() : "not signed"}
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Full audit trail ({trail.entries.length} events) ·{" "}
          <span className={trail.chainIntact ? "text-emerald-600" : "text-red-600"}>
            {trail.chainIntact ? "chain intact" : "chain broken"}
          </span>
        </summary>
        <ol className="mt-2 space-y-1 border-l pl-3">
          {trail.entries.map((e, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{ACTION_LABEL[e.action] ?? e.action}</span>
              {" · "}{e.actorName}{" · "}{new Date(e.at).toLocaleString()}
            </li>
          ))}
        </ol>
      </details>

      <p className="mt-3 text-xs text-muted-foreground">
        Attribution reflects <b>control of the signing channel</b> — a link sent to the signer&apos;s email, say —
        recorded tamper-evidently. It shows who held the channel, not a verified legal identity.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

// The public "certificate of proof". For a sealed document it leads with two
// trust layers (cryptographic seal + independent timestamp); for a bare "anchor
// anything" timestamp it shows just the independent timestamp.
export function ProofCertificate({ data, variant = "document", gate }: {
  data: ProofData;
  variant?: "document" | "timestamp";
  gate?: { hash: string; hasTrail: boolean } | null;
}) {
  const sealed = data.crypto.sealed;
  const onRecordOnly = data.crypto.onRecordOnly === true;
  const intact = data.crypto.intact !== false;
  const valid = data.crypto.valid !== false;
  const trusted = data.crypto.trusted === true;
  // "Authentic" REQUIRES the seal to chain to the Let's Seal CA. A cryptographically
  // valid signature from an unrecognized (e.g. self-signed) certificate is a forgery
  // vector — NOT an authentic document — so the verdict gates on `trusted`, never on
  // sealed+intact alone. onRecordOnly docs were sealed by us (provenance implies trust),
  // so their live re-check isn't available and the record itself vouches for them.
  const authentic = sealed && intact && valid && trusted;
  const sealOk = onRecordOnly ? sealed : authentic;
  const anchored = data.anchor && data.anchor.state !== "none";
  const confirmed = data.anchor?.state === "confirmed";
  const isTimestamp = variant === "timestamp";
  const anchorOk = isTimestamp && anchored;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-4">
          <SealMark className="h-14 w-14 shrink-0" color={(isTimestamp ? anchorOk : sealOk) ? "var(--brand)" : "#a1a1aa"} />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">
              {isTimestamp
                ? (confirmed ? "Independent timestamp recorded" : "Timestamp pending")
                : onRecordOnly
                  ? "Sealed & timestamped"
                  : authentic ? "Authentic & unaltered"
                    : !sealed ? "Not a sealed document"
                      : !trusted ? "Unrecognized seal — not from Let's Seal"
                        : "Tampered since sealing"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isTimestamp
                ? (confirmed
                    ? "This file's fingerprint is permanently recorded on an independent public ledger — proof it existed by this date."
                    : "This file's fingerprint is being recorded as an independent timestamp — confirming (~a few hours).")
                : onRecordOnly
                  ? "On record as sealed by the issuer and anchored. Upload the file to confirm it hasn't been altered."
                  : authentic
                    ? "This document carries a valid Let's Seal seal and has not been modified."
                    : !sealed
                      ? "No signature was found in this file."
                      : !trusted
                        ? "This file is signed, but not by a Let's Seal certificate — its seal is not recognized and must not be trusted as issued through Let's Seal."
                        : "The seal is present but the contents changed after sealing — do not trust this copy."}
              {isTimestamp && data.title && <> · <span className="font-medium">{data.title}</span></>}
            </p>
          </div>
        </div>
      </div>

      {!isTimestamp && data.credential && <CredentialCard c={data.credential} />}

      <div className={isTimestamp ? "" : "grid gap-4 md:grid-cols-2"}>
        {!isTimestamp && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            {sealOk ? <ShieldCheck className="h-4 w-4 text-brand" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
            Cryptographic seal
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Shows the sealing certificate and that the file is byte-for-byte intact.</p>
          <div className="mt-3 divide-y">
            <Row label="Issuer">{data.crypto.signer?.split(",")[0]?.replace(/^Common Name:\s*/, "") ?? data.issuer ?? "—"}</Row>
            <Row label="Sealed">
              {data.crypto.signed_at
                ? new Date(data.crypto.signed_at).toLocaleString()
                : data.completedAt ? new Date(data.completedAt).toLocaleString() : "—"}
            </Row>
            <Row label="Integrity">
              {onRecordOnly
                ? <span className="text-muted-foreground">Upload file to verify</span>
                : <span className={intact ? "text-emerald-600" : "text-red-600"}>{intact ? "Intact" : "Altered"}</span>}
            </Row>
            {!onRecordOnly && (
              <Row label="Chain of trust">
                <span className={trusted ? "text-emerald-600" : "text-red-600"}>
                  {trusted ? "Chains to Let's Seal CA" : "Not issued by Let's Seal"}
                </span>
              </Row>
            )}
          </div>
          {!onRecordOnly && (
            <p className="mt-3 text-xs text-muted-foreground">
              The issuer name is claimed by the sealing certificate — it is <b>not</b> identity-verified by Let&apos;s Seal.
            </p>
          )}
        </div>
        )}

        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Anchor className="h-4 w-4 text-brand" /> Independent timestamp
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Independent proof it existed by a certain date — no authority required.</p>
          {anchored ? (
            <div className="mt-3 divide-y">
              <Row label="Status">
                {confirmed
                  ? <span className="text-emerald-600">Confirmed on-chain</span>
                  : <span className="inline-flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3" />Confirming (~hours)</span>}
              </Row>
              {confirmed && data.anchor?.btcBlock != null && (
                <>
                  <Row label="Block">
                    <a href={EXPLORER_BLOCK(data.anchor.btcBlock)} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-brand hover:underline">
                      #{data.anchor.btcBlock} <ExternalLink className="h-3 w-3" />
                    </a>
                  </Row>
                  {data.anchor.blockTime && <Row label="Block time">{new Date(data.anchor.blockTime).toLocaleString()}</Row>}
                </>
              )}
              <Row label="Method">OpenTimestamps</Row>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Not anchored.</p>
          )}
          {data.otsUrl && (
            <a href={data.otsUrl}
               className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download .ots proof
            </a>
          )}
        </div>
      </div>

      {!isTimestamp && data.onRecord && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-muted-foreground" /> On record
          </div>
          <div className="mt-3 divide-y">
            {data.issuer && <Row label="Business">{data.issuer}</Row>}
            {data.title && <Row label="Document">{data.title}</Row>}
            {data.completedAt && <Row label="Completed">{new Date(data.completedAt).toLocaleDateString()}</Row>}
            {typeof data.auditEvents === "number" && <Row label="Audit events">{data.auditEvents}</Row>}
          </div>
        </div>
      )}

      {!isTimestamp && data.trail && data.trail.signers.length > 0 && (
        <SigningTrailCard trail={data.trail} />
      )}

      {!isTimestamp && gate && <RevealDetails hash={gate.hash} hasTrail={gate.hasTrail} />}

      <div className="rounded-2xl border bg-muted/40 p-5">
        <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-muted-foreground" /> {isTimestamp ? "File" : "Document"} fingerprint (SHA-256)</div>
        <code className="mt-2 block break-all font-mono text-xs text-muted-foreground">{data.sha256}</code>
        {data.sigUrl && (
          <div className="mt-3">
            <a href={data.sigUrl}
               className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download .sig signature
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              Save it beside your file and verify anywhere, with no Let&apos;s Seal server:{" "}
              <code className="rounded bg-background px-1 py-0.5 font-mono">openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt</code>
            </p>
          </div>
        )}
        {data.imageUrl && (
          <div className="mt-3">
            <a href={data.imageUrl}
               className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download signed file
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              The file carries embedded <b>Content Credentials</b> (C2PA). Open it in any C2PA-aware tool
              (Adobe, the Content Credentials verifier) to see the issuer and confirm it&apos;s unaltered.
            </p>
          </div>
        )}
        {data.xmlUrl && (
          <div className="mt-3">
            <a href={data.xmlUrl}
               className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download signed XML
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              The XML carries an embedded <b>XML-DSig</b> signature. Verify it with any XML Signature tool,
              e.g. <code className="rounded bg-background px-1 py-0.5 font-mono">xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml</code>
            </p>
          </div>
        )}
        {data.emlUrl && (
          <div className="mt-3">
            <a href={data.emlUrl}
               className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download signed message
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              The message carries a standard <b>S/MIME</b> signature. Verify it with any S/MIME tool,
              e.g. <code className="rounded bg-background px-1 py-0.5 font-mono">openssl smime -verify -in message.eml -CAfile letsseal-root.crt</code>
            </p>
          </div>
        )}
        {data.identity && (
          <div className="mt-3 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verified identity</p>
            <p className="mt-1 text-sm">
              Signed by <b className="font-mono">{data.identity.email}</b>
              {data.identity.provider ? <> — verified via <b>{data.identity.provider}</b></> : null}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The signer proved control of this email to {data.identity.provider ?? "an identity provider"}
              {data.identity.issuer ? <> (<span className="font-mono">{data.identity.issuer}</span>)</> : null} at seal time.
              Let&apos;s Seal does <b>not</b> verify identity itself — this attributes the seal to that third party&apos;s verification.
            </p>
          </div>
        )}
        {data.attestation && (
          <div className="mt-3 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attestation</p>
            <p className="mt-1 text-sm">
              A signed <b>{predicateLabel(data.attestation.predicateType)}</b> attestation is bound to this artifact&apos;s digest.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`${data.attestation.bundleUrl}?part=bundle`}
                 className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> .att.bundle
              </a>
              <a href={`${data.attestation.bundleUrl}?part=pub`}
                 className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> .pub
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Verify with{" "}
              <code className="rounded bg-background px-1 py-0.5 font-mono">cosign verify-blob-attestation --bundle a.att.bundle --key letsseal.pub --type {predicateCosignType(data.attestation.predicateType)} --insecure-ignore-tlog --check-claims=true &lt;artifact&gt;</code>{" "}
              — or drop the artifact into the verifier above to confirm it&apos;s the attestation&apos;s subject.
            </p>
          </div>
        )}
        {data.artifactUrl && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              <a href={`${data.artifactUrl}?part=sig`}
                 className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> .sig
              </a>
              <a href={`${data.artifactUrl}?part=pem`}
                 className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> .pem
              </a>
              <a href={`${data.artifactUrl}?part=chain`}
                 className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> .chain.pem
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A <b>cosign-compatible</b> {data.identity ? "identity" : "artifact"} signature. Verify with{" "}
              <code className="rounded bg-background px-1 py-0.5 font-mono">cosign verify-blob --certificate a.pem --certificate-chain a.chain.pem --signature a.sig {data.identity ? `--certificate-identity ${data.identity.email}` : "--certificate-identity-regexp '.*'"} --certificate-oidc-issuer-regexp &apos;.*&apos; --insecure-ignore-tlog --insecure-ignore-sct &lt;artifact&gt;</code>{" "}
              — or drop the artifact into the verifier above.
            </p>
          </div>
        )}
        {anchored && (
          <p className="mt-3 text-xs text-muted-foreground">
            Don&apos;t trust us — verify it yourself. Download the <b>.ots proof</b> and run{" "}
            <code className="rounded bg-background px-1 py-0.5 font-mono">ots verify {isTimestamp ? "your-file" : "your-file.pdf"}</code>{" "}
            to confirm the anchor against Bitcoin with zero reliance on Let&apos;s Seal. Let&apos;s Seal holds no
            cryptocurrency and you never touch a coin or a wallet — we use the public ledger the way a notary uses a
            public register, to stamp a record no one can alter.
          </p>
        )}
        {data.log && (
          <div className="mt-4 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transparency log</p>
            <p className="mt-1 text-sm">
              Recorded as entry <b className="font-mono">#{data.log.index}</b> in Let&apos;s Seal&apos;s public,
              append-only log <span className="text-muted-foreground">(of {data.log.treeSize} total)</span>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The log can only ever be appended to — never edited or deleted, and anyone can prove it. Fetch this
              entry&apos;s <a href={`/api/log/proof?sha256=${data.sha256}`} className="underline">inclusion proof</a>{" "}
              and check it against the signed <a href="/api/log/sth" className="underline">tree head</a>; the head&apos;s
              root is itself anchored to Bitcoin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
