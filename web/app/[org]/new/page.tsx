import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import Builder from "@/components/Builder";

export const dynamic = "force-dynamic";

export default async function NewEnvelope({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ envelope?: string }>;
}) {
  const { org: slug } = await params;
  const { envelope } = await searchParams;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

  return (
    <Builder
      slug={slug}
      orgName={org.name}
      brandColor={org.brandColor}
      existingEnvelopeId={envelope ?? null}
    />
  );
}
