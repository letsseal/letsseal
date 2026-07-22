
export type Profile = "document" | "code" | "data";

export interface VerifyResult {
  sealed: boolean;
  sha256?: string;
  intact?: boolean;
  valid?: boolean;
  trusted?: boolean;
  signer?: string;
  signedAt?: string;
  reason?: string;
}

export interface AnchorStatus {
  state: "pending" | "confirmed" | string;
  fileSha256?: string;
  bitcoinBlock?: number;
  calendars?: string[];
}

export interface AnchorResult {
  otsB64: string;
  status: AnchorStatus;
}

export interface SealResult {
  pdf: Uint8Array;
  sha256: string;
  certCn: string;
}

export interface CertResult {
  id: string;
  profile: Profile;
  certificate: string;
  chain: string;
}

export type FileInput = Uint8Array | ArrayBuffer | Blob | { bytes: Uint8Array | ArrayBuffer; name?: string };

export class LetsSealError extends Error {
  constructor(public status: number, public body: string) {
    super(`Let's Seal API error ${status}: ${body}`);
    this.name = "LetsSealError";
  }
}

export interface ClientOptions {
  /** Base URL of the signing service. Default `http:
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

function toBlob(f: FileInput): { blob: Blob; name: string } {
  if (f instanceof Blob) return { blob: f, name: (f as any).name || "file" };
  if (f instanceof Uint8Array || f instanceof ArrayBuffer) return { blob: new Blob([f as BlobPart]), name: "file" };
  return { blob: new Blob([f.bytes as BlobPart]), name: f.name || "file" };
}

export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", ab);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LetsSeal {
  private base: string;
  private fetch: typeof fetch;
  private headers: Record<string, string>;

  constructor(opts: ClientOptions = {}) {
    this.base = (opts.baseUrl ?? "http://127.0.0.1:8081").replace(/\/$/, "");
    const u = new URL(this.base);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
    if (u.protocol !== "https:" && !local)
      throw new Error(`baseUrl must use https:// for a remote host (got ${this.base}); plaintext allows result forgery and token interception.`);
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.headers = opts.headers ?? {};
    if (!this.fetch) throw new Error("No global fetch; pass one via options.fetch");
  }

  private async req(path: string, init: RequestInit): Promise<Response> {
    const res = await this.fetch(this.base + path, {
      ...init,
      headers: { ...this.headers, ...(init.headers as Record<string, string>) },
    });
    if (!res.ok) throw new LetsSealError(res.status, await res.text().catch(() => ""));
    return res;
  }

  private json(path: string, body: unknown): Promise<Response> {
    return this.req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  private multipart(path: string, fields: Record<string, string>, file?: FileInput): Promise<Response> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) {
      const { blob, name } = toBlob(file);
      form.append("file", blob, name);
    }
    return this.req(path, { method: "POST", body: form });
  }

  /** Liveness check. */
  async health(): Promise<{ ok: boolean }> {
    return (await this.req("/health", { method: "GET" })).json();
  }

  /** Issue a business signing certificate (CA-as-code). */
  async issueOrgCert(input: { slug: string; legalName: string }): Promise<{ ok: boolean; slug: string }> {
    return (await this.json("/org", { slug: input.slug, legal_name: input.legalName })).json();
  }

  /** Sign a client-supplied CSR under a profile. The private key never leaves the client. */
  async signCsr(input: { id: string; csr: string; profile?: Profile }): Promise<CertResult> {
    return (await this.json("/cert/sign", { id: input.id, csr: input.csr, profile: input.profile ?? "document" })).json();
  }

  /** Seal a PDF with an org's certificate. Returns the sealed bytes + digest + signer. */
  async seal(file: FileInput, opts: { org: string; reason?: string; timestamp?: boolean }): Promise<SealResult> {
    const res = await this.multipart("/seal", {
      org_slug: opts.org,
      reason: opts.reason ?? "Document execution",
      timestamp: String(opts.timestamp ?? true),
    }, file);
    return {
      pdf: new Uint8Array(await res.arrayBuffer()),
      sha256: res.headers.get("x-letsseal-sha256") ?? "",
      certCn: res.headers.get("x-letsseal-cert-cn") ?? "",
    };
  }

  /** Verify a sealed PDF against the CA. */
  async verify(file: FileInput): Promise<VerifyResult> {
    const r = await (await this.multipart("/verify", {}, file)).json();
    return { sealed: r.sealed, sha256: r.sha256, intact: r.intact, valid: r.valid, trusted: r.trusted, signer: r.signer, signedAt: r.signed_at, reason: r.reason };
  }

  /** Anchor a file on Bitcoin (the file is hashed server-side). */
  async anchorFile(file: FileInput): Promise<AnchorResult> {
    return this.normalizeAnchor(await (await this.multipart("/anchor", {}, file)).json());
  }

  /** Anchor a bare SHA-256 digest on Bitcoin — the file never leaves the caller. */
  async anchorHash(sha256: string): Promise<AnchorResult> {
    return this.normalizeAnchor(await (await this.json("/anchor/hash", { sha256 })).json());
  }

  /**
   * Convenience: hash `file` locally with `crypto.subtle` and anchor only the
   * digest — the bytes never touch the network. Prefer this over `anchorFile`
   * for anything sensitive.
   */
  async anchorLocal(file: FileInput): Promise<AnchorResult & { sha256: string }> {
    const { blob } = toBlob(file);
    const sha = await sha256Hex(await blob.arrayBuffer());
    return { ...(await this.anchorHash(sha)), sha256: sha };
  }

