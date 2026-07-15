import type { Metadata } from "next";
import { peekChallenge } from "@/lib/domain-verify";
import { ConfirmDomain } from "./_confirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify a domain · Let's Seal", robots: { index: false } };

export default async function VerifyDomainPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ch = await peekChallenge(token);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Domain verification</h1>
        {!ch || ch.status === "invalid" ? (
          <p className="mt-3 text-sm text-muted-foreground">This verification link isn&apos;t valid. Start a new one from your organisation&apos;s settings.</p>
        ) : ch.status === "expired" ? (
          <p className="mt-3 text-sm text-muted-foreground">This link has expired. Start a new verification from your organisation&apos;s settings.</p>
        ) : ch.status === "verified" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <div className="text-lg font-semibold text-emerald-800">Already verified ✓</div>
            <p className="mt-1.5 text-sm text-emerald-700"><b>{ch.org}</b> is verified as controlling <b>{ch.domain}</b>.</p>
          </div>
        ) : (
          <div className="mt-4">
            <ConfirmDomain token={token} domain={ch.domain} org={ch.org} />
          </div>
        )}
      </div>
    </main>
  );
}
