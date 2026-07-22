import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { checkDnsChallenge } from "@/lib/domain-verify";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const r = await checkDnsChallenge(org.id);
  return NextResponse.json(r);
}
