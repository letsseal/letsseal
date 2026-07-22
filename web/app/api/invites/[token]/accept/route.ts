import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth-helpers";
import { acceptInvitation } from "@/lib/invitations";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const r = await acceptInvitation(token, userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
