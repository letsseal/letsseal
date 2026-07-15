import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { enabledFlowProviders } from "@/lib/oidc-flow";
import { IdentitySeal } from "@/components/IdentitySeal";

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Seal under a verified identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign an artifact as <b>you</b> — a person whose email a third party (Google, GitHub) has
          verified — not just as {org.name}. The seal binds that verified email into a short-lived
          certificate and records who vouched for it. Let&apos;s Seal never verifies identity itself.
          The result verifies with stock <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">cosign verify-blob</code>.
        </p>
      </div>

      {providers.length > 0 ? (
        <IdentitySeal slug={org.slug} providers={providers} initialError={error ?? null} />
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No identity providers are configured yet.</p>
          <p className="mt-1">
            An operator enables this by adding an OAuth client&apos;s credentials
            (<code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">AUTH_GOOGLE_ID</code>/
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">_SECRET</code>, and the matching
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">OIDC_GOOGLE_CLIENT_ID</code> on the signing service),
            plus the redirect URI <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">/api/identity/callback</code>.
          </p>
        </div>
      )}
    </div>
  );
}
