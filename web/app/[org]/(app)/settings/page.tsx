import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import BrandingEditor from "@/components/BrandingEditor";
import ApiKeysManager from "@/components/ApiKeysManager";
import DomainVerification from "@/components/DomainVerification";
import { EnterpriseToggle } from "@/components/EnterpriseToggle";
import { PageHeader } from "@/components/common/page-header";
import { pendingForSettings } from "@/lib/domain-verify";
import { checkOrgRole, isTenantAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();
  const isOrgAdmin = (await checkOrgRole(user.id, slug, "admin")).ok;

  const keyRows = await db.apiKey.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  const initialKeys = keyRows.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const initialPending = await pendingForSettings(org.id);

  const tenant = org.tenant;
  let canManageAccount = false;
  if (tenant) {
    const tm = await db.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      select: { role: true },
    });
    canManageAccount = isTenantAdmin(tm?.role);
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl gap-6">
        <BrandingEditor org={{
          slug: org.slug, name: org.name, brandColor: org.brandColor,
          logoUrl: org.logoUrl, fromEmail: org.fromEmail,
        }} />

        {isOrgAdmin && (
          <>
            <DomainVerification
              slug={org.slug}
              initialVerified={tenant?.verifiedDomain ? { domain: tenant.verifiedDomain, via: tenant.domainVerifiedVia } : null}
              initialPending={initialPending}
            />
            <ApiKeysManager slug={org.slug} initialKeys={initialKeys} appUrl={appUrl} />
          </>
        )}

        {tenant && canManageAccount && (
          <EnterpriseToggle tenantId={tenant.id} enabled={tenant.enterprise} />
        )}
      </div>
    </>
  );
}
