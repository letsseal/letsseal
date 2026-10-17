import type { Metadata } from "next";
import { CircleCheck, CircleX } from "lucide-react";
import { peekChallenge } from "@/lib/domain-verify";
import { CenteredPage } from "@/components/common/centered-page";
import { ConfirmDomain } from "./_confirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify a domain · Let's Seal", robots: { index: false } };

export default async function VerifyDomainPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ch = await peekChallenge(token);

  if (!ch || ch.status === "invalid" || ch.status === "expired") {
    return (
      <CenteredPage
        className="max-w-md"
        icon={CircleX}
        title={ch?.status === "expired" ? "Link expired" : "Link invalid"}
        description="Start a new verification from your business settings."
      />
    );
  }

  if (ch.status === "verified") {
    return (
      <CenteredPage
        className="max-w-md"
        icon={CircleCheck}
        iconClassName="text-success"
        title="Domain verified"
        description={<><span className="font-medium text-foreground">{ch.org}</span> is verified as controlling <span className="font-medium text-foreground">{ch.domain}</span>.</>}
      />
    );
  }

  return <ConfirmDomain token={token} domain={ch.domain} org={ch.org} />;
}
