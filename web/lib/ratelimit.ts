type Bucket = { n: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { n: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    return false;
  }
  b.n++;
  return b.n > limit;
}

export function attemptCount(key: string): number {
  const b = buckets.get(key);
  if (!b || Date.now() > b.resetAt) return 0;
  return b.n;
}

export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { n: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    return;
  }
  b.n++;
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json() as { result: unknown }).result;
}

export async function rateLimitedAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!useRedis) return rateLimited(key, limit, windowMs);
  try {
    const n = Number(await redis(["INCR", `rl:${key}`]));
    if (n === 1) await redis(["PEXPIRE", `rl:${key}`, windowMs]);
    return n > limit;
  } catch { return rateLimited(key, limit, windowMs); }
}

export async function attemptCountAsync(key: string): Promise<number> {
  if (!useRedis) return attemptCount(key);
  try { return Number(await redis(["GET", `rl:${key}`])) || 0; } catch { return attemptCount(key); }
}

export async function recordFailureAsync(key: string, windowMs: number): Promise<void> {
  if (!useRedis) return recordFailure(key, windowMs);
  try {
    const n = Number(await redis(["INCR", `rl:${key}`]));
    if (n === 1) await redis(["PEXPIRE", `rl:${key}`, windowMs]);
  } catch { recordFailure(key, windowMs); }
}
