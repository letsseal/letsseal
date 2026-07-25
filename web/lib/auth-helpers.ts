import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import { resolveOrgAccess, orgRoleAtLeast, type OrgRole } from "./rbac";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as { id: string; email: string; name?: string | null };
}

export async function getUserOrgs(userId: string) {
  return db.organization.findMany({
    where: {
      OR: [
        { memberships: { some: { userId } } },
        { tenant: { memberships: { some: { userId, role: { in: ["owner", "admin"] } } } } },
      ],
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { envelopes: true } }, tenant: { select: { id: true, slug: true, name: true, enterprise: true } } },
  });
}

export async function getUserTenants(userId: string) {
  return db.tenant.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { name: "asc" },
    include: {
      memberships: { where: { userId }, select: { role: true } },
      organizations: { orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } },
    },
  });
}

export async function requireOrg(userId: string, slug: string) {
  const access = await resolveOrgAccess(userId, slug);
  if (!access) return null;
  return db.organization.findUnique({
    where: { id: access.org.id },
    include: {
      tenant: {
        select: {
          id: true, slug: true, name: true, enterprise: true,
          verifiedDomain: true, domainVerifiedAt: true, domainVerifiedVia: true,
        },
      },
    },
  });
}

export async function requireOrgRole(userId: string, slug: string, min: OrgRole) {
  const access = await resolveOrgAccess(userId, slug);
  if (!access) redirect("/app");
  if (!orgRoleAtLeast(access.orgRole, min)) redirect(`/${slug}`);
  return access;
}

export async function apiUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function userOwnsEnvelope(userId: string, envelopeId: string, min: OrgRole = "viewer") {
  const env = await db.envelope.findUnique({
    where: { id: envelopeId },
    select: { org: { select: { slug: true } } },
  });
  if (!env) return false;
  const access = await resolveOrgAccess(userId, env.org.slug);
  return !!access && orgRoleAtLeast(access.orgRole, min);
}
