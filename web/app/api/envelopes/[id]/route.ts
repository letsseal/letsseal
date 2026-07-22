import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { apiUser, userOwnsEnvelope } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { orgSuspendedResponse } from "@/lib/org-guard";
import { isMailConfigured } from "@/lib/mailer";
import { isSigningRole } from "@/lib/signers";
import { inviteSigner } from "@/lib/envelope-routing";
import { issuerFrom, issuerLogoUrl } from "@/lib/issuer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await apiUser();
  if (!userId || !(await userOwnsEnvelope(userId, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const env = await db.envelope.findUnique({
    where: { id },
    include: { signers: true, fields: true, org: true, sealed: true },
  });
  if (!env) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(env);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const env = await db.envelope.findUnique({ where: { id }, include: { org: { include: { tenant: true } } } });
  if (!env) return NextResponse.json({ error: "not found" }, { status: 404 });
  const chk = await checkOrgRole(userId, env.org.slug, "signer");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const suspended = orgSuspendedResponse(env.org);
  if (suspended) return suspended;
  const body = await req.json();
  const title: string | null = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  const message: string | null = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 2000) : null;
  const sequential: boolean = !!body.sequential;
  const signersIn: { name: string; email?: string; role?: string; accessCode?: string; title?: string; department?: string }[] =
    body.signers ?? [];
  const fieldsIn: {
    type: string; label?: string; page: number; x: number; y: number; w: number; h: number; signerIndex: number;
  }[] = body.fields ?? [];

  await db.field.deleteMany({ where: { envelopeId: id } });
  await db.signer.deleteMany({ where: { envelopeId: id } });

  const ROLES = ["signer", "in_person", "cc", "viewer"];
  const createdSigners = [];
  for (let i = 0; i < signersIn.length; i++) {
    const s = signersIn[i];
    const role = ROLES.includes(s.role ?? "") ? s.role! : (s.email ? "signer" : "in_person");
    const signer = await db.signer.create({
      data: {
        envelopeId: id,
        name: s.name,
        email: s.email || null,
        title: s.title?.trim() ? s.title.trim().slice(0, 120) : null,
        department: s.department?.trim() ? s.department.trim().slice(0, 120) : null,
        kind: role === "in_person" ? "in_person" : "remote",
        role,
        order: i + 1,
        token: randomBytes(24).toString("hex"),
        accessCode: s.accessCode || null,
      },
    });
    createdSigners.push(signer);
  }

  for (const f of fieldsIn) {
    const signer = createdSigners[f.signerIndex];
    if (signer && !isSigningRole(signer.role)) continue;
    await db.field.create({
      data: {
        envelopeId: id,
        signerId: signer?.id ?? null,
        type: f.type,
        label: f.label?.trim() ? f.label.trim().slice(0, 120) : null,
        page: f.page,
        x: f.x, y: f.y, w: f.w, h: f.h,
      },
    });
  }

  await db.envelope.update({ where: { id }, data: { status: "sent", message, sequential, ...(title ? { title } : {}) } });
  await appendAudit(id, "system", "sent", { details: `${createdSigners.length} recipients${sequential ? " · sequential" : ""}` });

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const envForInvite = {
    // title, not env.title: env was read before the update above, so it still holds
    // the pre-edit value. Emailing that is how recipients ended up with "Untitled".
    id, title: title ?? env.title, message,
    org: {
      id: env.org.id, name: env.org.name, brandColor: env.org.brandColor, fromEmail: env.org.fromEmail,
      verifiedDomain: issuerFrom(env.org),
      logoUrl: issuerLogoUrl(env.org),
    },
  };
  // Who gets invited right now: all signing recipients (parallel), or only the
  // first order group (sequential). cc/viewer are passive — they get the sealed
  // copy on completion, no signing link.
  const signing = createdSigners.filter((s) => isSigningRole(s.role));
  const firstOrder = signing.length ? Math.min(...signing.map((s) => s.order)) : 0;
  const inviteNow = new Set((sequential ? signing.filter((s) => s.order === firstOrder) : signing).map((s) => s.id));

  const out = [];
  for (const s of createdSigners) {
    const link = `${base}/sign/${s.token}`;
    const signingRole = isSigningRole(s.role);
    let emailed = false;
    let status: string;
    if (!signingRole) {
      status = "copy"; // cc / viewer
    } else if (!inviteNow.has(s.id)) {
      status = "queued"; // sequential — waits its turn
    } else {
      // inviteSigner rate-gates, emails (or not), records the audit, stamps invitedAt.
      const r = await inviteSigner(envForInvite, s);
      emailed = r.emailed;
      status = emailed ? "emailed" : (s.email ? "manual" : "in_person");
    }
    out.push({
      name: s.name, email: s.email, kind: s.kind, role: s.role, order: s.order,
      accessCode: s.accessCode, emailed, status,
      // Only surface the link where the drafter legitimately needs it (in-person,
      // or manual fallback). Emailed / queued / cc links are withheld.
      link: signingRole && !emailed && status !== "queued" ? link : null,
    });
  }

  return NextResponse.json({ ok: true, mailConfigured: isMailConfigured(), signers: out });
}
