import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { Wordmark } from "@/components/brand/Wordmark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReportForm } from "./_form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report a business · Let's Seal", robots: { index: false } };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ org?: string; hash?: string }> }) {
  const { org: slug = "", hash = "" } = await searchParams;
  const org = slug ? await db.organization.findUnique({ where: { slug }, select: { name: true, slug: true } }) : null;

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-10"><Wordmark href="/" size="md" /></div>
        <div className="space-y-1 pb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Report a business</h1>
          <p className="text-sm text-muted-foreground">
            A seal proves a file is unaltered and existed by a date. It doesn&apos;t confirm who the issuer is
            unless their domain is verified.
          </p>
        </div>
        {org ? (
          <ReportForm slug={org.slug} orgName={org.name} proofHash={hash} />
        ) : (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>No business was specified. Use the report link on the document&apos;s proof page.</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
