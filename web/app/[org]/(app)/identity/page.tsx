import { notFound } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { enabledFlowProviders } from "@/lib/oidc-flow";
import { IdentitySeal } from "@/components/IdentitySeal";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";

export const dynamic = "force-dynamic";

export default async function IdentityPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: slug } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

  const providers = enabledFlowProviders();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Identity seal"
        description={`Seal a file under your own verified email, not just as ${org.name}.`}
      />
      {providers.length > 0 ? (
        <IdentitySeal slug={org.slug} providers={providers} initialError={error ?? null} />
      ) : (
        <EmptyState
          icon={Fingerprint}
          title="Identity sealing isn't available on this server"
          description="An administrator needs to configure an identity provider such as Google or GitHub."
        />
      )}
    </div>
  );
}
