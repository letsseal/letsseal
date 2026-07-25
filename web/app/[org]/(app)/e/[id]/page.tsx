import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { getSigningTrail } from "@/lib/signing-audit";
import EnvelopeShare from "@/components/EnvelopeShare";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null | undefined, withTime = false) =>
  d
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(d)
    : null;

function signerLabel(s: { status: string; signedAt: Date | null; viewedAt: Date | null; invitedAt: Date | null }) {
  if (s.signedAt) return `Signed ${fmt(s.signedAt, true)}`;
  if (s.status === "declined") return "Declined";
  if (s.status === "viewed") { const t = fmt(s.viewedAt, true); return t ? `Opened ${t}` : "Opened"; }
  if (s.invitedAt) return `Invited ${fmt(s.invitedAt)}`;
  return null;
}

const ACTION_LABEL: Record<string, string> = {
  created: "created the document",
  sent: "sent it for signing",
  invite_sent: "was emailed an invitation",
  routed: "advanced to the next signer",
  viewed: "opened the document",
  signed: "signed",
  declined: "declined to sign",
  sealed: "sealed the document",
  anchored: "timestamped it on the blockchain",
  anchor_confirmed: "confirmed the blockchain timestamp",
  completed_notified: "sent completion notifications",
  verified: "verified the document",
};

export default async function EnvelopePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const user = await requireUser();
  if (!(await requireOrg(user.id, slug))) notFound();
  const envelope = await db.envelope.findUnique({
    where: { id },
    include: { org: true, signers: { orderBy: { order: "asc" } }, sealed: true },
  });
  if (!envelope || envelope.org.slug !== slug) notFound();

  const trail = await getSigningTrail(envelope.id);
  const activity = trail.entries
    .filter((e) => ACTION_LABEL[e.action])
    .map((e) => ({ who: e.actorName, label: ACTION_LABEL[e.action], at: fmt(new Date(e.at), true) ?? "" }));

  return (
    <EnvelopeShare
      activity={activity}
      slug={slug}
      envelope={{
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        completed: envelope.status === "completed",
        anchorState: envelope.sealed?.anchorState ?? "none",
        btcBlock: envelope.sealed?.btcBlock ?? null,
        createdLabel: fmt(envelope.createdAt) ?? "",
        completedLabel: fmt(envelope.completedAt),
        message: envelope.message,
        sequential: envelope.sequential,
      }}
      org={{ name: envelope.org.name, brandColor: envelope.org.brandColor }}
      signers={envelope.signers.map((s) => ({
        name: s.name,
        email: s.email,
        kind: s.kind,
        role: s.role,
        token: s.token,
        status: s.status,
        accessCode: s.accessCode,
        order: s.order,
        title: s.title,
        department: s.department,
        statusLabel: signerLabel(s),
      }))}
    />
  );
}
