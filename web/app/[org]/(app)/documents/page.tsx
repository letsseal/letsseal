import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { DocTable } from "@/components/app-shell/DocTable";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { buildDocRows } from "@/lib/org-docs";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  if (!(await requireOrg(user.id, slug))) notFound();
  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      envelopes: { orderBy: { createdAt: "desc" }, include: { signers: true, sealed: true } },
      sealedDocuments: { orderBy: { sealedAt: "desc" } },
      credentials: { orderBy: { issuedOn: "desc" } },
    },
  });
  if (!org) notFound();

  const rows = buildDocRows(org);
  const newDoc = (
    <Button asChild>
      <Link href={`/${slug}/new`}><Plus /> New document</Link>
    </Button>
  );

  return (
    <>
      <PageHeader title="Documents" actions={rows.length > 0 && newDoc} />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" action={newDoc} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <DocTable rows={rows} />
        </div>
      )}
    </>
  );
}
