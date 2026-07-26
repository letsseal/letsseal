import { NextRequest, NextResponse } from "next/server";
import { runReminders, dueReminders, REMINDER_MAX, REMINDER_INTERVAL_DAYS } from "@/lib/reminders";
import { ctEqual } from "@/lib/ct";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !ctEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
  const only = url.searchParams.get("signerIds");
  const signerIds = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const result = await runReminders({ dryRun, limit, signerIds });
  return NextResponse.json({ ok: true, policy: { max: REMINDER_MAX, everyDays: REMINDER_INTERVAL_DAYS }, ...result });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !ctEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const due = await dueReminders();
  return NextResponse.json({
    ok: true,
    policy: { max: REMINDER_MAX, everyDays: REMINDER_INTERVAL_DAYS },
    due: due.length,
    recipients: due.map((d) => ({
      signerId: d.signerId,
      envelopeId: d.envelopeId,
      to: d.email,
      name: d.signerName,
      org: d.orgName,
      document: d.envelopeTitle,
      viewed: d.hasViewed,
      remindersAlreadySent: d.remindersSent,
      wouldBeFinal: d.isFinal,
      daysSinceLastContact: d.daysSinceContact,
    })),
  });
}
