import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, PenLine, Award, Anchor, ArrowUpRight, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { DocTable } from "@/components/app-shell/DocTable";
import { QuickSeal } from "@/components/app-shell/QuickSeal";
import { buildDocRows, withinWeek, relativeDate } from "@/lib/org-docs";

export const dynamic = "force-dynamic";

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
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

  const anchorsConfirmed =
    org.sealedDocuments.filter((d) => d.anchorState === "confirmed").length +
    envSealed.filter((e) => e.sealed!.anchorState === "confirmed").length;
  const anchorsPending =
    org.sealedDocuments.filter((d) => d.anchorState === "pending").length +
    envSealed.filter((e) => e.sealed!.anchorState === "pending").length;

  const metrics = [
    { label: "Documents sealed", value: sealedTotal, icon: ShieldCheck, trend: sealedWeek > 0 ? `+${sealedWeek} this week` : "all time" },
    { label: "Awaiting signature", value: awaiting, icon: PenLine, sub: sentToday > 0 ? `${sentToday} sent today` : "none pending" },
    { label: "Credentials issued", value: credTotal, icon: Award, trend: credWeek > 0 ? `+${credWeek} this week` : "all time" },
    { label: "Anchors confirmed", value: anchorsConfirmed, icon: Anchor, sub: anchorsPending > 0 ? `${anchorsPending} confirming` : "all confirmed" },
  ];

  const rows = buildDocRows(org);
  const recent = rows.slice(0, 5);
  const anchoredRow = rows.find((r) => r.anchor?.state === "confirmed");

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user.name || "").split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="text-2xl font-semibold tracking-tight">{greeting}, {firstName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Here&rsquo;s what&rsquo;s happening at {org.name}.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-2xl border bg-card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="mt-4 text-sm text-muted-foreground">{m.label}</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{m.value.toLocaleString()}</div>
              {m.trend ? (
                <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${m.trend.startsWith("+") ? "text-green-600" : "text-muted-foreground"}`}>
                  {m.trend.startsWith("+") && <TrendingUp className="h-3.5 w-3.5" />}
                  {m.trend}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">{m.sub}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-[15px] font-semibold">Recent documents</h3>
            <Link href={`/${slug}/documents`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="border-t">
            <DocTable rows={recent} emptyText="Nothing yet. Seal a document, issue a credential, or send one to sign." />
          </div>
        </div>

        <div className="space-y-5">
          <QuickSeal slug={slug} />
          {anchoredRow && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Authentic &amp; anchored</div>
                  <div className="truncate text-xs text-muted-foreground">{anchoredRow.title}</div>
                </div>
              </div>
              <Link href={anchoredRow.href} className="mt-4 flex items-center gap-1.5 text-xs font-medium text-orange-600">
                <Anchor className="h-3.5 w-3.5" /> Anchored to the blockchain · #{anchoredRow.anchor!.block}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
