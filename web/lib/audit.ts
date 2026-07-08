import { createHash } from "crypto";
import { db } from "./db";

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
  const stamp = new Date().toISOString();
  const hash = createHash("sha256")
    .update(prevHash + actor + action + stamp + (meta.details ?? ""))
    .digest("hex");
  return db.auditEvent.create({
    data: {
      envelopeId,
      actor,
      action,
      ip: meta.ip,
      userAgent: meta.userAgent,
      prevHash: prevHash || null,
      hash,
    },
  });
}

export async function verifyAuditChain(envelopeId: string): Promise<boolean> {
  const events = await db.auditEvent.findMany({
    where: { envelopeId },
    orderBy: { createdAt: "asc" },
  });
  let prevHash = "";
  for (const e of events) {
    const expected = createHash("sha256")
      .update(prevHash + e.actor + e.action + e.createdAt.toISOString() + "")
      .digest("hex");
    if ((e.prevHash ?? "") !== prevHash) return false;
    prevHash = e.hash;
  }
  return true;
}
