import { createHmac } from "crypto";
import { db } from "./db";

const AUDIT_KEY = process.env.AUDIT_HMAC_SECRET ?? process.env.AUTH_SECRET ?? "";

type HashableEvent = {
  actor: string; action: string; ip: string | null; userAgent: string | null; createdAt: Date;
};

function auditHashV2(prevHash: string, e: HashableEvent): string {
  const body = [prevHash, e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v2:" + createHmac("sha256", AUDIT_KEY).update(body).digest("hex");
}

export async function appendAudit(
  envelopeId: string,
  actor: string,
  action: string,
  meta: { ip?: string; userAgent?: string; details?: string } = {},
) {
  const prev = await db.auditEvent.findFirst({
    where: { envelopeId },
    orderBy: { createdAt: "desc" },
  });
  const prevHash = prev?.hash ?? "";
  const row = await db.auditEvent.create({
    data: {
      envelopeId,
      actor,
      action,
      ip: meta.ip,
      userAgent: meta.userAgent,
      prevHash: prevHash || null,
      hash: "pending",
    },
  });
  return db.auditEvent.update({
    where: { id: row.id },
    data: { hash: auditHashV2(prevHash, row) },
  });
}

export async function verifyAuditChain(envelopeId: string): Promise<boolean> {
  const events = await db.auditEvent.findMany({
    where: { envelopeId },
    orderBy: { createdAt: "asc" },
  });
  let prevHash = "";
  for (const e of events) {
    if ((e.prevHash ?? "") !== prevHash) return false;
    if (e.hash.startsWith("v2:") && auditHashV2(prevHash, e) !== e.hash) return false;
    prevHash = e.hash;
  }
  return true;
}
