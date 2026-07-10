import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import { revokeCredential } from "@/lib/credentials";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const ok = await revokeCredential(org.id, id, body?.reason ? String(body.reason).slice(0, 200) : undefined);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
