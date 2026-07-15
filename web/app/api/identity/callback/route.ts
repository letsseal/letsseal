import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import { hostedSealIdentity } from "@/lib/hosted";
import { flowProvider, exchangeCode, redirectUri, verifyFlow, FLOW_COOKIE } from "@/lib/oidc-flow";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const flow = verifyFlow(req.cookies.get(FLOW_COOKIE)?.value);

  const done = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.cookies.set(FLOW_COOKIE, "", { path: "/api/identity", maxAge: 0 });
    return res;
  };
  const fail = (reason: string) => {
    const base = flow?.orgSlug ? `/${flow.orgSlug}/identity` : "/";
    const u = new URL(base, req.url);
    u.searchParams.set("error", reason);
    return done(u);
  };

  if (!flow) return fail("expired");
  // The provider may bounce the user (denied consent, etc.).
  if (sp.get("error")) return fail("denied");
  // CSRF: the state echoed by the provider must equal the one we signed in.
  const state = sp.get("state") || "";
  if (state !== flow.state) return fail("bad_state");
  const code = sp.get("code") || "";
  if (!code) return fail("no_code");

  const p = flowProvider(flow.provider);
  if (!p) return fail("provider_unavailable");

  // Re-assert the session + org membership at callback time (the cookie is CSRF
  // binding, not authorization).
  const userId = await apiUser();
  if (!userId) return fail("not_signed_in");
  const org = await requireOrg(userId, flow.orgSlug);
  if (!org) return fail("not_a_member");

  try {
    const token = await exchangeCode(p, code, redirectUri(req.nextUrl.origin));
    const r = await hostedSealIdentity(org, flow.sha256, flow.provider, token, { title: flow.title });
    return done(new URL(r.proofUrl));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A provider proof that doesn't verify (401 from the signing service) vs a
    // transport/exchange failure — surface distinctly for the UI.
    return fail(/\b401\b|did not verify/.test(msg) ? "not_verified" : "seal_failed");
  }
}
