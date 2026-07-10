import { NextRequest, NextResponse } from "next/server";
import { verifyPdf } from "@/lib/signing";
import { withCors, preflight } from "@/lib/cors";
import { overContentLength, tooLarge } from "@/lib/limits";

export function OPTIONS() { return preflight(); }

export async function POST(req: NextRequest) {
  if (overContentLength(req)) return withCors(NextResponse.json({ error: "file too large" }, { status: 413 }));
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return withCors(NextResponse.json({ error: "multipart form with a 'file' field required" }, { status: 400 }));
  }
  if (tooLarge(file)) return withCors(NextResponse.json({ error: "file too large" }, { status: 413 }));
  const pdf = Buffer.from(await file.arrayBuffer());
  try {
    const v = await verifyPdf(pdf);
    return withCors(NextResponse.json(v));
  } catch (e) {
    return withCors(NextResponse.json({ error: `verify failed: ${e instanceof Error ? e.message : e}` }, { status: 502 }));
  }
}
