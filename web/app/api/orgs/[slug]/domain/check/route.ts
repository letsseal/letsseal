import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import { checkDnsChallenge } from "@/lib/domain-verify";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const r = await checkDnsChallenge(org.id);
  return NextResponse.json(r);
}
