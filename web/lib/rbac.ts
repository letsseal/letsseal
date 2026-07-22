import { db } from "./db";

export const ORG_ROLES = ["viewer", "signer", "admin"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const TENANT_ROLES = ["member", "billing", "admin", "owner"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export function normalizeOrgRole(raw: string | null | undefined): OrgRole {
  switch (raw) {
    case "owner":
    case "admin":
      return "admin";
    case "viewer":
      return "viewer";
    case "signer":
    case "member":
    default:
      return "signer";
  }
}

export const orgRoleAtLeast = (role: OrgRole, min: OrgRole): boolean =>
  ORG_ROLES.indexOf(role) >= ORG_ROLES.indexOf(min);

export const isTenantAdmin = (role: string | null | undefined): boolean =>
  role === "owner" || role === "admin";

export type OrgAccess = {
  org: { id: string; slug: string; name: string; tenantId: string | null; status: string };
  orgRole: OrgRole;         
  tenantRole: TenantRole | null; 
  isMember: boolean;        
};

export async function resolveOrgAccess(userId: string, slug: string): Promise<OrgAccess | null> {
  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, tenantId: true, status: true,
      memberships: { where: { userId }, select: { role: true } },
    },
  });
  if (!org) return null;

  const m = org.memberships[0];
  let tenantRole: TenantRole | null = null;
  if (org.tenantId) {
    const tm = await db.tenantMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId: org.tenantId } },
      select: { role: true },
    });
    tenantRole = (tm?.role as TenantRole) ?? null;
  }

  const isMember = !!m;
  const tenantImpliesAdmin = isTenantAdmin(tenantRole);
  if (!isMember && !tenantImpliesAdmin) return null; 

  const base = m ? normalizeOrgRole(m.role) : "viewer";
  const orgRole: OrgRole = tenantImpliesAdmin ? "admin" : base;

  return { org: { id: org.id, slug: org.slug, name: org.name, tenantId: org.tenantId, status: org.status }, orgRole, tenantRole, isMember };
}

export async function checkTenantAdmin(userId: string | null, tenantId: string):
  Promise<{ ok: true; tenant: { id: string; slug: string; name: string; enterprise: boolean } } | { ok: false; status: 401 | 403 | 404; error: string }> {
  if (!userId) return { ok: false, status: 401, error: "sign in required" };
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true, name: true, enterprise: true } });
  if (!tenant) return { ok: false, status: 404, error: "account not found" };
  const tm = await db.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!isTenantAdmin(tm?.role)) return { ok: false, status: 403, error: "requires account admin" };
  return { ok: true, tenant };
}

export type RoleCheck =
  | { ok: true; access: OrgAccess }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function checkOrgRole(userId: string | null, slug: string, min: OrgRole): Promise<RoleCheck> {
  if (!userId) return { ok: false, status: 401, error: "sign in required" };
  const access = await resolveOrgAccess(userId, slug);
  if (!access) return { ok: false, status: 404, error: "not found" };
  if (!orgRoleAtLeast(access.orgRole, min)) {
    return { ok: false, status: 403, error: `requires ${min} role on this organisation` };
  }
  return { ok: true, access };
}
