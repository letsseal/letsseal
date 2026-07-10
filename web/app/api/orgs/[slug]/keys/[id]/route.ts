import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser, requireOrg } from "@/lib/auth-helpers";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const key = await db.apiKey.findFirst({ where: { id, orgId: org.id } });
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!key.revokedAt) await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
