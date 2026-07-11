import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";
import { passwordProblem } from "@/lib/password";
import { clientIp } from "@/lib/ip";

const IP_HITS = new Map<string, { n: number; resetAt: number }>();
const IP_LIMIT = 5, IP_WINDOW_MS = 60 * 60 * 1000; 
function ipLimited(ip: string): boolean {
  const now = Date.now();
  const rec = IP_HITS.get(ip);
  if (!rec || now > rec.resetAt) { IP_HITS.set(ip, { n: 1, resetAt: now + IP_WINDOW_MS }); return false; }
  rec.n += 1;
  return rec.n > IP_LIMIT;
}
let sendDayStart = 0, sendDayCount = 0;
const GLOBAL_DAILY_SENDS = 500; 
function globalSendOverBudget(): boolean {
  const now = Date.now();
  if (now - sendDayStart > 24 * 60 * 60 * 1000) { sendDayStart = now; sendDayCount = 0; }
  sendDayCount += 1;
  return sendDayCount > GLOBAL_DAILY_SENDS;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (ipLimited(ip)) return NextResponse.json({ error: "Too many sign-up attempts. Please try again later." }, { status: 429 });

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
      if (globalSendOverBudget()) throw new Error("global verification-send budget exhausted");
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