  /** Upgrade a pending `.ots` proof (base64) to a confirmed Bitcoin attestation. */
  async anchorUpgrade(otsB64: string): Promise<AnchorResult> {
    return this.normalizeAnchor(await (await this.json("/anchor/upgrade", { ots_b64: otsB64 })).json());
  }

  /** Render a proof QR code (PNG bytes). */
  async renderQr(data: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.json("/qr", { data })).arrayBuffer());
  }

  // ── Seal any file ────────────────────────────────────────────────────────
  // The `/seal` route above is the PDF/PAdES form. These cover the rest of the
  // surface; each is one seal, verifiable against the same published root.

  /**
   * Seal any file as a detached CAdES/CMS signature over its SHA-256 — the file
   * never leaves the caller. Pair with {@link anchorHash} for the Bitcoin time.
   */
  async sealDetached(sha256: string, org: string): Promise<{ sha256: string; sig_b64: string; cert_cn: string }> {
    return (await this.json("/seal/detached", { sha256, org_slug: org })).json();
  }

  /** Convenience: hash a file locally with `crypto.subtle`, then seal the digest (detached). */
  async sealDetachedLocal(file: FileInput, org: string): Promise<{ sha256: string; sig_b64: string; cert_cn: string }> {
    const { blob } = toBlob(file);
    return this.sealDetached(await sha256Hex(await blob.arrayBuffer()), org);
  }

  /**
   * Supply-chain seal: a cosign-compatible signature over a file's SHA-256, using
   * the org's code-signing leaf. Verifies with stock `cosign verify-blob`.
   */
  async sealBlob(sha256: string, org: string): Promise<Record<string, unknown>> {
    return (await this.json("/seal/blob", { sha256, org_slug: org })).json();
  }

  /**
   * Sign a DSSE/in-toto attestation (SBOM, SLSA provenance, vuln scan) binding a
   * predicate to a file's SHA-256. The returned bundle verifies with stock
   * `cosign verify-blob-attestation`.
   */
  async attest(input: { sha256: string; org: string; predicate: unknown; predicateType?: string; subjectName?: string }): Promise<Record<string, unknown>> {
    return (await this.json("/attest", {
      sha256: input.sha256, org_slug: input.org, predicate: input.predicate,
      predicate_type: input.predicateType ?? "custom", subject_name: input.subjectName ?? "artifact",
    })).json();
  }

  /** The OIDC identity providers this deployment has enabled (those with a client id set). */
  async identityProviders(): Promise<{ providers: string[] }> {
    return (await this.req("/identity/providers", { method: "GET" })).json();
  }

  /**
   * Seal a digest under a provider-verified identity: pass the provider's proof
   * (an OIDC ID token, or a GitHub OAuth access token for `github`) and Let's Seal
   * mints a short-lived leaf binding the provider-verified email. Records that the
   * *provider* verified the signer's email — it is not a claim of real-world identity.
   */
  async sealIdentity(input: { sha256: string; provider: string; token: string }): Promise<Record<string, unknown>> {
    return (await this.json("/seal/identity", { sha256: input.sha256, provider: input.provider, token: input.token })).json();
  }

  /** Seal an image or media file with an embedded C2PA (Content Credentials) manifest. Returns the signed bytes. */
  async sealC2pa(file: FileInput, opts: { org: string; title?: string }): Promise<{ image: Uint8Array; sha256: string; certCn: string; format: string }> {
    const fields: Record<string, string> = { org_slug: opts.org };
    if (opts.title) fields.title = opts.title;
    const res = await this.multipart("/seal/c2pa", fields, file);
    return {
      image: new Uint8Array(await res.arrayBuffer()),
      sha256: res.headers.get("x-letsseal-sha256") ?? "",
      certCn: res.headers.get("x-letsseal-cert-cn") ?? "",
      format: res.headers.get("x-letsseal-format") ?? "",
    };
  }

  /** Seal an XML document with an enveloped W3C XML-DSig signature. Returns the signed XML bytes. */
  async sealXml(file: FileInput, opts: { org: string }): Promise<{ xml: Uint8Array; sha256: string; certCn: string }> {
    const res = await this.multipart("/seal/xml", { org_slug: opts.org }, file);
    return {
      xml: new Uint8Array(await res.arrayBuffer()),
      sha256: res.headers.get("x-letsseal-sha256") ?? "",
      certCn: res.headers.get("x-letsseal-cert-cn") ?? "",
    };
  }

  /** Seal an email message (`.eml`) in an S/MIME `multipart/signed` envelope. Returns the signed `.eml` bytes. */
  async sealSmime(file: FileInput, opts: { org: string }): Promise<{ eml: Uint8Array; sha256: string; certCn: string }> {
    const res = await this.multipart("/seal/smime", { org_slug: opts.org }, file);
    return {
      eml: new Uint8Array(await res.arrayBuffer()),
      sha256: res.headers.get("x-letsseal-sha256") ?? "",
      certCn: res.headers.get("x-letsseal-cert-cn") ?? "",
    };
  }

  private normalizeAnchor(r: any): AnchorResult {
    const s = r.status ?? {};
    return { otsB64: r.ots_b64, status: { state: s.state, fileSha256: s.file_sha256, bitcoinBlock: s.bitcoin_block, calendars: s.calendars } };
  }
}

export default LetsSeal;
