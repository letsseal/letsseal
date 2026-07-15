import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import {
  flowProvider, buildAuthorizeUrl, redirectUri, newState, signFlow, FLOW_COOKIE,
} from "@/lib/oidc-flow";

export async function GET(req: NextRequest) {
  const userId = await apiUser();
  if (!userId) return NextResponse.redirect(new URL("/signin", req.url));

  const sp = req.nextUrl.searchParams;
  const providerId = (sp.get("provider") || "").trim().toLowerCase();
  const orgSlug = (sp.get("org") || "").trim().toLowerCase();
  const sha256 = (sp.get("sha256") || "").trim().toLowerCase();
  const title = sp.get("title")?.slice(0, 200) || null;

  const p = flowProvider(providerId);
  if (!p) return NextResponse.redirect(fail(req, orgSlug, "provider_unavailable"));
  if (!/^[0-9a-f]{64}$/.test(sha256)) return NextResponse.redirect(fail(req, orgSlug, "bad_digest"));

  const org = await requireOrg(userId, orgSlug);
  if (!org) return NextResponse.redirect(fail(req, orgSlug, "not_a_member"));

  const { state, nonce } = newState();
  const redirect = redirectUri(req.nextUrl.origin);
  const authorizeUrl = buildAuthorizeUrl(p, { state, nonce, redirectUri: redirect });

  const cookie = signFlow({ provider: providerId, sha256, title, orgSlug, state, nonce });
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(FLOW_COOKIE, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", 
    path: "/api/identity",
    maxAge: cookie.maxAge,
  });
  return res;
}

function fail(req: NextRequest, orgSlug: string, reason: string): URL {
  const base = orgSlug ? `/${orgSlug}/identity` : "/";
  const u = new URL(base, req.url);
  u.searchParams.set("error", reason);
  return u;
}
