import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { DocTable } from "@/components/app-shell/DocTable";
import { QuickSeal } from "@/components/app-shell/QuickSeal";
import { buildDocRows, withinWeek, relativeDate } from "@/lib/org-docs";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireUser();
  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      envelopes: { orderBy: { createdAt: "desc" }, include: { signers: true, sealed: true } },
      sealedDocuments: { orderBy: { sealedAt: "desc" } },
      credentials: { orderBy: { issuedOn: "desc" } },
    },
  });
  if (!org) notFound();

  const now = new Date();
  const envSealed = org.envelopes.filter((e) => e.sealed);

  const sealedTotal = org.sealedDocuments.length + envSealed.length;
  const sealedWeek =
    org.sealedDocuments.filter((d) => withinWeek(d.sealedAt, now)).length +
    envSealed.filter((e) => withinWeek(e.sealed!.sealedAt, now)).length;

  const awaiting = org.envelopes.filter((e) => e.status === "sent").length;
  const sentToday = org.envelopes.filter((e) => e.status === "sent" && relativeDate(e.createdAt, now) === "Today").length;

  const credTotal = org.credentials.length;
  const credWeek = org.credentials.filter((c) => withinWeek(c.issuedOn, now)).length;

  const metrics = [
    { label: "Sealed", value: sealedTotal, sub: sealedWeek > 0 ? `${sealedWeek} this week` : null },
    { label: "Awaiting signature", value: awaiting, sub: sentToday > 0 ? `${sentToday} sent today` : null },
    { label: "Credentials", value: credTotal, sub: credWeek > 0 ? `${credWeek} this week` : null },
  ];

  const rows = buildDocRows(org);
  const recent = rows.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <Button asChild>
            <Link href={`/${slug}/new`}><Plus /> New document</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border p-4 sm:p-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{m.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{m.value.toLocaleString()}</p>
            <p className="mt-1 h-4 text-xs text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Recent</h2>
            {rows.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${slug}/documents`}>View all <ArrowRight /></Link>
              </Button>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border">
            <DocTable
              rows={recent}
              empty={<EmptyState icon={FileText} title="No documents yet" description="Seal a PDF on the right, or send one for signing." className="border-0" />}
            />
          </div>
        </section>
        <QuickSeal slug={slug} />
      </div>
    </>
  );
}
