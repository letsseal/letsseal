import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";
import { passwordProblem, MAX_PASSWORD_LENGTH } from "@/lib/password";
import { clientIp } from "@/lib/ip";
import { rateLimitedAsync } from "@/lib/ratelimit";
import { overContentLength } from "@/lib/limits";

const IP_LIMIT = 5, IP_WINDOW_MS = 60 * 60 * 1000; 
const GLOBAL_DAILY_SENDS = 500;                    
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_BODY_BYTES = 8_192;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await rateLimitedAsync(`signup:${ip}`, IP_LIMIT, IP_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many sign-up attempts. Please try again later." }, { status: 429 });
  }

  if (overContentLength(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email, password, name } = body as { email?: unknown; password?: unknown; name?: unknown };

  const e = String(email ?? "").toLowerCase().trim();
  if (!e || e.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  const pw = String(password ?? "");
  if (pw.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` }, { status: 400 });
  }
  const pwProblem = passwordProblem(pw);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  const displayName = typeof name === "string" && name.trim() ? name.trim().slice(0, 200) : null;

  const existing = await db.user.findUnique({ where: { email: e }, select: { id: true } });
  if (!existing) {
    const passwordHash = await hash(pw);
    try {
      await db.user.create({ data: { email: e, name: displayName, passwordHash } });
    } catch {
      return NextResponse.json({ ok: true });
    }
    try {
      if (await rateLimitedAsync("signup:global:sends", GLOBAL_DAILY_SENDS, DAY_MS)) {
        throw new Error("global verification-send budget exhausted");
      }
      const token = randomBytes(32).toString("hex");
      await db.verificationToken.create({
        data: { identifier: e, token, expires: new Date(Date.now() + DAY_MS) },
      });
      const base = process.env.APP_URL ?? "http://localhost:3000";
      await sendVerificationEmail({ to: e, name: displayName ?? undefined, link: `${base}/verify-email?token=${token}` });
    } catch {  }
  }
  return NextResponse.json({ ok: true });
}
