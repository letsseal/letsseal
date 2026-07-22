import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const key = await db.apiKey.findFirst({ where: { id, orgId: org.id } });
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!key.revokedAt) await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
