import { NextResponse } from "next/server";
import { buildTrustedRoot } from "@/lib/trusted-root";

export const revalidate = 3600;

export async function GET() {
  try {
    const tr = await buildTrustedRoot();
    return NextResponse.json(tr, {
      headers: { "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `trusted_root unavailable: ${e instanceof Error ? e.message : e}` },
      { status: 503 },
    );
  }
}
