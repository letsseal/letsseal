const SERVICE = process.env.SIGNING_SERVICE_URL ?? "http://127.0.0.1:8081";

export type SealResult = { pdf: Buffer; sha256: string; certCN: string };

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

  const res = await fetch(`${SERVICE}/seal`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`seal failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    pdf: buf,
    sha256: res.headers.get("x-docsigner-sha256") ?? "",
    certCN: res.headers.get("x-docsigner-cert-cn") ?? "",
  };
}

export type VerifyResult = {
  sealed: boolean;
  sha256: string;
  intact?: boolean;
  valid?: boolean;
  trusted?: boolean;
  signer?: string;
  signed_at?: string;
  reason?: string;
};

export async function verifyPdf(pdf: Buffer): Promise<VerifyResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "doc.pdf");
  const res = await fetch(`${SERVICE}/verify`, { method: "POST", body: form });
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
  const res = await fetch(`${SERVICE}/anchor`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`anchor failed: ${res.status}`);
  return res.json();
}

// Try to upgrade a pending .ots proof to a confirmed Bitcoin attestation.
export async function upgradeAnchor(otsB64: string): Promise<AnchorResult> {
  const res = await fetch(`${SERVICE}/anchor/upgrade`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ots_b64: otsB64 }),
  });
  if (!res.ok) throw new Error(`upgrade failed: ${res.status}`);
  return res.json();
}
