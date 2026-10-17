import { BadgeCheck, ChevronDown, Download, ExternalLink, ShieldAlert, ShieldX, TriangleAlert } from "lucide-react";
import { SealMark } from "@/components/brand/SealMark";
import { EXPLORER_BLOCK } from "@/lib/bitcoin";
import type { SigningTrail } from "@/lib/signing-audit";
import { RevealDetails, SignerList } from "@/components/RevealDetails";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/common/copy-button";
import { DetailList, DetailRow } from "@/components/common/detail-list";
import { StatusBadge } from "@/components/common/status-badge";

export type ProofData = {
  sha256: string;
  onRecord: boolean;
  issuer?: string | null;
  verification?: { verified: boolean; domain: string | null; via: string | null } | null;
  suspended?: boolean;
  suspendedReason?: string | null;
  orgSlug?: string | null;
  title?: string | null;
  completedAt?: string | null;
  auditEvents?: number;
  crypto: {
    sealed: boolean; intact?: boolean; valid?: boolean; trusted?: boolean;
    signer?: string; signed_at?: string;
    onRecordOnly?: boolean;
    revoked?: { serial: string; reason: string; revoked_at: string; note?: string } | null;
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
  alsoSealedBy?: { org: string | null; certCN: string; sealType: string; sealedAt: string; proofCode: string | null }[];
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

const ACTION_LABEL: Record<string, string> = {
  sent: "Sent for signing", invite_sent: "Invite emailed to signer", viewed: "Opened by signer",
  field_filled: "Field completed", signed: "Signed", sealed: "Sealed",
  anchored: "Timestamp submitted", anchor_confirmed: "Timestamp confirmed",
};

const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function viaLabel(via: string): string {
  return { dns: "verified via DNS", http: "verified via a website file", email: "verified via a domain admin email", operator: "verified by the operator" }[via] ?? "verified";
}

function Cmd({ children }: { children: React.ReactNode }) {
  return <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">{children}</pre>;
}

function DownloadButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href}><Download /> {children}</a>
    </Button>
  );
}

function TechSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-5">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

const Prose = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function CredentialCard({ c }: { c: NonNullable<ProofData["credential"]> }) {
  const revoked = !!c.revokedAt;
  const expired = !revoked && c.expiresOn && new Date(c.expiresOn) < new Date();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{c.credType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {revoked && (
          <Alert variant="destructive">
            <ShieldX />
            <AlertTitle>Revoked by the issuer{c.revokedAt ? ` on ${new Date(c.revokedAt).toLocaleDateString()}` : ""}</AlertTitle>
            <AlertDescription>
              <p>
                {c.revokedReason ? `${c.revokedReason}. ` : ""}The seal still proves it was genuinely issued and unaltered;
                the issuer has since withdrawn it.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {expired && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Expired on {new Date(c.expiresOn!).toLocaleDateString()}</AlertTitle>
          </Alert>
        )}
        <DetailList>
          <DetailRow label="Issued to">{c.recipientName}</DetailRow>
          <DetailRow label="Credential">{c.title}</DetailRow>
          {c.description && <DetailRow label="Details">{c.description}</DetailRow>}
          {c.credentialCode && <DetailRow label="Reference"><span className="font-mono text-xs">{c.credentialCode}</span></DetailRow>}
          <DetailRow label="Issued">{new Date(c.issuedOn).toLocaleDateString()}</DetailRow>
          {c.expiresOn && <DetailRow label="Expires">{new Date(c.expiresOn).toLocaleDateString()}</DetailRow>}
        </DetailList>
      </CardContent>
    </Card>
  );
}

function SigningTrailCard({ trail }: { trail: SigningTrail }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Signers and audit trail</CardTitle>
        <CardDescription>How each party reached and signed the document, recorded in a tamper-evident log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {trail.sharedSession && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              <p>Two or more signers signed from the same network, so attribution to distinct parties is weaker.</p>
            </AlertDescription>
          </Alert>
        )}
        <SignerList signers={trail.signers} />
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            Full audit trail ({trail.entries.length} events)
            <StatusBadge tone={trail.chainIntact ? "success" : "destructive"}>
              {trail.chainIntact ? "Log intact" : "Log tampered"}
            </StatusBadge>
          </summary>
          <ol className="mt-3 space-y-1.5 border-l pl-3">
            {trail.entries.map((e, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{ACTION_LABEL[e.action] ?? e.action}</span>
                {" · "}{e.actorName}{" · "}{new Date(e.at).toLocaleString()}
              </li>
            ))}
          </ol>
        </details>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Attribution reflects control of the signing channel (a link sent to the signer&apos;s email, say), recorded
          tamper-evidently. It shows who held the channel, not a verified legal identity.
        </p>
      </CardFooter>
    </Card>
  );
}

