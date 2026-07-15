import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import { startChallenge, clearVerification } from "@/lib/domain-verify";
import { sendDomainVerification } from "@/lib/mailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

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

// Remove an org's domain verification (and retire pending challenges).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });
  await clearVerification(org.id);
  return NextResponse.json({ ok: true });
}
