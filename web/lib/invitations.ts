import { randomBytes } from "crypto";
import { db } from "./db";

const INVITE_TTL_DAYS = 14;

export const ACCOUNT_INVITE_ROLES = ["admin", "member"] as const;
export const ENTITY_INVITE_ROLES = ["admin", "signer", "viewer"] as const;

export function roleIsValid(orgId: string | null, role: string): boolean {
  return orgId
    ? (ENTITY_INVITE_ROLES as readonly string[]).includes(role)
    : (ACCOUNT_INVITE_ROLES as readonly string[]).includes(role);
}

export function inviteRoleLabel(inv: { orgId: string | null; role: string }): string {
  if (!inv.orgId) return inv.role === "admin" ? "Account admin" : "Account member";
  return inv.role === "admin" ? "Entity admin" : inv.role === "signer" ? "Signer" : "Viewer";
}

export type CreateInviteInput = {
  tenantId: string; orgId?: string | null; email: string; role: string; invitedById: string;
};

export async function createInvitation(input: CreateInviteInput) {
  const orgId = input.orgId ?? null;
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("invalid email address");
  if (!roleIsValid(orgId, input.role)) throw new Error("invalid role for this invite");
  if (orgId) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { tenantId: true } });
    if (!org || org.tenantId !== input.tenantId) throw new Error("entity is not part of this account");
  }
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  return db.invitation.create({
    data: {
      tenantId: input.tenantId, orgId, email, role: input.role,
      token: randomBytes(24).toString("hex"), invitedById: input.invitedById, expiresAt,
    },
  });
}

export type AcceptResult =
  | { ok: true; tenantId: string; orgSlug: string | null }
  | { ok: false; error: string };

export async function acceptInvitation(token: string, userId: string): Promise<AcceptResult> {
  const inv = await db.invitation.findUnique({ where: { token } });
  if (!inv) return { ok: false, error: "This invitation link is not valid." };
  if (inv.status !== "pending") return { ok: false, error: `This invitation was already ${inv.status}.` };
  if (inv.expiresAt < new Date()) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "expired" } });
    return { ok: false, error: "This invitation has expired." };
  }
  const acceptor = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!acceptor || acceptor.email.toLowerCase() !== inv.email.toLowerCase()) {
    return { ok: false, error: "This invitation was sent to a different email address. Sign in with that address to accept it." };
  }

  let orgSlug: string | null = null;
  await db.$transaction(async (tx) => {
    if (inv.orgId) {
      await tx.membership.upsert({
        where: { userId_orgId: { userId, orgId: inv.orgId } },
        update: { role: inv.role },
        create: { userId, orgId: inv.orgId, role: inv.role },
      });
      await tx.tenantMembership.upsert({
        where: { userId_tenantId: { userId, tenantId: inv.tenantId } },
        update: {}, 
        create: { userId, tenantId: inv.tenantId, role: "member" },
      });
      const org = await tx.organization.findUnique({ where: { id: inv.orgId }, select: { slug: true } });
      orgSlug = org?.slug ?? null;
    } else {
      await tx.tenantMembership.upsert({
        where: { userId_tenantId: { userId, tenantId: inv.tenantId } },
        update: { role: inv.role },
        create: { userId, tenantId: inv.tenantId, role: inv.role },
      });
    }
    await tx.invitation.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date() } });
  });

  return { ok: true, tenantId: inv.tenantId, orgSlug };
}
