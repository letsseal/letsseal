import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { rateLimited } from "@/lib/ratelimit";

const CATEGORIES = new Set(["impersonation", "fraud", "phishing", "other"]);

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(`report:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "too many reports — please try again later" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const orgSlug = String(body.orgSlug ?? "").trim();
  const category = String(body.category ?? "").trim();
  if (!orgSlug) return NextResponse.json({ error: "orgSlug required" }, { status: 400 });
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "category must be impersonation | fraud | phishing | other" }, { status: 400 });
  }

  const org = await db.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "unknown organisation" }, { status: 404 });

  const detail = body.detail ? String(body.detail).slice(0, 2000) : null;
  const reporterEmail = body.reporterEmail ? String(body.reporterEmail).trim().slice(0, 200) : null;
  const proofHash = body.proofHash && /^[0-9a-f]{64}$/i.test(String(body.proofHash))
    ? String(body.proofHash).toLowerCase() : null;

  await db.abuseReport.create({
    data: { orgId: org.id, category, detail, reporterEmail, proofHash },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
