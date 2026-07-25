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
import { overContentLength } from "@/lib/limits";

const MAX_ENVELOPE_JSON_BYTES = 1_000_000; 
const MAX_SIGNERS = 100;
const MAX_FIELDS = 500;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type SignerInput = {
  name?: unknown; email?: unknown; role?: unknown;
  accessCode?: unknown; title?: unknown; department?: unknown;
};
type FieldInput = {
  type?: unknown; label?: unknown; page?: unknown;
  x?: unknown; y?: unknown; w?: unknown; h?: unknown; signerIndex?: unknown;
};

function validateSigners(signers: SignerInput[]): string | null {
  for (const [i, s] of signers.entries()) {
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!name) return `Recipient ${i + 1} needs a name.`;
    if (name.length > 200) return `Recipient ${i + 1}'s name is too long (max 200 characters).`;
    if (s.email != null && s.email !== "") {
      if (typeof s.email !== "string" || !EMAIL_RE.test(s.email.trim()) || s.email.length > 320) {
        return `Recipient ${i + 1} has an invalid email address.`;
      }
    }
    if (s.accessCode != null && s.accessCode !== "") {
      if (typeof s.accessCode !== "string" || s.accessCode.length > 64) {
        return `Recipient ${i + 1}'s access code is invalid (max 64 characters).`;
      }
    }
  }
  return null;
}

const FIELD_TYPES = new Set(["signature", "initials", "date", "text", "checkbox"]);
const unitFraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

function normalizeField(f: FieldInput): { type: string; label: string | null; page: number; x: number; y: number; w: number; h: number } | null {
  if (typeof f.type !== "string" || !FIELD_TYPES.has(f.type)) return null;
  if (typeof f.page !== "number" || !Number.isInteger(f.page) || f.page < 0 || f.page > 5000) return null;
  if (!unitFraction(f.x) || !unitFraction(f.y) || !unitFraction(f.w) || !unitFraction(f.h)) return null;
  if (f.w === 0 || f.h === 0) return null;
  const label = typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 120) : null;
  return { type: f.type, label, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h };
}

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

  if (env.status !== "draft") {
    const already = await db.signer.count({ where: { envelopeId: id, status: "signed" } });
    if (env.status !== "sent" || already > 0) {
      return NextResponse.json(
        {
          error:
            env.status === "completed"
              ? "This envelope is complete and sealed. Its recipients and fields are part of the signed record and cannot be changed."
              : `This envelope is ${env.status} and can no longer be edited. Create a new one to send again.`,
        },
        { status: 409 },
      );
    }
  }

  if (overContentLength(req, MAX_ENVELOPE_JSON_BYTES)) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const title: string | null = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  const message: string | null = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 2000) : null;
  const sequential: boolean = !!body.sequential;
  const signersIn: SignerInput[] = Array.isArray(body.signers) ? body.signers : [];
  const fieldsIn: FieldInput[] = Array.isArray(body.fields) ? body.fields : [];

  if (signersIn.length > MAX_SIGNERS) {
    return NextResponse.json({ error: `Too many recipients (max ${MAX_SIGNERS}).` }, { status: 400 });
  }
  if (fieldsIn.length > MAX_FIELDS) {
    return NextResponse.json({ error: `Too many fields (max ${MAX_FIELDS}).` }, { status: 400 });
  }
  const invalid = validateSigners(signersIn);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const normalizedFields = fieldsIn.map(normalizeField);
  if (normalizedFields.some((f) => f === null)) {
    return NextResponse.json({ error: "A field has an invalid type, page or position." }, { status: 400 });
  }

  await db.field.deleteMany({ where: { envelopeId: id } });
  await db.signer.deleteMany({ where: { envelopeId: id } });

  const ROLES = ["signer", "in_person", "cc", "viewer"];
  const str = (v: unknown, max: number): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t ? t.slice(0, max) : null;
  };

  const signerRows = signersIn.map((s, i) => {
    const email = str(s.email, 320);
    const role = typeof s.role === "string" && ROLES.includes(s.role) ? s.role : email ? "signer" : "in_person";
    return {
      id: `sg_${randomBytes(12).toString("hex")}`,
      envelopeId: id,
      name: str(s.name, 200)!, 
      email: email?.toLowerCase() ?? null,
      title: str(s.title, 120),
      department: str(s.department, 120),
      kind: role === "in_person" ? "in_person" : "remote",
      role,
      order: i + 1,
      token: randomBytes(24).toString("hex"),
      accessCode: str(s.accessCode, 64),
    };
  });
  if (signerRows.length) await db.signer.createMany({ data: signerRows });
  const createdSigners = signerRows;

  const fieldRows = [];
  for (const [i, f] of fieldsIn.entries()) {
    const idx = typeof f.signerIndex === "number" ? f.signerIndex : -1;
    const signer = idx >= 0 && idx < createdSigners.length ? createdSigners[idx] : undefined;
    if (signer && !isSigningRole(signer.role)) continue;
    fieldRows.push({ envelopeId: id, signerId: signer?.id ?? null, ...normalizedFields[i]! });
  }
  if (fieldRows.length) await db.field.createMany({ data: fieldRows });

  await db.envelope.update({ where: { id }, data: { status: "sent", message, sequential, ...(title ? { title } : {}) } });
  await appendAudit(id, "system", "sent", { details: `${createdSigners.length} recipients${sequential ? " · sequential" : ""}` });

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const envForInvite = {
    id, title: title ?? env.title, message,
    org: {
      id: env.org.id, name: env.org.name, brandColor: env.org.brandColor, fromEmail: env.org.fromEmail,
      verifiedDomain: issuerFrom(env.org),
      logoUrl: issuerLogoUrl(env.org),
    },
  };
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
      status = "copy"; 
    } else if (!inviteNow.has(s.id)) {
      status = "queued"; 
    } else {
      const r = await inviteSigner(envForInvite, s);
      emailed = r.emailed;
      status = emailed ? "emailed" : (s.email ? "manual" : "in_person");
    }
    out.push({
      name: s.name, email: s.email, kind: s.kind, role: s.role, order: s.order,
      accessCode: s.accessCode, emailed, status,
      link: signingRole && !emailed && status !== "queued" ? link : null,
    });
  }

  return NextResponse.json({ ok: true, mailConfigured: isMailConfigured(), signers: out });
}
