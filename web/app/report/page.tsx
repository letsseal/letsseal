import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ReportForm } from "./_form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report an issuer · Let's Seal", robots: { index: false } };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ org?: string; hash?: string }> }) {
  const { org: slug = "", hash = "" } = await searchParams;
  const org = slug ? await db.organization.findUnique({ where: { slug }, select: { name: true, slug: true } }) : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Report an issuer</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us if an organisation on Let&apos;s Seal is impersonating someone or sealing documents fraudulently.
          A seal proves a file is unaltered and existed by a date — it does <b>not</b> vouch for who the issuer says
          they are unless their domain is verified. Reports go to our moderation team.
        </p>
        {org ? (
          <ReportForm slug={org.slug} orgName={org.name} proofHash={hash} />
        ) : (
          <p className="mt-6 text-sm text-amber-600">
            No organisation was specified. Open a proof page and use its &ldquo;Report this issuer&rdquo; link.
          </p>
        )}
      </div>
    </main>
  );
}
