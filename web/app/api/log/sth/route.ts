import { NextResponse } from "next/server";
import { getSignedTreeHead } from "@/lib/translog";
import { withCors, preflight } from "@/lib/cors";

export function OPTIONS() { return preflight(); }

export async function GET() {
  try {
    const sth = await getSignedTreeHead();
    return withCors(NextResponse.json(sth, { headers: { "Cache-Control": "public, max-age=10" } }));
  } catch (e) {
    return withCors(NextResponse.json({ error: `sth failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
