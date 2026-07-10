import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getSigningTrail } from "@/lib/signing-audit";
import { MAX_UPLOAD_BYTES, tooLarge } from "@/lib/limits";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function POST(req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const ref = hash.toLowerCase();
  if (!isHash(ref)) return NextResponse.json({ error: "invalid reference" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "a 'file' field is required" }, { status: 400 });
  if (tooLarge(file)) return NextResponse.json({ error: `file too large (${MAX_UPLOAD_BYTES / 1_000_000}MB max)` }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== ref) {
    // Not the file — no possession, no reveal. Generic message (don't confirm existence).
    return NextResponse.json({ error: "This file doesn't match this proof." }, { status: 403 });
  }

  const rec = await db.sealedDocument.findUnique({
    where: { sha256: ref },
    include: { envelope: true },
  });
  if (!rec) return NextResponse.json({ error: "no proof on record" }, { status: 404 });

  const title = rec.title ?? rec.envelope?.title ?? null;
  const trail = rec.envelopeId ? await getSigningTrail(rec.envelopeId) : null;

  return NextResponse.json({ title, trail });
}
