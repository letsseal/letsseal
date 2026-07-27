import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { canSend, recordSend } from "@/lib/send-guard";
import { sendSigningReminder } from "@/lib/mailer";
import { isSigningRole } from "@/lib/signers";
import { issuerFrom, issuerLogoUrl } from "@/lib/issuer";

export const REMINDER_MAX = 2; 
export const REMINDER_INTERVAL_DAYS = 3;
const DAY_MS = 86_400_000;

export type DueReminder = {
  signerId: string;
  envelopeId: string;
  signerName: string;
  email: string;
  orgName: string;
  envelopeTitle: string;
  hasViewed: boolean;
  remindersSent: number; 
  isFinal: boolean;
  lastContactAt: Date;
  daysSinceContact: number;
};

export async function dueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * DAY_MS);

  const candidates = await db.signer.findMany({
    where: {
      status: { notIn: ["signed", "declined"] },
      email: { not: null },
      invitedAt: { not: null },
      remindersSent: { lt: REMINDER_MAX },
      remindersEnabled: true,
      envelope: { status: "sent" },
    },
    select: {
      id: true, name: true, email: true, role: true, status: true,
      invitedAt: true, lastReminderAt: true, remindersSent: true, viewedAt: true,
      envelope: {
        select: { id: true, title: true, status: true, org: { select: { name: true } } },
      },
    },
    orderBy: { invitedAt: "asc" },
  });

  const due: DueReminder[] = [];
  for (const s of candidates) {
    if (!isSigningRole(s.role) || !s.email || !s.invitedAt) continue;
    const lastContactAt = s.lastReminderAt ?? s.invitedAt;
    if (lastContactAt > cutoff) continue;
    due.push({
      signerId: s.id,
      envelopeId: s.envelope.id,
      signerName: s.name,
      email: s.email,
      orgName: s.envelope.org.name,
      envelopeTitle: s.envelope.title,
      hasViewed: s.status === "viewed" || s.viewedAt != null,
      remindersSent: s.remindersSent,
      isFinal: s.remindersSent + 1 >= REMINDER_MAX,
      lastContactAt,
      daysSinceContact: Math.floor((now.getTime() - lastContactAt.getTime()) / DAY_MS),
    });
  }
  return due;
}

export type ReminderRun = {
  due: number;
  sent: number;
  skipped: { email: string; reason: string }[];
  dryRun: boolean;
};

export async function runReminders(opts: { dryRun?: boolean; limit?: number; signerIds?: string[] } = {}): Promise<ReminderRun> {
  const dryRun = opts.dryRun ?? false;
  let due = await dueReminders();
  if (opts.signerIds?.length) {
    const wanted = new Set(opts.signerIds);
    due = due.filter((d) => wanted.has(d.signerId));
  }
  if (opts.limit != null) due = due.slice(0, opts.limit);

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const result: ReminderRun = { due: due.length, sent: 0, skipped: [], dryRun };

  for (const d of due) {
    const signer = await db.signer.findUnique({
      where: { id: d.signerId },
      select: {
        token: true, status: true, remindersSent: true, remindersEnabled: true,
        envelope: {
          select: {
            id: true, title: true, status: true,
            org: {
              select: {
                id: true, name: true, slug: true, status: true,
                brandColor: true, fromEmail: true, logoUrl: true,
                tenant: { select: { verifiedDomain: true } },
              },
            },
          },
        },
      },
    });
    if (!signer) { result.skipped.push({ email: d.email, reason: "recipient no longer exists" }); continue; }
    if (signer.status === "signed" || signer.status === "declined") {
      result.skipped.push({ email: d.email, reason: `already ${signer.status}` }); continue;
    }
    if (signer.envelope.status !== "sent") {
      result.skipped.push({ email: d.email, reason: `envelope is ${signer.envelope.status}` }); continue;
    }
    if (signer.remindersSent >= REMINDER_MAX) {
      result.skipped.push({ email: d.email, reason: "already at the reminder cap" }); continue;
    }
    if (!signer.remindersEnabled) {
      result.skipped.push({ email: d.email, reason: "reminders switched off for this recipient" }); continue;
    }

    const gate = await canSend(signer.envelope.org.id);
    if (!gate.ok) { result.skipped.push({ email: d.email, reason: gate.reason ?? "sending blocked" }); continue; }

    if (dryRun) { result.sent++; continue; }

    let emailed = false;
    try {
      emailed = await sendSigningReminder({
        to: d.email,
        signerName: d.signerName,
        envelopeTitle: signer.envelope.title,
        orgName: signer.envelope.org.name,
        verifiedDomain: issuerFrom(signer.envelope.org),
        logoUrl: issuerLogoUrl(signer.envelope.org),
        brandColor: signer.envelope.org.brandColor ?? undefined,
        replyTo: signer.envelope.org.fromEmail ?? undefined,
        link: `${base}/sign/${signer.token}`,
        hasViewed: d.hasViewed,
        finalReminder: signer.remindersSent + 1 >= REMINDER_MAX,
        unsubscribeUrl: `${base}/api/reminders/unsubscribe?token=${signer.token}`,
      });
    } catch {
      emailed = false;
    }
    if (!emailed) { result.skipped.push({ email: d.email, reason: "send failed" }); continue; }

    await db.signer.update({
      where: { id: d.signerId },
      data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
    });
    await recordSend(signer.envelope.org.id, d.email, "reminder");
    await appendAudit(signer.envelope.id, d.signerId, "reminder_sent", {
      details: `email:${d.email} (${signer.remindersSent + 1} of ${REMINDER_MAX})`,
    });
    result.sent++;
  }
  return result;
}
