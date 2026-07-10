import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { anchorHash } from "@/lib/signing";
import { authApiKey } from "@/lib/api-auth";
import { proofUrl } from "@/lib/hosted";
import { overContentLength, tooLarge } from "@/lib/limits";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "anchor");
  if (!auth.ok) return auth.res;

  let sha256 = "";
  let label: string | null = null;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    sha256 = String(body.sha256 ?? "").trim().toLowerCase();
    label = body.label ? String(body.label).slice(0, 200) : null;
  } else {
    if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file or sha256" }, { status: 400 });
    if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
    sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    label = file.name ? file.name.slice(0, 200) : null;
  }
  if (!isHash(sha256)) return NextResponse.json({ error: "sha256 must be 64 hex chars" }, { status: 400 });

  const existing = await db.anchor.findUnique({ where: { sha256 } });
  if (existing) {
    return NextResponse.json({ sha256, state: existing.anchorState, proof: proofUrl(sha256), existing: true });
  }

  try {
    const a = await anchorHash(sha256);
    await db.anchor.create({ data: { sha256, label, otsProof: a.ots_b64, anchorState: a.status.state } });
    return NextResponse.json({ sha256, state: a.status.state, proof: proofUrl(sha256) });
  } catch (e) {
    return NextResponse.json({ error: `anchoring failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
