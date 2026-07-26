import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { apiUser, userOwnsEnvelope } from "@/lib/auth-helpers";
import { advanceSequence } from "@/lib/envelope-routing";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await userOwnsEnvelope(userId, id, "admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const wanted: unknown = body?.signerIds;
  if (!Array.isArray(wanted) || wanted.some((s) => typeof s !== "string")) {
    return NextResponse.json({ error: "signerIds must be an array of signer ids" }, { status: 400 });
  }

  const envelope = await db.envelope.findUnique({
    where: { id },
    select: {
      status: true, sequential: true,
      signers: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, status: true, invitedAt: true, order: true },
      },
    },
  });
  if (!envelope) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (envelope.status === "completed" || envelope.status === "voided") {
    return NextResponse.json({ error: `a ${envelope.status} document cannot be reordered` }, { status: 409 });
  }

  const existing = envelope.signers.map((s) => s.id);
  const ids = wanted as string[];
  if (ids.length !== existing.length || new Set(ids).size !== ids.length ||
      !ids.every((sid) => existing.includes(sid))) {
    return NextResponse.json(
      { error: "the new order must list each of this document's recipients exactly once" },
      { status: 400 },
    );
  }

  const contacted = new Set(
    envelope.signers.filter((s) => s.invitedAt !== null || s.status === "signed" || s.status === "declined")
      .map((s) => s.id),
  );

  if (envelope.status === "sent" && envelope.sequential && contacted.size) {
    const before = envelope.signers.filter((s) => contacted.has(s.id)).map((s) => s.id);
    const after = ids.filter((sid) => contacted.has(sid));
    if (before.join() !== after.join()) {
      return NextResponse.json(
        { error: "recipients who have already been asked to sign cannot be reordered" },
        { status: 409 },
      );
    }
    const lastContactedAt = ids.reduce((last, sid, i) => (contacted.has(sid) ? i : last), -1);
    const jumper = ids.findIndex((sid, i) => i < lastContactedAt && !contacted.has(sid));
    if (jumper !== -1) {
      return NextResponse.json(
        { error: "a recipient who has not been asked yet cannot be placed ahead of one who has" },
        { status: 409 },
      );
    }
  }

  const previous = envelope.signers.map((s) => s.name).join(", ");
  await db.$transaction(
    ids.map((sid, i) => db.signer.update({ where: { id: sid }, data: { order: i + 1 } })),
  );

  const byId = new Map(envelope.signers.map((s) => [s.id, s.name]));
  const now = ids.map((sid) => byId.get(sid)).join(", ");
  if (previous !== now) {
    await appendAudit(id, userId, "signers_reordered", { details: `${previous} -> ${now}` });
  }

  if (envelope.status === "sent") await advanceSequence(id);

  return NextResponse.json({
    ok: true,
    order: ids.map((sid, i) => ({ signerId: sid, name: byId.get(sid), order: i + 1, locked: contacted.has(sid) })),
  });
}
