import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APEX = "letsseal.org";
const VERIFY_HOST = "verify.letsseal.org";
const APP_HOST = "app.letsseal.org";

const VERIFY_PREFIXES = ["/verify", "/d/", "/report", "/api", "/_next", "/favicon", "/robots", "/sitemap", "/icon", "/trusted_root", "/revocations", "/invite"];
const ALIAS_HOSTS = new Set([
  "letsseal.com",
  "www.letsseal.com",
  "letseal.org",
  "www.letseal.org",
  "www.letsseal.org",
]);

const SHARED_PREFIXES = ["/site", "/verify", "/d/", "/report", "/api", "/_next", "/favicon", "/robots", "/sitemap", "/llms", "/SPEC", "/trusted_root", "/revocations", "/invite", "/bimi"];

function cspStrict(nonce: string): string {
  return baseCsp(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
}

function cspLegacy(): string {
  return baseCsp("script-src 'self' 'unsafe-inline'");
}

function baseCsp(scriptSrc: string): string {
  return [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
  ].join("; ");
}

function isStaticPage(host: string, pathname: string): boolean {
  return (
    host === APEX ||
    host === VERIFY_HOST ||
    pathname === "/verify" ||
    pathname.startsWith("/verify/") ||
    pathname.startsWith("/site")
  );
}

type Sec = { csp: string; strict: boolean; nonce: string };

function reqHeaders(request: NextRequest, sec: Sec): Headers {
  const h = new Headers(request.headers);
  h.set("x-nonce", sec.nonce);
  h.set("Content-Security-Policy", sec.csp);
  return h;
}

function withSecurity(request: NextRequest, sec: Sec, res?: NextResponse): NextResponse {
  const out = res ?? (sec.strict
    ? NextResponse.next({ request: { headers: reqHeaders(request, sec) } })
    : NextResponse.next());
  out.headers.set("Content-Security-Policy", sec.csp);
  return out;
}

function csrfViolation(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const p = request.nextUrl.pathname;
  if (!p.startsWith("/api/")) return false;
  if (p.startsWith("/api/v1/") || p.startsWith("/api/auth/")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false; 
  let originHost: string;
  try { originHost = new URL(origin).host.toLowerCase(); } catch { return true; }
  const host = (request.headers.get("host") || "").toLowerCase();
  return originHost !== host;
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  const nonce = btoa(crypto.randomUUID());
  const strict = !isStaticPage(host, url.pathname);
  const sec: Sec = { csp: strict ? cspStrict(nonce) : cspLegacy(), strict, nonce };

  if (csrfViolation(request)) {
    return withSecurity(request, sec, NextResponse.json({ error: "cross-site request blocked" }, { status: 403 }));
  }

  if (ALIAS_HOSTS.has(host)) {
    return NextResponse.redirect(`https://${APEX}${url.pathname}${url.search}`, 308);
  }

  if (host === VERIFY_HOST) {
    const p = url.pathname;
    if (p === "/" || p === "/verify") {
      const rewritten = url.clone();
      rewritten.pathname = "/verify";
      rewritten.protocol = "http:"; 
      return withSecurity(request, sec, NextResponse.rewrite(rewritten));
    }
    const belongsHere = VERIFY_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
    if (!belongsHere) {
      return NextResponse.redirect(`https://${APP_HOST}${p}${url.search}`, 307);
    }
    return withSecurity(request, sec);
  }

  if (host === APP_HOST) {
    if (url.pathname === "/") {
      const rewritten = url.clone();
      rewritten.pathname = "/app";
      rewritten.protocol = "http:"; 
      return withSecurity(request, sec, NextResponse.rewrite(rewritten, strict ? { request: { headers: reqHeaders(request, sec) } } : undefined));
    }
    return withSecurity(request, sec);
  }

  if (host === APEX) {
    const p = url.pathname;
    const isShared = SHARED_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
    if (!isShared) {
      const rewritten = url.clone();
      rewritten.pathname = p === "/" ? "/site" : `/site${p}`;
      rewritten.protocol = "http:";
      return withSecurity(request, sec, NextResponse.rewrite(rewritten));
    }
  }

  return withSecurity(request, sec);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
