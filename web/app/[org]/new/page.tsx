import { notFound } from "next/navigation";
import { db } from "@/lib/db";
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
  const org = await db.organization.findUnique({ where: { slug } });
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
