import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser, requireOrg } from "@/lib/auth-helpers";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 400_000; 

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return NextResponse.json({ error: "Name is too short" }, { status: 400 });
    data.name = name;
  }
  for (const key of ["brandColor", "accentColor"] as const) {
    if (body[key] !== undefined) {
      if (!HEX.test(String(body[key]))) return NextResponse.json({ error: `${key} must be a #rrggbb hex colour` }, { status: 400 });
      data[key] = String(body[key]);
    }
  }
  if (body.fromEmail !== undefined) {
    const e = String(body.fromEmail).trim();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: "Invalid from-email" }, { status: 400 });
    data.fromEmail = e || null;
  }
  if (body.logoUrl !== undefined) {
    const logo = body.logoUrl;
    if (logo === null || logo === "") {
      data.logoUrl = null;
    } else if (typeof logo === "string" && logo.startsWith("data:image/") && logo.length <= MAX_LOGO_BYTES) {
      data.logoUrl = logo;
    } else {
      return NextResponse.json({ error: "Logo must be an image under 400KB" }, { status: 400 });
    }
  }

  const updated = await db.organization.update({ where: { id: org.id }, data });
  return NextResponse.json({
    ok: true,
    org: { slug: updated.slug, name: updated.name, brandColor: updated.brandColor, accentColor: updated.accentColor, logoUrl: updated.logoUrl, fromEmail: updated.fromEmail },
  });
}
