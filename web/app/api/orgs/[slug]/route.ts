import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { orgNameProblem } from "@/lib/org-name";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 400_000; 

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "admin");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;

  const body = await req.json();
  const data: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    const nameProblem = orgNameProblem(name);
    if (nameProblem) return NextResponse.json({ error: nameProblem }, { status: 400 });
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
    } else if (
      typeof logo === "string" && logo.startsWith("data:image/") &&
      // Reject SVG — it can carry <script>/onload and would execute wherever the
      // logo is rendered. Only raster image types are allowed.
      !/^data:image\/svg/i.test(logo) && logo.length <= MAX_LOGO_BYTES
    ) {
      data.logoUrl = logo;
    } else {
      return NextResponse.json({ error: "Logo must be a PNG/JPG/GIF/WebP image under 400KB (SVG not allowed)" }, { status: 400 });
    }
  }

  const updated = await db.organization.update({ where: { id: org.id }, data });
  return NextResponse.json({
    ok: true,
    org: { slug: updated.slug, name: updated.name, brandColor: updated.brandColor, accentColor: updated.accentColor, logoUrl: updated.logoUrl, fromEmail: updated.fromEmail },
  });
}