function IssuerBadge({ data }: { data: ProofData }) {
  if (data.suspended) return <StatusBadge tone="destructive">Suspended</StatusBadge>;
  if (!data.verification) return null;
  return data.verification.verified
    ? <Badge variant="success"><BadgeCheck />{data.verification.domain}</Badge>
    : <StatusBadge tone="warning">Unverified</StatusBadge>;
}

function IssuerNotice({ data }: { data: ProofData }) {
  if (data.suspended) {
    return (
      <Alert variant="destructive">
        <ShieldX />
        <AlertTitle>Issuer suspended</AlertTitle>
        <AlertDescription>
          <p>
            Let&apos;s Seal has suspended this issuer{data.suspendedReason ? <> ({data.suspendedReason})</> : null}. Don&apos;t
            trust the issuer name on this document. The file is still intact and timestamped; only who issued it is in dispute.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data.verification) return null;
  return data.verification.verified ? (
    <Alert variant="success">
      <BadgeCheck />
      <AlertTitle>Issuer verified</AlertTitle>
      <AlertDescription>
        <p>
          Let&apos;s Seal confirmed this issuer controls <span className="font-medium text-foreground">{data.verification.domain}</span>
          {data.verification.via ? <> ({viaLabel(data.verification.via)})</> : null}. The issuer&apos;s identity is that domain.
        </p>
      </AlertDescription>
    </Alert>
  ) : (
    <Alert variant="warning">
      <ShieldAlert />
      <AlertTitle>Issuer identity not verified</AlertTitle>
      <AlertDescription>
        <p>
          The sealing account chose this name; Let&apos;s Seal hasn&apos;t confirmed who they are. The seal proves the file
          is intact and timestamped, not who issued it.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function RevokedNotice({ r }: { r: NonNullable<ProofData["crypto"]["revoked"]> }) {
  const compromised = r.reason === "key_compromise" || r.reason === "ca_compromise";
  return (
    <Alert variant="destructive">
      <ShieldX />
      <AlertTitle>{compromised ? "Signing certificate revoked: key compromised" : "Signing certificate withdrawn"}</AlertTitle>
      <AlertDescription>
        <p>
          {compromised
            ? "The key that sealed this document is known to have left its owner’s control, and there is no way to tell for how long. This seal is not trusted, whatever its date."
            : `Retired (${r.reason.replace(/_/g, " ")}) on ${longDate(r.revoked_at)}. A seal made before that date still stands; this one couldn’t be shown to predate it.`}
          {r.note ? <> {r.note}</> : null}
        </p>
        <p>
          The file&apos;s integrity and timestamp are unaffected. Every withdrawal is listed at{" "}
          <a href="/revocations.json" className="font-mono text-xs underline underline-offset-4">/revocations.json</a>.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function ProofCertificate({ data, variant = "document", gate, label, description, headingLevel = 2 }: {
  data: ProofData;
  variant?: "document" | "timestamp";
  gate?: { hash: string; hasTrail: boolean } | null;
  /** Small line above the verdict, e.g. "Document proof". */
  label?: React.ReactNode;
  /** Replaces the default explanation for an on-record seal. */
  description?: React.ReactNode;
  headingLevel?: 1 | 2;
}) {
  const sealed = data.crypto.sealed;
  const onRecordOnly = data.crypto.onRecordOnly === true;
  const intact = data.crypto.intact !== false;
  const valid = data.crypto.valid !== false;
  const trusted = data.crypto.trusted === true;
  const authentic = sealed && intact && valid && trusted;
  const anchored = !!data.anchor && data.anchor.state !== "none";
  const confirmed = data.anchor?.state === "confirmed";
  const isTimestamp = variant === "timestamp";

  const [title, explanation, color]: [string, React.ReactNode, string] = isTimestamp
    ? confirmed
      ? ["Timestamp confirmed", "Proof this file existed by the date below.", "var(--success)"]
      : ["Timestamp pending", "Confirming the timestamp. This takes a few hours.", "var(--muted-foreground)"]
    : onRecordOnly
      ? ["Sealed and timestamped", description ?? "On record as sealed by the issuer and timestamped.", sealed ? "var(--brand)" : "var(--muted-foreground)"]
      : authentic
        ? ["Authentic and unaltered", "This document carries a valid Let’s Seal seal and hasn’t been modified.", "var(--success)"]
        : !sealed
          ? ["Not a sealed document", "No signature was found in this file.", "var(--muted-foreground)"]
          : !trusted
            ? ["Unrecognised seal", "This file is signed, but not by a Let’s Seal certificate. Don’t trust it as issued through Let’s Seal.", "var(--destructive)"]
            : ["Tampered since sealing", "The seal is present but the contents changed after sealing. Don’t trust this copy.", "var(--destructive)"];
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const issuerName = data.crypto.signer?.split(",")[0]?.replace(/^Common Name:\s*/, "") ?? data.issuer ?? "—";
  const sealedAt = data.crypto.signed_at ?? data.completedAt;
  const showAudit = !isTimestamp && data.onRecord && typeof data.auditEvents === "number";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SealMark className="size-12" color={color} emboss="var(--background)" />
        <div className="space-y-1.5">
          {label && <p className="text-sm text-muted-foreground">{label}</p>}
          <Heading className="text-3xl font-semibold tracking-tight">{title}</Heading>
          <p className="text-sm text-muted-foreground">{explanation}</p>
        </div>
      </div>

      {(data.crypto.revoked || data.suspended || data.verification) && (
        <div className="space-y-3">
          {data.crypto.revoked && <RevokedNotice r={data.crypto.revoked} />}
          <IssuerNotice data={data} />
        </div>
      )}

      <Card size="sm" className="gap-0 py-1">
        <CardContent>
          <DetailList>
            {isTimestamp ? (
              data.title && <DetailRow label="Label">{data.title}</DetailRow>
            ) : (
              <>
                <DetailRow label="Issuer">
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    {issuerName}
                    <IssuerBadge data={data} />
                  </span>
                </DetailRow>
                {data.onRecord && data.title && <DetailRow label="Document">{data.title}</DetailRow>}
                <DetailRow label="Sealed">{sealedAt ? new Date(sealedAt).toLocaleString() : "—"}</DetailRow>
                <DetailRow label="Integrity">
                  {onRecordOnly
                    ? <a href="/verify" className="text-brand hover:underline">Verify a copy</a>
                    : <StatusBadge tone={intact ? "success" : "destructive"}>{intact ? "Intact" : "Altered"}</StatusBadge>}
                </DetailRow>
                {!onRecordOnly && (
                  <DetailRow label="Chain of trust">
                    <StatusBadge tone={trusted ? "success" : "destructive"}>
                      {trusted ? "Chains to Let’s Seal CA" : "Not issued by Let’s Seal"}
                    </StatusBadge>
                  </DetailRow>
                )}
              </>
            )}
            <DetailRow label="Timestamp">
              {!anchored
                ? <StatusBadge tone="neutral">Not timestamped</StatusBadge>
                : confirmed
                  ? <StatusBadge tone="success">Confirmed</StatusBadge>
                  : (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs font-normal text-muted-foreground">Takes a few hours</span>
                      <StatusBadge tone="warning">Confirming</StatusBadge>
                    </span>
                  )}
            </DetailRow>
            {confirmed && data.anchor?.blockTime && (
              <DetailRow label="Confirmed on">{new Date(data.anchor.blockTime).toLocaleString()}</DetailRow>
            )}
          </DetailList>
        </CardContent>
        {!isTimestamp && (data.imageUrl || data.xmlUrl || data.emlUrl) && (
          <CardFooter className="flex-wrap">
            {data.imageUrl && <DownloadButton href={data.imageUrl}>Download signed file</DownloadButton>}
            {data.xmlUrl && <DownloadButton href={data.xmlUrl}>Download signed XML</DownloadButton>}
            {data.emlUrl && <DownloadButton href={data.emlUrl}>Download signed message</DownloadButton>}
          </CardFooter>
        )}
      </Card>

      {!isTimestamp && data.credential && <CredentialCard c={data.credential} />}

      {data.identity && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Verified identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailList>
              <DetailRow label="Signed by"><span className="font-mono text-xs">{data.identity.email}</span></DetailRow>
              {data.identity.provider && <DetailRow label="Verified by">{data.identity.provider}</DetailRow>}
            </DetailList>
            <p className="text-xs text-muted-foreground">
              The signer proved control of this email to {data.identity.provider ?? "an identity provider"}
              {data.identity.issuer ? <> (<span className="font-mono">{data.identity.issuer}</span>)</> : null} at seal time.
              Let&apos;s Seal doesn&apos;t verify identity itself; this attributes the seal to that third party&apos;s verification.
            </p>
          </CardContent>
        </Card>
      )}

      {!isTimestamp && data.trail && data.trail.signers.length > 0 && <SigningTrailCard trail={data.trail} />}

      {!isTimestamp && gate && <RevealDetails hash={gate.hash} hasTrail={gate.hasTrail} />}

      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
          Technical details &amp; verify it yourself
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t px-4 py-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{isTimestamp ? "File" : "Document"} fingerprint (SHA-256)</h3>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">{data.sha256}</code>
              <CopyButton value={data.sha256} toastMessage="Fingerprint copied" />
            </div>
            {(anchored || showAudit) && (
              <DetailList>
                {confirmed && data.anchor?.btcBlock != null && (
                  <DetailRow label="Bitcoin block">
                    <a href={EXPLORER_BLOCK(data.anchor.btcBlock)} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-brand hover:underline">
                      #{data.anchor.btcBlock} <ExternalLink className="size-3.5" />
                    </a>
                  </DetailRow>
                )}
                {anchored && <DetailRow label="Method">OpenTimestamps</DetailRow>}
                {showAudit && <DetailRow label="Audit events">{data.auditEvents}</DetailRow>}
              </DetailList>
            )}
          </section>

          {(data.otsUrl || anchored) && (
            <TechSection title="Timestamp proof">
              {anchored && <Prose>Download the .ots proof and run this beside the file to confirm the timestamp against the blockchain:</Prose>}
              {anchored && <Cmd>ots verify {isTimestamp ? "your-file" : "your-file.pdf"}</Cmd>}
              {data.otsUrl && <DownloadButton href={data.otsUrl}>Download .ots proof</DownloadButton>}
            </TechSection>
          )}

          {data.sigUrl && (
            <TechSection title="Detached signature">
              <Prose>Save it beside your file and verify anywhere, with no Let&apos;s Seal server:</Prose>
              <Cmd>openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt</Cmd>
              <DownloadButton href={data.sigUrl}>Download .sig signature</DownloadButton>
            </TechSection>
          )}

          {data.imageUrl && (
            <TechSection title="Content Credentials">
              <Prose>
                The signed file carries embedded Content Credentials (C2PA). Open it in any C2PA-aware tool (Adobe, the
                Content Credentials verifier) to see the issuer and confirm it&apos;s unaltered.
              </Prose>
            </TechSection>
          )}

          {data.xmlUrl && (
            <TechSection title="XML signature">
              <Prose>The signed XML carries an embedded XML-DSig signature. Verify it with any XML Signature tool, for example:</Prose>
              <Cmd>xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml</Cmd>
            </TechSection>
          )}

          {data.emlUrl && (
            <TechSection title="S/MIME signature">
              <Prose>The signed message carries a standard S/MIME signature. Verify it with any S/MIME tool, for example:</Prose>
              <Cmd>openssl smime -verify -in message.eml -CAfile letsseal-root.crt</Cmd>
            </TechSection>
          )}

          {data.attestation && (
            <TechSection title="Attestation">
              <Prose>
                A signed {predicateLabel(data.attestation.predicateType)} attestation is bound to this file&apos;s fingerprint. Verify with:
              </Prose>
              <Cmd>cosign verify-blob-attestation --bundle a.att.bundle --key letsseal.pub --type {predicateCosignType(data.attestation.predicateType)} --insecure-ignore-tlog --check-claims=true &lt;file&gt;</Cmd>
              <div className="flex flex-wrap gap-2">
                <DownloadButton href={`${data.attestation.bundleUrl}?part=bundle`}>.att.bundle</DownloadButton>
                <DownloadButton href={`${data.attestation.bundleUrl}?part=pub`}>.pub</DownloadButton>
              </div>
            </TechSection>
          )}

          {data.artifactUrl && (
            <TechSection title="Signature files">
              <Prose>A cosign-compatible {data.identity ? "identity" : "file"} signature. Verify with:</Prose>
              <Cmd>cosign verify-blob --certificate a.pem --certificate-chain a.chain.pem --signature a.sig {data.identity ? `--certificate-identity ${data.identity.email}` : "--certificate-identity-regexp '.*'"} --certificate-oidc-issuer-regexp &apos;.*&apos; --insecure-ignore-tlog --insecure-ignore-sct &lt;file&gt;</Cmd>
              <div className="flex flex-wrap gap-2">
                <DownloadButton href={`${data.artifactUrl}?part=sig`}>.sig</DownloadButton>
                <DownloadButton href={`${data.artifactUrl}?part=pem`}>.pem</DownloadButton>
                <DownloadButton href={`${data.artifactUrl}?part=chain`}>.chain.pem</DownloadButton>
              </div>
            </TechSection>
          )}

          {data.log && (
            <TechSection title="Transparency log">
              <Prose>
                Recorded as entry <span className="font-mono text-foreground">#{data.log.index}</span> of {data.log.treeSize} in
                Let&apos;s Seal&apos;s public, append-only log. Entries can never be edited or deleted, and anyone can prove it.
                Fetch this entry&apos;s{" "}
                <a href={`/api/log/proof?sha256=${data.sha256}`} className="text-brand hover:underline">inclusion proof</a>{" "}
                and check it against the signed <a href="/api/log/sth" className="text-brand hover:underline">tree head</a>,
                whose root is itself timestamped on the blockchain.
              </Prose>
            </TechSection>
          )}

          {!!data.alsoSealedBy?.length && (
            <TechSection title="Also sealed by">
              <Prose>
                These exact bytes carry {data.alsoSealedBy.length === 1 ? "another seal" : `${data.alsoSealedBy.length} further seals`},
                each a separate signature under its own certificate. Every one stands on its own.
              </Prose>
              <DetailList>
                {data.alsoSealedBy.map((c, i) => (
                  <DetailRow key={i} label={c.org ?? c.certCN}>
                    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-3 font-normal">
                      <span className="text-muted-foreground">
                        {c.sealType} · {new Date(c.sealedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {c.proofCode && <a href={`/v/${c.proofCode}`} className="text-brand hover:underline">View its proof</a>}
                    </span>
                  </DetailRow>
                ))}
              </DetailList>
            </TechSection>
          )}
        </div>
      </details>

      {data.orgSlug && !data.suspended && (
        <p className="text-xs text-muted-foreground">
          Does this issuer look like it&apos;s impersonating someone?{" "}
          <a href={`/report?org=${data.orgSlug}&hash=${data.sha256}`} className="underline underline-offset-4 hover:text-foreground">
            Report this issuer
          </a>
        </p>
      )}
    </div>
  );
}
