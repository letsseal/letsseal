import { NextResponse } from "next/server";
import { getRevocations } from "@/lib/signing";
import { withCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await getRevocations();
    return withCors(
      NextResponse.json(list, {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }),
    );
  } catch {
    return withCors(
      NextResponse.json(
        { error: "the revocation list is temporarily unavailable; do not treat this as an empty list" },
        { status: 503 },
      ),
    );
  }
}
