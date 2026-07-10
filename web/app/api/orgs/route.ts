import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { issueOrgCert } from "@/lib/signing";

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

  const { name, brandColor, accentColor } = await req.json();
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < 2) return NextResponse.json({ error: "Name is too short" }, { status: 400 });
  const brand = cleanHex(brandColor);
  const accent = cleanHex(accentColor);

  const base = slugify(trimmed);
  if (!base) return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });

  let slug = base;
  for (let n = 2; await db.organization.findUnique({ where: { slug } }); n++) {
    slug = `${base}-${n}`;
  }

  // Issue the CA signing certificate before persisting so a cert failure
  // doesn't leave a business that can't seal anything.
  try {
    await issueOrgCert(slug, trimmed);
  } catch (e) {
    return NextResponse.json(
      { error: `Could not issue signing certificate: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }

  const org = await db.organization.create({
    data: {
      slug,
      name: trimmed,
      ...(brand ? { brandColor: brand } : {}),
      ...(accent ? { accentColor: accent } : {}),
      memberships: { create: { userId, role: "owner" } },
    },
  });

  return NextResponse.json({ id: org.id, slug: org.slug });
}
