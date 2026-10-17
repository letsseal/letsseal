import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import BulkSealer from "@/components/BulkSealer";
import { PageHeader } from "@/components/common/page-header";

export const dynamic = "force-dynamic";

export default async function SealPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Seal PDFs" />
      <BulkSealer slug={org.slug} />
    </div>
  );
}
