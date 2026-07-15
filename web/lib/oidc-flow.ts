import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type FlowProvider = {
  id: string;
  label: string;
  authorize: string; 
  token: string;     
  scope: string;
  oidc: boolean;     
  clientId?: string;
  clientSecret?: string;
};

function cred(prefix: string, kind: "ID" | "SECRET"): string | undefined {
  return (
    process.env[`IDENTITY_${prefix}_${kind}`]?.trim() ||
    process.env[`AUTH_${prefix}_${kind}`]?.trim() ||
    undefined
  );
}

// Registry of providers the browser flow can drive. Google is full OIDC (returns
// an id_token); GitHub is OAuth (returns an access_token the service exchanges for
// the verified email). Add Microsoft/Apple by copying a row + its endpoints.
const REGISTRY: Omit<FlowProvider, "clientId" | "clientSecret">[] = [
  {
    id: "google", label: "Google", oidc: true,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email",
  },
  {
    id: "github", label: "GitHub", oidc: false,
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
  },
];

const ENV_PREFIX: Record<string, string> = { google: "GOOGLE", github: "GITHUB" };

function withCreds(p: Omit<FlowProvider, "clientId" | "clientSecret">): FlowProvider {
  const prefix = ENV_PREFIX[p.id];
  return { ...p, clientId: cred(prefix, "ID"), clientSecret: cred(prefix, "SECRET") };
}

export function flowProvider(id: string): FlowProvider | null {
  const base = REGISTRY.find((p) => p.id === id);
  if (!base) return null;
  const p = withCreds(base);
  return p.clientId && p.clientSecret ? p : null;
}

/** The identity providers that are configured (have OAuth creds) for the browser flow. */
export function enabledFlowProviders(): { id: string; label: string }[] {
  return REGISTRY.map(withCreds)
    .filter((p) => p.clientId && p.clientSecret)
    .map(({ id, label }) => ({ id, label }));
}

// The canonical app origin the OAuth redirect_uri is built from. Must match a URI
// registered on the OAuth app. AUTH_URL is pinned in prod (behind the tunnel the
// forwarded Host is wrong), so prefer it; fall back to the request origin in dev.
export function appOrigin(reqOrigin?: string): string {
  const pinned = process.env.AUTH_URL?.trim() || process.env.APP_URL?.trim();
  return (pinned || reqOrigin || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(reqOrigin?: string): string {
  return `${appOrigin(reqOrigin)}/api/identity/callback`;
}

export function buildAuthorizeUrl(p: FlowProvider, opts: { state: string; nonce: string; redirectUri: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId!,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: p.scope,
    state: opts.state,
  });
  // OIDC replay-hardening + force an explicit account choice so the signer picks
  // the identity to seal under (rather than silently reusing a stale session).
  if (p.oidc) {
    q.set("nonce", opts.nonce);
    q.set("prompt", "select_account");
  }
  return `${p.authorize}?${q.toString()}`;
}

// Exchange the authorization code for the token we seal with: the id_token for
// OIDC providers, the access_token for GitHub. Server-side only (uses the client
// secret). Throws on any provider error.
export async function exchangeCode(p: FlowProvider, code: string, redirect: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: p.clientId!,
    client_secret: p.clientSecret!,
    code,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const res = await fetch(p.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw new Error(`token exchange failed (${res.status})`);
  const token = p.oidc ? json.id_token : json.access_token;
  if (typeof token !== "string" || !token) {
    throw new Error(`token exchange returned no ${p.oidc ? "id_token" : "access_token"}`);
  }
  return token;
}

// ---- pending-seal cookie (HMAC-signed, carries the flow across the redirect) ----

export const FLOW_COOKIE = "ls_idseal";
const MAX_AGE_S = 600; // 10 minutes to complete the OAuth round-trip

export type FlowState = {
  provider: string;
  sha256: string;
  title: string | null;
  orgSlug: string;
  state: string;
  nonce: string;
  exp: number; // epoch seconds
};

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function newState(): { state: string; nonce: string } {
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)) };
}

// Serialize + HMAC the flow state into a cookie value: <payload>.<sig>.
export function signFlow(f: Omit<FlowState, "exp">): { value: string; maxAge: number } {
  const full: FlowState = { ...f, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  const payload = b64url(Buffer.from(JSON.stringify(full)));
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { value: `${payload}.${sig}`, maxAge: MAX_AGE_S };
}

// Verify + parse the cookie. Returns null on any tamper/expiry.
export function verifyFlow(cookieValue: string | undefined): FlowState | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const f = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FlowState;
    if (!f || typeof f !== "object") return null;
    if (typeof f.exp !== "number" || f.exp < Math.floor(Date.now() / 1000)) return null;
    return f;
  } catch {
    return null;
  }
}
