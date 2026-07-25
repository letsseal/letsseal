import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitedAsync } from "@/lib/ratelimit";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey() {
  const secret = "sk_live_" + randomBytes(24).toString("base64url"); 
  return {
    secret, 
    prefix: secret.slice(0, 12), 
    lastFour: secret.slice(-4),
    hash: hashSecret(secret),
  };
}

const LIMIT = 120;
const WINDOW_MS = 60_000; 

const LAST_TOUCH = new Map<string, number>();
function shouldTouch(keyId: string): boolean {
  const now = Date.now();
  const prev = LAST_TOUCH.get(keyId) ?? 0;
  if (now - prev < 60_000) return false;
  if (LAST_TOUCH.size > 5_000) {
    for (const [k, t] of LAST_TOUCH) if (now - t > 60_000) LAST_TOUCH.delete(k);
  }
  LAST_TOUCH.set(keyId, now);
  return true;
}

export type ApiKeyContext = {
  org: { id: string; slug: string; name: string };
  tenant: { id: string; slug: string; name: string; enterprise: boolean } | null;
  keyId: string;
  scopes: string[];
};

type AuthResult = { ok: true; ctx: ApiKeyContext } | { ok: false; res: NextResponse };

const fail = (status: number, error: string): { ok: false; res: NextResponse } => ({
  ok: false,
  res: NextResponse.json({ error }, { status }),
});

export async function authApiKey(req: NextRequest, scope?: string): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return fail(401, "missing bearer token (Authorization: Bearer sk_live_…)");

  const key = await db.apiKey.findUnique({
    where: { hash: hashSecret(m[1].trim()) },
    include: {
      org: {
        select: {
          id: true, slug: true, name: true, status: true,
          tenant: { select: { id: true, slug: true, name: true, enterprise: true } },
        },
      },
    },
  });
  if (!key || key.revokedAt) return fail(401, "invalid or revoked API key");
  if (key.org.status === "suspended") return fail(403, "this organisation is suspended");

  const scopes = key.scopes.split(",").map((s) => s.trim()).filter(Boolean);
  if (scope && !scopes.includes(scope)) return fail(403, `this key lacks the '${scope}' scope`);

  if (await rateLimitedAsync(`apikey:${key.id}`, LIMIT, WINDOW_MS)) {
    return fail(429, "rate limit exceeded (120/min); slow down or contact us");
  }

  if (shouldTouch(key.id)) {
    db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  const { tenant, ...org } = key.org;
  return { ok: true, ctx: { org, tenant: tenant ?? null, keyId: key.id, scopes } };
}
