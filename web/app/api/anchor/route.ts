import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { anchorHash } from "@/lib/signing";
import { clientIp } from "@/lib/ip";
import { overContentLength, tooLarge } from "@/lib/limits";
import { rateLimitedAsync } from "@/lib/ratelimit";

const LIMIT = 20, WINDOW_MS = 60 * 60 * 1000;

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await rateLimitedAsync(`anchor:${ip}`, LIMIT, WINDOW_MS)) {
    return NextResponse.json({ error: "rate limit exceeded, try later" }, { status: 429 });
  }

  let sha256 = "";
  let label: string | null = null;
  const ctype = req.headers.get("content-type") ?? "";

  if (ctype.includes("application/json")) {
    if (overContentLength(req, 16_384)) return NextResponse.json({ error: "payload too large" }, { status: 413 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    sha256 = String(body.sha256 ?? "").trim().toLowerCase();
    label = body.label ? String(body.label).slice(0, 200) : null;
  } else {
    if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file or sha256" }, { status: 400 });
    if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer()); 
    sha256 = createHash("sha256").update(bytes).digest("hex");
    label = file.name ? file.name.slice(0, 200) : null;
  }

  if (!isHash(sha256)) return NextResponse.json({ error: "sha256 must be 64 hex chars" }, { status: 400 });

  const existing = await db.anchor.findUnique({ where: { sha256 } });
  if (existing) {
    return NextResponse.json({ sha256, proof: `/d/${sha256}`, state: existing.anchorState, existing: true });
  }

  let otsProof: string | null = null;
  let anchorState = "pending";
  try {
    const anchored = await anchorHash(sha256);
    otsProof = anchored.ots_b64;
    anchorState = anchored.status.state;
  } catch (e) {
    return NextResponse.json({ error: `anchoring failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  await db.anchor.create({ data: { sha256, label, otsProof, anchorState } });
  return NextResponse.json({ sha256, proof: `/d/${sha256}`, state: anchorState });
}
