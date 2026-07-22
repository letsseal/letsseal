import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import BrandingEditor from "@/components/BrandingEditor";
import ApiKeysManager from "@/components/ApiKeysManager";
import DomainVerification from "@/components/DomainVerification";
import { EnterpriseToggle } from "@/components/EnterpriseToggle";
import { pendingForSettings } from "@/lib/domain-verify";
import { checkOrgRole, isTenantAdmin } from "@/lib/rbac";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/app-shell/ThemeToggle";

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
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose how the app looks on this device.</p>
        </div>
        <ThemeToggle />
      </div>

      <Separator className="my-10" />

      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Branding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How <b>{org.name}</b> appears to signers and on its verification portal. The URL slug
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">{org.slug}</code>
          is fixed — it&apos;s tied to this business&apos;s signing certificate.
        </p>
      </div>
      <BrandingEditor org={{
        slug: org.slug, name: org.name, brandColor: org.brandColor,
        accentColor: org.accentColor, logoUrl: org.logoUrl, fromEmail: org.fromEmail,
      }} />

      {isOrgAdmin && (
        <>
          <Separator className="my-10" />

          <div id="issuer-identity" className="mb-6 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-tight">Issuer identity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prove <b>{org.name}</b> controls its domain to earn a verified badge on every proof it seals.
              The domain is the identity, globally unique, so it never clashes with another business of the same name.
            </p>
          </div>
          <DomainVerification
            slug={org.slug}
            initialVerified={org.tenant?.verifiedDomain ? { domain: org.tenant.verifiedDomain, via: org.tenant.domainVerifiedVia } : null}
            initialPending={initialPending}
          />

          <Separator className="my-10" />

          <div id="api-keys" className="mb-6 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-tight">API keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seal, verify, and anchor from your own code. A key acts as <b>{org.name}</b>, keep it secret.
            </p>
          </div>
          <ApiKeysManager slug={org.slug} initialKeys={initialKeys} appUrl={appUrl} />
        </>
      )}

      {tenant && canManageAccount && (
        <>
          <Separator className="my-10" />
          <div id="account" className="mb-6 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-tight">Account &amp; team</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional features for brands with several legal entities or more than one person.
            </p>
          </div>
          <EnterpriseToggle tenantId={tenant.id} tenantName={tenant.name} enabled={tenant.enterprise} />
        </>
      )}
    </div>
  );
}
