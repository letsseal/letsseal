import { NextRequest, NextResponse } from "next/server";
import { upgradePendingAnchors, reanchorOrphans } from "@/lib/anchors";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // First re-anchor anything that missed anchoring at seal time, then advance
  // pending anchors toward Bitcoin confirmation.
  const reanchored = await reanchorOrphans();
  const upgraded = await upgradePendingAnchors();
  return NextResponse.json({ ok: true, reanchored, upgraded });
}
