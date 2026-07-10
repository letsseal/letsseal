import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { sendVerificationEmail } from "@/lib/mailer";

export async function POST() {
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerified: true } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ ok: true, already: true });

  try {
    await db.verificationToken.deleteMany({ where: { identifier: user.email } });
    const token = randomBytes(32).toString("hex");
    await db.verificationToken.create({
      data: { identifier: user.email, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const sent = await sendVerificationEmail({ to: user.email, name: user.name ?? undefined, link: `${base}/verify-email?token=${token}` });
    return NextResponse.json({ ok: sent });
  } catch {
    return NextResponse.json({ error: "could not send" }, { status: 500 });
  }
}
