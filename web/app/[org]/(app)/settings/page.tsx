import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import BrandingEditor from "@/components/BrandingEditor";
import ApiKeysManager from "@/components/ApiKeysManager";
import DomainVerification from "@/components/DomainVerification";
import { pendingForSettings } from "@/lib/domain-verify";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

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

  return (
    <div className="mx-auto max-w-4xl">
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

      <Separator className="my-10" />

      <div id="issuer-identity" className="mb-6 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Issuer identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prove <b>{org.name}</b> controls its domain to earn a verified badge on every proof it seals.
          The domain is the identity — globally unique, so it never clashes with another business of the same name.
        </p>
      </div>
      <DomainVerification
        slug={org.slug}
        initialVerified={org.verifiedDomain ? { domain: org.verifiedDomain, via: org.domainVerifiedVia } : null}
        initialPending={initialPending}
      />

      <Separator className="my-10" />

      <div id="api-keys" className="mb-6 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">API keys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seal, verify, and anchor from your own code. A key acts as <b>{org.name}</b> — keep it secret.
        </p>
      </div>
      <ApiKeysManager slug={org.slug} initialKeys={initialKeys} appUrl={appUrl} />
    </div>
  );
}
