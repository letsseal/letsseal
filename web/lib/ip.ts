export type TrustedProxy = "cloudflare" | "xrealip" | "xff" | "none";

function configuredProxy(): TrustedProxy {
  const raw = (process.env.TRUSTED_PROXY ?? "").trim().toLowerCase();
  if (raw === "cloudflare" || raw === "xrealip" || raw === "xff" || raw === "none") return raw;
  if (process.env.TRUST_XFF === "1") return "xff"; 
  return "none";
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^[0-9a-fA-F:]{2,45}$/; 

export function isIpLiteral(value: string): boolean {
  const v = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  if (IPV4.test(v)) return true;
  return v.includes(":") && IPV6.test(v);
}

function lastXffHop(header: string): string | null {
  const hops = header.split(",").map((h) => h.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : null;
}

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const mode = configuredProxy();
  let raw: string | null = null;

  if (mode === "cloudflare") raw = req.headers.get("cf-connecting-ip")?.trim() ?? null;
  else if (mode === "xrealip") raw = req.headers.get("x-real-ip")?.trim() ?? null;
  else if (mode === "xff") {
    const xff = req.headers.get("x-forwarded-for");
    raw = xff ? lastXffHop(xff) : null;
  }

  return raw && isIpLiteral(raw) ? raw : "local";
}

export type ProxyPosture = "trusted" | "declared" | "unset";

export function proxyPosture(): ProxyPosture {
  const raw = (process.env.TRUSTED_PROXY ?? "").trim().toLowerCase();
  if (raw === "cloudflare" || raw === "xrealip" || raw === "xff") return "trusted";
  if (raw === "none") return "declared";
  if (process.env.TRUST_XFF === "1") return "trusted";
  return "unset";
}

export function perIpLimitsDegraded(): boolean {
  return configuredProxy() === "none";
}
