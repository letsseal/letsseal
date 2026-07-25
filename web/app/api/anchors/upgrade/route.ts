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
  const reanchored = await reanchorOrphans();
  const upgraded = await upgradePendingAnchors();
  let log: { anchored: number; upgraded: number; treeSize: number } | null = null;
  try { log = await anchorTreeHeads(); } catch {  }
  return NextResponse.json({ ok: true, reanchored, upgraded, log });
}
