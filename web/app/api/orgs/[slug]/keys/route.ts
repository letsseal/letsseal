import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { generateApiKey } from "@/lib/api-auth";

const VALID_SCOPES = ["seal", "verify", "anchor"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const keys = await db.apiKey.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 60) || "API key";
  let scopes: string[] = Array.isArray(body.scopes) ? body.scopes : VALID_SCOPES;
  scopes = scopes.filter((s) => VALID_SCOPES.includes(s));
  if (scopes.length === 0) scopes = VALID_SCOPES;

  const gen = generateApiKey();
  const key = await db.apiKey.create({
    data: { orgId: org.id, name, prefix: gen.prefix, lastFour: gen.lastFour, hash: gen.hash, scopes: scopes.join(",") },
    select: { id: true, name: true, prefix: true, lastFour: true, scopes: true, createdAt: true },
  });
  return NextResponse.json({ ...key, secret: gen.secret }, { status: 201 });
}
