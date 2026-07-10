import { notFound } from "next/navigation";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import BulkSealer from "@/components/BulkSealer";

export const dynamic = "force-dynamic";

export default async function SealPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Seal &amp; anchor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk-seal PDFs you already generate — invoices, statements, reports. Each is sealed
          as <b>{org.name}</b> and anchored, with a permanent link anyone can verify. This proves the
          document is genuinely from you and unaltered; it doesn&apos;t require any signatures.
        </p>
      </div>
      <BulkSealer slug={org.slug} />
    </div>
  );
}
