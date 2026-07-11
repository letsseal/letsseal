import { timingSafeEqual } from "crypto";

export function ctEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
