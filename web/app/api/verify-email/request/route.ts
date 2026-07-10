import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email ?? "").toLowerCase().trim();
  if (!e || !e.includes("@")) return NextResponse.json({ ok: true });

  const now = Date.now();
  const last = lastSent.get(e);
  if (last && now - last < COOLDOWN_MS) return NextResponse.json({ ok: true });
  lastSent.set(e, now);

  try {
    const user = await db.user.findUnique({ where: { email: e }, select: { name: true, emailVerified: true } });
    if (user && !user.emailVerified) {
      await db.verificationToken.deleteMany({ where: { identifier: e } });
      const token = randomBytes(32).toString("hex");
      await db.verificationToken.create({
        data: { identifier: e, token, expires: new Date(now + 24 * 60 * 60 * 1000) },
      });
      const base = process.env.APP_URL ?? "http://localhost:3000";
      await sendVerificationEmail({ to: e, name: user.name ?? undefined, link: `${base}/verify-email?token=${token}` });
    }
  } catch { /* non-fatal — still report ok */ }

  return NextResponse.json({ ok: true });
}
