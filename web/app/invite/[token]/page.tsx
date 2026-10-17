import Link from "next/link";
import { MailWarning } from "lucide-react";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { inviteRoleLabel } from "@/lib/invitations";
import { AcceptInvite } from "@/components/AcceptInvite";
import { Button } from "@/components/ui/button";
import { CenteredPage } from "@/components/common/centered-page";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invitation.findUnique({
    where: { token },
    include: {
      tenant: { select: { name: true } },
      org: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  const bad =
    !inv ? "This invitation link is not valid."
    : inv.status === "accepted" ? "This invitation has already been accepted."
    : inv.status === "revoked" ? "This invitation was revoked."
    : inv.status === "expired" || inv.expiresAt < new Date() ? "This invitation has expired. Ask the sender for a new one."
    : null;

  if (bad || !inv) {
    return (
      <CenteredPage icon={MailWarning} title="Invitation unavailable" description={bad}>
        <Button asChild variant="outline" className="w-full"><Link href="/app">Go to Let&rsquo;s Seal</Link></Button>
      </CenteredPage>
    );
  }

  const session = await auth();
  const signedIn = !!session?.user?.id;
  const strong = "font-medium text-foreground";

  return (
    <CenteredPage
      title={`Join ${inv.tenant.name}`}
      description={
        <>
          <span className={strong}>{inv.invitedBy.name || inv.invitedBy.email}</span> invited you
          {inv.org ? <> to <span className={strong}>{inv.org.name}</span></> : null} as{" "}
          <span className={strong}>{inviteRoleLabel(inv)}</span>.
        </>
      }
    >
      {signedIn ? (
        <AcceptInvite token={token} />
      ) : (
        <div className="grid gap-2">
          <Button asChild className="w-full">
            <Link href={`/signin?next=/invite/${token}`}>Sign in to accept</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/signup?next=/invite/${token}`}>Create an account</Link>
          </Button>
          <p className="pt-2 text-center text-xs text-muted-foreground">
            Sent to {inv.email}. You can accept with any account.
          </p>
        </div>
      )}
    </CenteredPage>
  );
}
