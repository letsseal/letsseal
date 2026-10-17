import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import CredentialsManager from "@/components/CredentialsManager";
import { PageHeader } from "@/components/common/page-header";

export const dynamic = "force-dynamic";

export default async function CredentialsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

  const rows = await db.credential.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const initial = rows.map((c) => ({
    id: c.id,
    recipientName: c.recipientName,
    recipientEmail: c.recipientEmail,
    credType: c.credType,
    title: c.title,
    credentialCode: c.credentialCode,
    issuedOn: c.issuedOn.toISOString(),
    expiresOn: c.expiresOn?.toISOString() ?? null,
    sha256: c.sha256,
    revokedAt: c.revokedAt?.toISOString() ?? null,
  }));
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader
        title="Credentials"
        description="A proof link shows a credential is genuine. It doesn't verify the recipient's identity."
      />
      <CredentialsManager slug={org.slug} orgName={org.name} initial={initial} appUrl={appUrl} />
    </>
  );
}
