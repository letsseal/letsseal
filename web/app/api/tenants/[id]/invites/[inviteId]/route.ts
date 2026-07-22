import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkTenantAdmin } from "@/lib/rbac";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const { id, inviteId } = await params;
  const userId = await apiUser();
  const chk = await checkTenantAdmin(userId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });

  const inv = await db.invitation.findFirst({ where: { id: inviteId, tenantId: id }, select: { id: true, status: true } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inv.status === "pending") {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "revoked" } });
  }
  return NextResponse.json({ ok: true });
}
