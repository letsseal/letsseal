import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkTenantAdmin } from "@/lib/rbac";
import { issueOrgCert } from "@/lib/signing";
import { orgNameProblem } from "@/lib/org-name";

const HEX = /^#[0-9a-fA-F]{6}$/;
const cleanHex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v : undefined);

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(req: NextRequest) {
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, brandColor, accentColor, tenantId, enterprise } = await req.json();
  const trimmed = String(name ?? "").trim();
  const nameProblem = orgNameProblem(trimmed);
  if (nameProblem) return NextResponse.json({ error: nameProblem }, { status: 400 });
  const brand = cleanHex(brandColor);
  const accent = cleanHex(accentColor);

  let attachTenantId = typeof tenantId === "string" && tenantId ? tenantId : null;
  if (attachTenantId) {
    const chk = await checkTenantAdmin(userId, attachTenantId);
    if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  }

  const base = slugify(trimmed);
  if (!base) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });

  const owned = await db.membership.count({ where: { userId, role: "owner" } });
  if (owned >= 10)
    return NextResponse.json({ error: "You've reached the limit of businesses per account — contact us to raise it." }, { status: 429 });

  let slug = base;
  for (let n = 2; await db.organization.findUnique({ where: { slug } }); n++) {
    slug = `${base}-${n}`;
  }

  try {
    await issueOrgCert(slug, trimmed);
  } catch (e) {
    return NextResponse.json(
      { error: `Could not issue signing certificate: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }

  if (!attachTenantId) {
    let tSlug = slug;
    for (let n = 2; await db.tenant.findUnique({ where: { slug: tSlug } }); n++) tSlug = `${slug}-${n}`;
    const tenant = await db.tenant.create({
      data: { slug: tSlug, name: trimmed, enterprise: enterprise === true, memberships: { create: { userId, role: "owner" } } },
    });
    attachTenantId = tenant.id;
  }

  const org = await db.organization.create({
    data: {
      slug,
      name: trimmed,
      tenantId: attachTenantId,
      ...(brand ? { brandColor: brand } : {}),
      ...(accent ? { accentColor: accent } : {}),
      memberships: { create: { userId, role: "owner" } },
    },
  });

  return NextResponse.json({ id: org.id, slug: org.slug });
}
