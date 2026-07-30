const SERVICE = process.env.SIGNING_SERVICE_URL ?? "http://127.0.0.1:8081";

const SERVICE_TOKEN = process.env.LETSSEAL_SERVICE_TOKEN ?? "";
function svcHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${SERVICE_TOKEN}`, ...extra };
}

export type SealResult = { pdf: Buffer; sha256: string; certCN: string };

export async function issueOrgCert(slug: string, legalName: string): Promise<void> {
  const res = await fetch(`${SERVICE}/org`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slug, legal_name: legalName }),
  });
  if (!res.ok) throw new Error(`cert issuance failed: ${res.status} ${await res.text()}`);
}

export async function reissueOrgCert(slug: string, legalName: string, domain: string | null): Promise<void> {
  const res = await fetch(`${SERVICE}/org/reissue`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slug, legal_name: legalName, domain }),
  });
  if (!res.ok) throw new Error(`cert reissue failed: ${res.status} ${await res.text()}`);
}

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
  form.append("timestamp", String(opts.timestamp ?? true));
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

export async function verifyIdentity(file: Buffer, sig: string, certPem: string): Promise<IdentityVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), "file");
  form.append("sig", new Blob([sig]), "file.sig");
  form.append("cert", new Blob([certPem]), "file.pem");
  const res = await fetch(`${SERVICE}/verify/identity`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

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

export async function signSth(treeSize: number, rootHash: string, ts: number): Promise<SthSignResult> {
  const res = await fetch(`${SERVICE}/log/sth/sign`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tree_size: treeSize, root_hash: rootHash, ts }),
  });
  if (!res.ok) throw new Error(`STH sign failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type LogCertResult = { cert_pem: string; chain_pem: string; cert_cn: string };

export async function getLogCert(): Promise<LogCertResult> {
  const res = await fetch(`${SERVICE}/log/cert`, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`log cert fetch failed: ${res.status}`);
  return res.json();
}

export type LogKeyIdResult = { key_id_b64: string; key_id_hex: string; spki_b64: string };

export async function getLogKeyId(): Promise<LogKeyIdResult> {
  const res = await fetch(`${SERVICE}/log/keyid`, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`log key id fetch failed: ${res.status}`);
  return res.json();
}

export async function signCheckpoint(origin: string, treeSize: number, rootHash: string): Promise<{ envelope: string }> {
  const res = await fetch(`${SERVICE}/log/checkpoint/sign`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ origin, tree_size: treeSize, root_hash: rootHash }),
  });
  if (!res.ok) throw new Error(`checkpoint sign failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function signSet(bodyB64: string, integratedTime: number, logIndex: number): Promise<{ set_b64: string; log_id_hex: string }> {
  const res = await fetch(`${SERVICE}/log/set/sign`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ body_b64: bodyB64, integrated_time: integratedTime, log_index: logIndex }),
  });
  if (!res.ok) throw new Error(`SET sign failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type C2paSealResult = { image: Buffer; sha256: string; certCN: string; format: string };

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

export async function verifyXml(xml: Buffer, opts: { filename?: string } = {}): Promise<XmlVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(xml)], { type: "application/xml" }), opts.filename || "document.xml");
  const res = await fetch(`${SERVICE}/verify/xml`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type SmimeSealResult = { eml: Buffer; sha256: string; certCN: string };

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

export async function verifySmime(message: Buffer, opts: { filename?: string } = {}): Promise<SmimeVerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(message)], { type: "message/rfc822" }), opts.filename || "message.eml");
  const res = await fetch(`${SERVICE}/verify/smime`, { method: "POST", headers: svcHeaders(), body: form });
  return res.json();
}

export type VerifyResult = {
  sealed: boolean;
  sha256: string;
  intact?: boolean;
  covered_intact?: boolean; 
  whole_document?: boolean; 
  coverage?: string;        
  valid?: boolean;
  trusted?: boolean;
  authentic?: boolean;
  signer?: string;
  signed_at?: string;
  reason?: string;
  revoked?: { serial: string; reason: string; revoked_at: string; subject?: string; note?: string };
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

export async function anchorPdf(pdf: Buffer): Promise<AnchorResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "doc.pdf");
  const res = await fetch(`${SERVICE}/anchor`, { method: "POST", headers: svcHeaders(), body: form });
  if (!res.ok) throw new Error(`anchor failed: ${res.status}`);
  return res.json();
}

export async function anchorHash(sha256: string): Promise<AnchorResult> {
  const res = await fetch(`${SERVICE}/anchor/hash`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256 }),
  });
  if (!res.ok) throw new Error(`anchor failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function upgradeAnchor(otsB64: string): Promise<AnchorResult> {
  const res = await fetch(`${SERVICE}/anchor/upgrade`, {
    method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ots_b64: otsB64 }),
  });
  if (!res.ok) throw new Error(`upgrade failed: ${res.status}`);
  return res.json();
}

export type RevocationEntry = {
  serial: string; reason: string; revoked_at: string; subject: string; note?: string;
};
export type RevocationList = {
  version: number; revoked: RevocationEntry[]; updated_at?: string; fetched_at?: number;
  signature?: string; logCert?: string; logChain?: string;
};

export async function getRevocations(): Promise<RevocationList> {
  const res = await fetch(`${SERVICE}/revocations`, { headers: svcHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`revocation list fetch failed: ${res.status}`);
  return res.json();
}
