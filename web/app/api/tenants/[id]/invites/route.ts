import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkTenantAdmin } from "@/lib/rbac";
import { createInvitation, inviteRoleLabel } from "@/lib/invitations";
import { sendAccountInvitation } from "@/lib/mailer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await apiUser();
  const chk = await checkTenantAdmin(userId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });

  const invites = await db.invitation.findMany({
    where: { tenantId: id, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, orgId: true, createdAt: true, expiresAt: true, org: { select: { name: true } } },
  });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await apiUser();
  const chk = await checkTenantAdmin(userId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "");
  const orgId = body.orgId ? String(body.orgId) : null;

  let invite;
  try {
    invite = await createInvitation({ tenantId: id, orgId, email, role, invitedById: userId! });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "could not create invite" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/invite/${invite.token}`;
  const inviter = await db.user.findUnique({ where: { id: userId! }, select: { name: true, email: true } });
  const sent = await sendAccountInvitation({
    to: email, accountName: chk.tenant.name, inviterName: inviter?.name || inviter?.email || "A teammate",
    roleLabel: inviteRoleLabel(invite), link,
  }).catch(() => false);

  return NextResponse.json({ ok: true, invite: { id: invite.id, email, role, orgId }, emailed: sent, link });
}
