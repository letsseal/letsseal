import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });
  const vt = await db.verificationToken.findFirst({ where: { token } });
  if (!vt || vt.expires < new Date()) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await db.user.update({ where: { email: vt.identifier }, data: { emailVerified: new Date() } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await db.verificationToken.deleteMany({ where: { token } });
  return NextResponse.json({ ok: true });
}
