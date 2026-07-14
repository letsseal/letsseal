import { NextRequest, NextResponse } from "next/server";
import { upgradePendingAnchors, reanchorOrphans } from "@/lib/anchors";
import { anchorTreeHeads } from "@/lib/translog";
import { ctEqual } from "@/lib/ct";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !ctEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // First re-anchor anything that missed anchoring at seal time, then advance
  // pending anchors toward Bitcoin confirmation.
  const reanchored = await reanchorOrphans();
  const upgraded = await upgradePendingAnchors();
  // Also anchor the transparency log's own root to Bitcoin (best-effort).
  let log: { anchored: number; upgraded: number; treeSize: number } | null = null;
  try { log = await anchorTreeHeads(); } catch { /* best-effort */ }
  return NextResponse.json({ ok: true, reanchored, upgraded, log });
}
