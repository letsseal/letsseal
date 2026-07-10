import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";
import { passwordProblem } from "@/lib/password";

export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json();
  const e = String(email ?? "").toLowerCase().trim();
  if (!e || !e.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  const pwProblem = passwordProblem(String(password ?? ""));
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  const existing = await db.user.findUnique({ where: { email: e }, select: { id: true } });
  if (!existing) {
    const passwordHash = await hash(String(password));
    await db.user.create({ data: { email: e, name: name ? String(name) : null, passwordHash } });
    try {
      const token = randomBytes(32).toString("hex");
      await db.verificationToken.create({
        data: { identifier: e, token, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      const base = process.env.APP_URL ?? "http://localhost:3000";
      await sendVerificationEmail({ to: e, name, link: `${base}/verify-email?token=${token}` });
    } catch { /* non-fatal */ }
  }
  return NextResponse.json({ ok: true });
}
