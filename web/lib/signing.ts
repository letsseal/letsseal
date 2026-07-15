const SERVICE = process.env.SIGNING_SERVICE_URL ?? "http://127.0.0.1:8081";

const SERVICE_TOKEN = process.env.LETSSEAL_SERVICE_TOKEN ?? "";
function svcHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${SERVICE_TOKEN}`, ...extra };
}

export type SealResult = { pdf: Buffer; sha256: string; certCN: string };

// Issue a signing certificate for a new business.
export async function issueOrgCert(slug: string, legalName: string): Promise<void> {
  const res = await fetch(`${SERVICE}/org`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slug, legal_name: legalName }),
  });
  if (!res.ok) throw new Error(`cert issuance failed: ${res.status} ${await res.text()}`);
}

// Re-issue an org's signing cert, binding a verified domain as a dNSName SAN
// (Phase 3 issuer identity). Pass domain=null to unbind. The org key is preserved.
export async function reissueOrgCert(slug: string, legalName: string, domain: string | null): Promise<void> {
  const res = await fetch(`${SERVICE}/org/reissue`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slug, legal_name: legalName, domain }),
  });
  if (!res.ok) throw new Error(`cert reissue failed: ${res.status} ${await res.text()}`);
}

// Render a QR code PNG for a proof URL (used to stamp sealed PDFs).
export async function qrPng(data: string): Promise<Buffer> {
  const res = await fetch(`${SERVICE}/qr`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`qr failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function sealPdf(
  orgSlug: string,
  pdf: Buffer,
  opts: { reason?: string; timestamp?: boolean } = {},
): Promise<SealResult> {
  const form = new FormData();
  form.append("org_slug", orgSlug);
  form.append("reason", opts.reason ?? "Document execution");
  form.append("timestamp", String(opts.timestamp ?? false));
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "doc.pdf");

  const res = await fetch(`${SERVICE}/seal`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`seal failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    pdf: buf,
    sha256: res.headers.get("x-letsseal-sha256") ?? "",
    certCN: res.headers.get("x-letsseal-cert-cn") ?? "",
  };
}

export type DetachedSealResult = { sha256: string; sig_b64: string; cert_cn: string };

// Detached CAdES/CMS seal over a file's SHA-256 (digest-only) for any non-PDF
// artifact. The signing service never sees the file bytes.
export async function sealDetached(orgSlug: string, sha256: string): Promise<DetachedSealResult> {
  const res = await fetch(`${SERVICE}/seal/detached`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256, org_slug: orgSlug }),
  });
  if (!res.ok) throw new Error(`detached seal failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type DetachedVerifyResult = {
  sealed: boolean; detached: boolean; valid: boolean; trusted: boolean;
  entire_file?: boolean; signer?: string; sha256: string; reason?: string;
};

// Verify a detached seal: the file bytes + its .sig, against our root.
export async function verifyDetached(file: Buffer, sig: Buffer): Promise<DetachedVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), "file");
  form.append("sig", new Blob([new Uint8Array(sig)]), "file.sig");
  const res = await fetch(`${SERVICE}/verify/detached`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type BlobSealResult = {
  sha256: string; sig_b64: string; cert_pem: string; chain_pem: string;
  cert_cn: string; identity: string;
};

// cosign-compatible seal over a file's SHA-256 (digest-only) — a raw ECDSA
// signature + the org's codeSigning cert. The signing service never sees the
// artifact bytes. Verifies with sealbot, openssl, and stock cosign verify-blob.
export async function sealBlob(orgSlug: string, sha256: string): Promise<BlobSealResult> {
  const res = await fetch(`${SERVICE}/seal/blob`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256, org_slug: orgSlug }),
  });
  if (!res.ok) throw new Error(`blob seal failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type BlobVerifyResult = {
  sealed: boolean; blob: boolean; valid: boolean; trusted: boolean;
  entire_file?: boolean; signer?: string; sha256: string; reason?: string;
};

// Verify a cosign-format blob seal: the artifact bytes + its base64 .sig + the
// signer .pem (leaf, optionally with chain), against our root.
export async function verifyBlob(file: Buffer, sig: string, certPem: string): Promise<BlobVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), "file");
  form.append("sig", new Blob([sig]), "file.sig");
  form.append("cert", new Blob([certPem]), "file.pem");
  const res = await fetch(`${SERVICE}/verify/blob`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type IdentitySealResult = {
  sha256: string; sig_b64: string; cert_pem: string; chain_pem: string;
  cert_cn: string; identity: string; issuer: string; provider: string; not_after: string;
};

// Seal a digest under a third-party-verified identity: the signing service
// re-verifies the provider's proof (Google/GitHub/OIDC token), mints a short-lived
// leaf binding the verified email, and signs the SHA-256 with it. Digest-only —
// the artifact never reaches the service. `token` is an OIDC ID token (JWT) for
// OIDC providers, or a GitHub OAuth access token for provider "github".
export async function sealIdentity(provider: string, sha256: string, token: string): Promise<IdentitySealResult> {
  const res = await fetch(`${SERVICE}/seal/identity`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256, provider, token }),
  });
  if (!res.ok) throw new Error(`identity seal failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type IdentityVerifyResult = {
  sealed: boolean; identity_seal: boolean; valid: boolean; trusted: boolean;
  entire_file?: boolean; signer?: string; identity?: string; oidc_issuer?: string;
  account_url?: string; sha256: string; reason?: string;
};

// Verify an identity seal: the artifact bytes + its base64 .sig + the signer .pem,
// against our root — and surface who signed (verified email) and who vouched (the
// OIDC issuer recorded at issuance).
export async function verifyIdentity(file: Buffer, sig: string, certPem: string): Promise<IdentityVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), "file");
  form.append("sig", new Blob([sig]), "file.sig");
  form.append("cert", new Blob([certPem]), "file.pem");
  const res = await fetch(`${SERVICE}/verify/identity`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

// The identity providers the signing service is configured for (only those with
// an OAuth client id set). The UI renders sign-in buttons from this.
export async function identityProviders(): Promise<string[]> {
  const res = await fetch(`${SERVICE}/identity/providers`, { headers: svcHeaders() });
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.providers) ? j.providers : [];
}

