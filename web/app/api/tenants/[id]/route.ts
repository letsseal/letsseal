import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkTenantAdmin } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await apiUser();
  const chk = await checkTenantAdmin(userId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });

  const body = await req.json().catch(() => ({}));
  const data: { enterprise?: boolean } = {};
  if (typeof body.enterprise === "boolean") data.enterprise = body.enterprise;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const tenant = await db.tenant.update({ where: { id }, data, select: { id: true, enterprise: true } });
  return NextResponse.json({ ok: true, tenant });
}
