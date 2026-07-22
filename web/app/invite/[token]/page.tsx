import Link from "next/link";
import { Building2, MailWarning } from "lucide-react";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { inviteRoleLabel } from "@/lib/invitations";
import { AcceptInvite } from "@/components/AcceptInvite";
import { Button } from "@/components/ui/button";
import { SealMark } from "@/components/brand/SealMark";

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
    : inv.status === "expired" || inv.expiresAt < new Date() ? "This invitation has expired."
    : null;

  const session = await auth();
  const signedIn = !!session?.user?.id;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="mb-6 flex items-center gap-2">
        <SealMark className="h-7 w-7" />
        <span className="text-lg font-bold tracking-[-0.04em]">LetsSeal</span>
      </div>

      {bad ? (
        <div className="w-full rounded-2xl border bg-card p-8 text-center">
          <MailWarning className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{bad}</p>
          <Button asChild variant="outline" className="mt-5"><Link href="/app">Go to Let&rsquo;s Seal</Link></Button>
        </div>
      ) : (
        <div className="w-full rounded-2xl border bg-card p-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" /> Invitation
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            Join {inv!.tenant.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <b>{inv!.invitedBy.name || inv!.invitedBy.email}</b> invited you
            {inv!.org ? <> to <b>{inv!.org.name}</b></> : null} as{" "}
            <b>{inviteRoleLabel(inv!)}</b>.
          </p>

          <div className="mt-6">
            {signedIn ? (
              <AcceptInvite token={token} />
            ) : (
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href={`/signin?next=/invite/${token}`}>Sign in to accept</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/signup?next=/invite/${token}`}>Create a free account</Link>
                </Button>
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Invited as {inv!.email}. You can accept with any account you sign in with.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
