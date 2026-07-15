import { NextRequest, NextResponse } from "next/server";
import { confirmEmailToken } from "@/lib/domain-verify";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  const r = await confirmEmailToken(token);
  return NextResponse.json(r, { status: r.verified ? 200 : 400 });
}
