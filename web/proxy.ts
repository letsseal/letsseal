import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APEX = "letsseal.org";
const VERIFY_HOST = "verify.letsseal.org";
const APP_HOST = "app.letsseal.org";

const VERIFY_PREFIXES = ["/verify", "/d/", "/api", "/_next", "/favicon", "/robots", "/sitemap", "/icon"];
const ALIAS_HOSTS = new Set([
  "letsseal.com",
  "www.letsseal.com",
  "letseal.org",
  "www.letseal.org",
  "www.letsseal.org",
]);

const SHARED_PREFIXES = ["/site", "/verify", "/d/", "/api", "/_next", "/favicon", "/robots", "/sitemap"];

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];

  if (ALIAS_HOSTS.has(host)) {
    return NextResponse.redirect(`https://${APEX}${url.pathname}${url.search}`, 308);
  }

  // 1b) verify.letsseal.org — the standalone verification portal.
  if (host === VERIFY_HOST) {
    const p = url.pathname;
    if (p === "/" || p === "/verify") {
      const rewritten = url.clone();
      rewritten.pathname = "/verify";
      rewritten.protocol = "http:"; // stay same-origin behind the TLS-terminating tunnel
      return NextResponse.rewrite(rewritten);
    }
    // Proof pages, verify APIs and assets live here; everything else is the app's.
    const belongsHere = VERIFY_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
    if (!belongsHere) {
      return NextResponse.redirect(`https://${APP_HOST}${p}${url.search}`, 307);
    }
    return NextResponse.next();
  }

  if (host === APEX) {
    const p = url.pathname;
    const isShared = SHARED_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
    if (!isShared) {
      const rewritten = url.clone();
      rewritten.pathname = p === "/" ? "/site" : `/site${p}`;
      // Behind a TLS-terminating proxy (Cloudflare tunnel / nginx) the app is
      // reached over plaintext loopback, but X-Forwarded-Proto makes nextUrl's
      // protocol "https". An https rewrite target no longer matches the server's
      // real origin, so Next proxies it over TLS to the http port → EPROTO 500.
      // Pin the internal rewrite to the loopback protocol so it stays same-origin.
      rewritten.protocol = "http:";
      return NextResponse.rewrite(rewritten);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and image optimisation; run on everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
