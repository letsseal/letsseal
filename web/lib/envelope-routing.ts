import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { canSend, recordSend } from "@/lib/send-guard";
import { sendSigningInvite } from "@/lib/mailer";
import { isSigningRole } from "@/lib/signers";
import { issuerFrom, issuerLogoUrl } from "@/lib/issuer";

type EnvForInvite = {
  id: string;
  title: string;
  message: string | null;
  org: { id: string; name: string; brandColor: string | null; fromEmail: string | null; verifiedDomain?: string | null; logoUrl?: string | null };
};
type SignerRow = { id: string; name: string; email: string | null; token: string; role: string; order: number };

export async function inviteSigner(env: EnvForInvite, signer: SignerRow): Promise<{ emailed: boolean; link: string }> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${base}/sign/${signer.token}`;
  let emailed = false;
  if (signer.email) {
    const gate = await canSend(env.org.id);
    if (gate.ok) {
      try {
        emailed = await sendSigningInvite({
          to: signer.email, signerName: signer.name, envelopeTitle: env.title,
          orgName: env.org.name, verifiedDomain: env.org.verifiedDomain, logoUrl: env.org.logoUrl,
          brandColor: env.org.brandColor ?? undefined,
          replyTo: env.org.fromEmail ?? undefined, link, message: env.message ?? undefined,
        });
        if (emailed) {
          await recordSend(env.org.id, signer.email, "invite");
          await appendAudit(env.id, signer.id, "invite_sent", { details: `email:${signer.email}` });
        }
      } catch { emailed = false; }
    }
  }
  await db.signer.update({ where: { id: signer.id }, data: { invitedAt: new Date() } });
  return { emailed, link };
}

// After a signer completes in a sequential envelope, invite the next order group
// (only recipients who haven't been invited yet). No-op for parallel envelopes.
export async function advanceSequence(envelopeId: string): Promise<void> {
  const env = await db.envelope.findUnique({
    where: { id: envelopeId },
    include: { org: { include: { tenant: true } }, signers: true },
  });
  if (!env || !env.sequential) return;
  // Same shape the send endpoint builds, so later invites in a sequential
  // envelope carry the verified badge too.
  const forInvite = {
    id: env.id, title: env.title, message: env.message,
    org: {
      id: env.org.id, name: env.org.name, brandColor: env.org.brandColor, fromEmail: env.org.fromEmail,
      verifiedDomain: issuerFrom(env.org),
      logoUrl: issuerLogoUrl(env.org),
    },
  };
  const signing = env.signers.filter((s) => isSigningRole(s.role));
  const pending = signing.filter((s) => s.status !== "signed" && s.status !== "declined");
  if (!pending.length) return; // everyone's done — completion is handled elsewhere
  const currentOrder = Math.min(...pending.map((s) => s.order));
  // Guard: don't advance while a lower order still owes a signature.
  if (signing.some((s) => s.order < currentOrder && s.status !== "signed" && s.status !== "declined")) return;
  const toInvite = signing.filter((s) => s.order === currentOrder && !s.invitedAt);
  for (const s of toInvite) {
    await inviteSigner(forInvite, s as SignerRow);
    await appendAudit(envelopeId, "system", "routed", { details: `invited ${s.name} (order ${s.order})` });
  }
}
