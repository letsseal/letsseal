import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { revokeCredential } from "@/lib/credentials";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "signer");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const body = await req.json().catch(() => ({}));
  const ok = await revokeCredential(org.id, id, body?.reason ? String(body.reason).slice(0, 200) : undefined);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
