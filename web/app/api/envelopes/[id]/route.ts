import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = await db.envelope.findUnique({
    where: { id },
    include: { signers: true, fields: true, org: true, sealed: true },
  });
  if (!env) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(env);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const signersIn: { name: string; email?: string; kind: string; accessCode?: string }[] =
    body.signers ?? [];
  const fieldsIn: {
    type: string; page: number; x: number; y: number; w: number; h: number; signerIndex: number;
  }[] = body.fields ?? [];

  const env = await db.envelope.findUnique({ where: { id }, include: { org: true } });
  if (!env) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.field.deleteMany({ where: { envelopeId: id } });
  await db.signer.deleteMany({ where: { envelopeId: id } });

  const createdSigners = [];
  for (let i = 0; i < signersIn.length; i++) {
    const s = signersIn[i];
    const signer = await db.signer.create({
      data: {
        envelopeId: id,
        name: s.name,
        email: s.email || null,
        kind: s.kind || (s.email ? "remote" : "in_person"),
        order: i + 1,
        token: randomBytes(24).toString("hex"),
        accessCode: s.accessCode || null,
      },
    });
    createdSigners.push(signer);
  }

  for (const f of fieldsIn) {
    const signer = createdSigners[f.signerIndex];
    await db.field.create({
      data: {
        envelopeId: id,
        signerId: signer?.id ?? null,
        type: f.type,
        page: f.page,
        x: f.x, y: f.y, w: f.w, h: f.h,
      },
    });
  }

  await db.envelope.update({ where: { id }, data: { status: "sent" } });
  await appendAudit(id, "system", "sent", { details: `${createdSigners.length} signers` });

  const base = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.json({
    ok: true,
    signers: createdSigners.map((s) => ({
      name: s.name,
      email: s.email,
      kind: s.kind,
      accessCode: s.accessCode,
      link: `${base}/sign/${s.token}`,
    })),
  });
}
