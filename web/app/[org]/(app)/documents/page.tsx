import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { DocTable } from "@/components/app-shell/DocTable";
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

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="text-2xl font-semibold tracking-tight">Documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything this business has sealed, issued, or sent to sign — {rows.length} total.
      </p>
      <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <DocTable rows={rows} emptyText="No documents yet. Seal a document, issue a credential, or send one to sign." />
      </div>
    </div>
  );
}
