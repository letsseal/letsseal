import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { apiUser, userOwnsEnvelope } from "@/lib/auth-helpers";
import { REMINDER_MAX } from "@/lib/reminders";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> },
) {
  const { id, signerId } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await userOwnsEnvelope(userId, id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const enabled = body?.remindersEnabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "remindersEnabled must be true or false" }, { status: 400 });
  }

  const signer = await db.signer.findFirst({
    where: { id: signerId, envelopeId: id },
    select: { id: true, name: true, email: true, remindersEnabled: true, remindersSent: true },
  });
  if (!signer) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (signer.remindersEnabled !== enabled) {
    await db.signer.update({ where: { id: signer.id }, data: { remindersEnabled: enabled } });
    await appendAudit(id, userId, enabled ? "reminders_enabled" : "reminders_disabled", {
      details: `recipient:${signer.email ?? signer.name}`,
    });
  }

  return NextResponse.json({
    ok: true,
    remindersEnabled: enabled,
    remindersSent: signer.remindersSent,
    remindersRemaining: Math.max(0, REMINDER_MAX - signer.remindersSent),
  });
}
