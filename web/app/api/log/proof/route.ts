import { NextRequest, NextResponse } from "next/server";
import { getInclusionProof } from "@/lib/translog";
import { withCors, preflight } from "@/lib/cors";

export function OPTIONS() { return preflight(); }

export async function GET(req: NextRequest) {
  const sha256 = req.nextUrl.searchParams.get("sha256") ?? undefined;
  const leafHash = req.nextUrl.searchParams.get("leaf") ?? undefined;
  if (!sha256 && !leafHash) {
    return withCors(NextResponse.json({ error: "provide ?sha256=<hex> or ?leaf=<hex>" }, { status: 400 }));
  }
  try {
    const p = await getInclusionProof({ sha256, leafHash });
    if (!p) return withCors(NextResponse.json({ error: "not found in log" }, { status: 404 }));
    return withCors(NextResponse.json(p, { headers: { "Cache-Control": "public, max-age=10" } }));
  } catch (e) {
    return withCors(NextResponse.json({ error: `proof failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
