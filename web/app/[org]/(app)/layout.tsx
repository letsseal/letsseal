import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { enabledFlowProviders } from "@/lib/oidc-flow";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { VerifyBanner } from "@/components/app-shell/VerifyBanner";

export const dynamic = "force-dynamic";

export default async function AppShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const user = await requireUser();
  if (!(await requireOrg(user.id, slug))) notFound();
  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      brandColor: true,
      tenant: { select: { name: true, enterprise: true } },
      _count: { select: { envelopes: true, sealedDocuments: true, credentials: true } },
    },
  });
  if (!org) notFound();
  const docCount = org._count.envelopes + org._count.sealedDocuments + org._count.credentials;
  const acct = await db.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });

  const identityEnabled = enabledFlowProviders().length > 0;
  const enterprise = org.tenant?.enterprise ?? false;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        slug={org.slug}
        orgName={org.name}
        brandColor={org.brandColor}
        docCount={docCount}
        enterprise={enterprise}
        accountName={org.tenant?.name}
        identityEnabled={identityEnabled}
        userName={user.name}
        userEmail={user.email}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader slug={org.slug} userName={user.name} userEmail={user.email} enterprise={enterprise} identityEnabled={identityEnabled} />
        {!acct?.emailVerified && <VerifyBanner email={user.email} />}
        <main className="flex-1 px-6 py-8 md:px-10 md:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