export type AttestResult = {
  sha256: string; bundle: unknown; dsse: unknown; pubkey_pem: string;
  cert_pem: string; chain_pem: string; cert_cn: string; identity: string; predicate_type: string;
};

// Sign a DSSE/in-toto attestation (SBOM, SLSA provenance, vuln scan) about an
// artifact's SHA-256 with the org's codeSigning cert. Digest-only. The returned
// `bundle` verifies with stock cosign verify-blob-attestation --key.
export async function signAttestation(
  orgSlug: string, sha256: string, predicate: unknown,
  opts: { predicateType?: string; subjectName?: string } = {},
): Promise<AttestResult> {
  const res = await fetch(`${SERVICE}/attest`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sha256, org_slug: orgSlug, predicate,
      predicate_type: opts.predicateType ?? "custom",
      subject_name: opts.subjectName ?? "artifact",
    }),
  });
  if (!res.ok) throw new Error(`attest failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type AttestVerifyResult = {
  sealed: boolean; attestation: boolean; valid: boolean; trusted: boolean;
  subject_ok?: boolean | null; predicate_type?: string; signer?: string; sha256: string; reason?: string;
};

// Verify a DSSE attestation: the artifact bytes + its bundle + the signer .pem,
// against our root, confirming the attestation's subject matches the artifact.
export async function verifyAttestation(file: Buffer, bundleJson: string, certPem: string): Promise<AttestVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), "file");
  form.append("bundle", new Blob([bundleJson]), "att.bundle");
  form.append("cert", new Blob([certPem]), "file.pem");
  const res = await fetch(`${SERVICE}/verify/attest`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type SthSignResult = {
  signature: string; cert_pem: string; chain_pem: string; cert_cn: string; ts: number;
};

// Sign a transparency-log Signed Tree Head with the system log key. The web app
// owns the log and computes the Merkle root; the signing service authenticates it.
export async function signSth(treeSize: number, rootHash: string, ts: number): Promise<SthSignResult> {
  const res = await fetch(`${SERVICE}/log/sth/sign`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tree_size: treeSize, root_hash: rootHash, ts }),
  });
  if (!res.ok) throw new Error(`STH sign failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type LogCertResult = { cert_pem: string; chain_pem: string; cert_cn: string };

// The transparency-log public cert + chain (static; the caller caches it).
export async function getLogCert(): Promise<LogCertResult> {
  const res = await fetch(`${SERVICE}/log/cert`, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`log cert fetch failed: ${res.status}`);
  return res.json();
}

export type C2paSealResult = { image: Buffer; sha256: string; certCN: string; format: string };

// Embed a signed C2PA (Content Credentials) manifest into an image. The image is
// rewritten (the manifest lives inside it), so unlike detached this uploads the
// bytes. Returns the signed image + its new digest, signer and MIME.
export async function sealC2pa(
  orgSlug: string,
  image: Buffer,
  opts: { filename?: string; contentType?: string; title?: string | null } = {},
): Promise<C2paSealResult> {
  const form = new FormData();
  form.append("org_slug", orgSlug);
  if (opts.title) form.append("title", opts.title);
  form.append(
    "file",
    new Blob([new Uint8Array(image)], { type: opts.contentType || "application/octet-stream" }),
    opts.filename || "image",
  );
  const res = await fetch(`${SERVICE}/seal/c2pa`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`c2pa seal failed: ${res.status} ${await res.text()}`);
  return {
    image: Buffer.from(await res.arrayBuffer()),
    sha256: res.headers.get("x-letsseal-sha256") ?? "",
    certCN: res.headers.get("x-letsseal-cert-cn") ?? "",
    format: res.headers.get("x-letsseal-format") ?? "",
  };
}

export type C2paVerifyResult = {
  sealed: boolean; c2pa: boolean; valid: boolean; trusted: boolean;
  validation_state?: string; signer?: string; sha256: string; reason?: string;
};

// Verify an image's embedded C2PA manifest against our root.
export async function verifyC2pa(image: Buffer, opts: { filename?: string; contentType?: string } = {}): Promise<C2paVerifyResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(image)], { type: opts.contentType || "application/octet-stream" }),
    opts.filename || "image",
  );
  const res = await fetch(`${SERVICE}/verify/c2pa`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type XmlSealResult = { xml: Buffer; sha256: string; certCN: string };

// Embed an enveloped W3C XML-DSig signature into an XML document. The document is
// rewritten (the <Signature> lives inside it). Returns the signed XML + its digest.
export async function sealXml(orgSlug: string, xml: Buffer, opts: { filename?: string } = {}): Promise<XmlSealResult> {
  const form = new FormData();
  form.append("org_slug", orgSlug);
  form.append("file", new Blob([new Uint8Array(xml)], { type: "application/xml" }), opts.filename || "document.xml");
  const res = await fetch(`${SERVICE}/seal/xml`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`xml seal failed: ${res.status} ${await res.text()}`);
  return {
    xml: Buffer.from(await res.arrayBuffer()),
    sha256: res.headers.get("x-letsseal-sha256") ?? "",
    certCN: res.headers.get("x-letsseal-cert-cn") ?? "",
  };
}

export type XmlVerifyResult = {
  sealed: boolean; xmldsig: boolean; valid: boolean; trusted: boolean;
  signer?: string; sha256: string; reason?: string;
};

// Verify an XML document's enveloped signature against our root.
export async function verifyXml(xml: Buffer, opts: { filename?: string } = {}): Promise<XmlVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(xml)], { type: "application/xml" }), opts.filename || "document.xml");
  const res = await fetch(`${SERVICE}/verify/xml`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type SmimeSealResult = { eml: Buffer; sha256: string; certCN: string };

// Wrap an email message in an S/MIME `multipart/signed` envelope signed by the org
// cert. Same CMS crypto as the detached seal, delivered in the form mail speaks.
export async function sealSmime(orgSlug: string, message: Buffer, opts: { filename?: string } = {}): Promise<SmimeSealResult> {
  const form = new FormData();
  form.append("org_slug", orgSlug);
  form.append("file", new Blob([new Uint8Array(message)], { type: "message/rfc822" }), opts.filename || "message.eml");
  const res = await fetch(`${SERVICE}/seal/smime`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`smime seal failed: ${res.status} ${await res.text()}`);
  return {
    eml: Buffer.from(await res.arrayBuffer()),
    sha256: res.headers.get("x-letsseal-sha256") ?? "",
    certCN: res.headers.get("x-letsseal-cert-cn") ?? "",
  };
}

export type SmimeVerifyResult = {
  sealed: boolean; smime: boolean; valid: boolean; trusted: boolean;
  signer?: string; sha256: string; reason?: string;
};

// Verify an S/MIME signed email message against our root.
export async function verifySmime(message: Buffer, opts: { filename?: string } = {}): Promise<SmimeVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(message)], { type: "message/rfc822" }), opts.filename || "message.eml");
  const res = await fetch(`${SERVICE}/verify/smime`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type VerifyResult = {
  sealed: boolean;
  sha256: string;
  // `intact` = the whole document is unaltered since sealing (covered bytes
  // untouched AND nothing appended after the signature). This is what the UI
  // means by "unaltered", and it's coverage-aware — a valid signature with
  // content appended afterwards (e.g. via exiftool) reports intact=false.
  intact?: boolean;
  covered_intact?: boolean; // raw: only the signature's byte range
  whole_document?: boolean; // signature covers the entire file
  coverage?: string;        // ENTIRE_FILE | ENTIRE_REVISION | ...
  valid?: boolean;
  trusted?: boolean;
  // Authoritative pass/fail verdict from the service: valid AND intact AND
  // trusted. A valid signature from an unrecognized (self-signed) cert is NOT
  // authentic — never render a green verdict from sealed/intact alone.
  authentic?: boolean;
  signer?: string;
  signed_at?: string;
  reason?: string;
};

export async function verifyPdf(pdf: Buffer): Promise<VerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "doc.pdf");
  const res = await fetch(`${SERVICE}/verify`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type AnchorStatus = {
  state: "pending" | "confirmed" | "none";
  calendars?: string[];
  bitcoin_block?: number;
  file_sha256?: string;
};
export type AnchorResult = { ots_b64: string; status: AnchorStatus };

// Timestamp sha256(pdf) on Bitcoin via OpenTimestamps calendars.
export async function anchorPdf(pdf: Buffer): Promise<AnchorResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "doc.pdf");
  const res = await fetch(`${SERVICE}/anchor`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`anchor failed: ${res.status}`);
  return res.json();
}

// Timestamp a bare SHA-256 digest on Bitcoin (no file upload) — the
// privacy-preserving "anchor anything" primitive.
export async function anchorHash(sha256: string): Promise<AnchorResult> {
  const res = await fetch(`${SERVICE}/anchor/hash`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256 }),
  });
  if (!res.ok) throw new Error(`anchor failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Try to upgrade a pending .ots proof to a confirmed Bitcoin attestation.
export async function upgradeAnchor(otsB64: string): Promise<AnchorResult> {
  const res = await fetch(`${SERVICE}/anchor/upgrade`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ots_b64: otsB64 }),
  });
  if (!res.ok) throw new Error(`upgrade failed: ${res.status}`);
  return res.json();
}
