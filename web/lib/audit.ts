import { createHmac } from "crypto";
import { db } from "./db";

const AUDIT_KEY = process.env.AUDIT_HMAC_SECRET ?? process.env.AUTH_SECRET ?? "";

type HashableEvent = {
  actor: string; action: string; ip: string | null; userAgent: string | null; createdAt: Date;
};

function requireKey(): string {
  if (!AUDIT_KEY) throw new Error("audit chain requires AUDIT_HMAC_SECRET (or AUTH_SECRET) to be set");
  return AUDIT_KEY;
}

function auditHashV3(prevHash: string, envelopeId: string, e: HashableEvent): string {
  const body = [prevHash, envelopeId, e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v3:" + createHmac("sha256", requireKey()).update(body).digest("hex");
}

function auditHashV2(prevHash: string, e: HashableEvent): string {
  const body = [prevHash, e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v2:" + createHmac("sha256", requireKey()).update(body).digest("hex");
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
    data: { hash: auditHashV3(prevHash, envelopeId, row) },
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
    if (e.hash.startsWith("v3:")) {
      if (auditHashV3(prevHash, envelopeId, e) !== e.hash) return false;
    } else if (e.hash.startsWith("v2:")) {
      if (auditHashV2(prevHash, e) !== e.hash) return false;
    } else {
      return false; 
    }
    prevHash = e.hash;
  }
  return true;
}
