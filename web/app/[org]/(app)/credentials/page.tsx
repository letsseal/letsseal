import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import CredentialsManager from "@/components/CredentialsManager";

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
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Credentials</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Issue branded, sealed certificates and credentials as <b>{org.name}</b>. Each one gets a permanent
          link anyone can verify in seconds. This attests the document is genuine and
          unaltered; it does not verify the recipient&apos;s identity.
        </p>
      </div>
      <CredentialsManager slug={org.slug} initial={initial} appUrl={appUrl} />
    </div>
  );
}
