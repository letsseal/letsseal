import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await db.organization.findUnique({
    where: { slug },
    select: { logoUrl: true, status: true },
  });
  if (!org?.logoUrl || org.status !== "active") return new NextResponse(null, { status: 404 });

  const m = org.logoUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!m) return new NextResponse(null, { status: 404 });
  const contentType = m[1] || "image/png";
  const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
