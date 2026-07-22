import { db } from "@/lib/db";

export type Issuer = { name: string; verifiedDomain: string | null };

export async function issuerIdentity(orgId: string): Promise<string | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { status: true, tenant: { select: { verifiedDomain: true } } },
  });
  if (!org || org.status !== "active") return null;
  return org.tenant.verifiedDomain;
}

export function issuerFrom(org: { status: string; tenant: { verifiedDomain: string | null } }): string | null {
  return org.status === "active" ? org.tenant.verifiedDomain : null;
}

export function issuerLogoUrl(org: { slug: string; logoUrl: string | null }): string | null {
  if (!org.logoUrl) return null;
  const base = process.env.APP_URL ?? "https://letsseal.org";
  return `${base}/api/orgs/${org.slug}/logo`;
}
