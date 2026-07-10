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
