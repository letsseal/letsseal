export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  if (process.env.TRUST_XFF === "1") {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
  }
  return "local";
}
