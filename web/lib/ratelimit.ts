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
