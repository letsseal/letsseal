import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
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

  return (
    <div className="grid min-h-screen md:grid-cols-[248px_1fr]">
      <Sidebar
        slug={org.slug}
        orgName={org.name}
        brandColor={org.brandColor}
        docCount={docCount}
        enterprise={org.tenant?.enterprise ?? false}
        accountName={org.tenant?.name}
      />
      <div className="flex min-h-screen min-w-0 flex-col">
        <AppHeader slug={org.slug} userName={user.name} userEmail={user.email} />
        {!acct?.emailVerified && <VerifyBanner email={user.email} />}
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
