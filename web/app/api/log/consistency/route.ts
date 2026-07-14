import { NextRequest, NextResponse } from "next/server";
import { getConsistencyProof } from "@/lib/translog";
import { withCors, preflight } from "@/lib/cors";

export function OPTIONS() { return preflight(); }

export async function GET(req: NextRequest) {
  const first = Number(req.nextUrl.searchParams.get("first"));
  const second = Number(req.nextUrl.searchParams.get("second"));
  if (!Number.isInteger(first) || !Number.isInteger(second) || first < 1 || second < first) {
    return withCors(NextResponse.json({ error: "provide integer ?first=&second= with 1 <= first <= second" }, { status: 400 }));
  }
  try {
    const proof = await getConsistencyProof(first, second);
    return withCors(NextResponse.json({ first, second, proof }, { headers: { "Cache-Control": "public, max-age=10" } }));
  } catch (e) {
    return withCors(NextResponse.json({ error: `consistency failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
