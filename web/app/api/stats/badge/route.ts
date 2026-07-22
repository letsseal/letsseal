import { NextResponse } from "next/server";
import { getNetworkStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getNetworkStats();
  const total = s.documentsSealed + s.standaloneTimestamps;
  return NextResponse.json(
    { schemaVersion: 1, label: "proof records", message: total.toLocaleString("en-US"), color: "0b7150", cacheSeconds: 3600 },
    { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
