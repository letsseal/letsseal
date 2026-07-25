import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { startChallenge, clearVerification } from "@/lib/domain-verify";
import { sendDomainVerification } from "@/lib/mailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const body = await req.json().catch(() => ({}));
  const method = body.method === "email" ? "email" : "dns";
  const { result, token, emailTo } = await startChallenge(org.id, String(body.domain ?? ""), method, body.alias);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (method === "email" && token && emailTo) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const sent = await sendDomainVerification({
      to: emailTo, domain: result.domain, orgName: org.name, link: `${appUrl}/verify-domain/${token}`,
    });
    if (!sent) {
      return NextResponse.json(
        { error: "Email delivery isn't configured on this deployment — use DNS verification instead." },
        { status: 400 },
      );
    }
  }
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;
  await clearVerification(org.id);
  return NextResponse.json({ ok: true });
}
