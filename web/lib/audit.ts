import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";

const AUDIT_KEY = process.env.AUDIT_HMAC_SECRET ?? process.env.AUTH_SECRET ?? "";

type HashableEvent = {
  actor: string; action: string; ip: string | null; userAgent: string | null; createdAt: Date;
};

function requireKey(): string {
  if (!AUDIT_KEY) throw new Error("audit chain requires AUDIT_HMAC_SECRET (or AUTH_SECRET) to be set");
  return AUDIT_KEY;
}

function auditHashV4(prevHash: string, envelopeId: string, seq: number, e: HashableEvent): string {
  const body = [prevHash, envelopeId, String(seq), e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v4:" + createHmac("sha256", requireKey()).update(body).digest("hex");
}

function auditHashV3(prevHash: string, envelopeId: string, e: HashableEvent): string {
  const body = [prevHash, envelopeId, e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v3:" + createHmac("sha256", requireKey()).update(body).digest("hex");
}

function auditHashV2(prevHash: string, e: HashableEvent): string {
  const body = [prevHash, e.actor, e.action, e.ip ?? "", e.userAgent ?? "", e.createdAt.toISOString()].join("\x1f");
  return "v2:" + createHmac("sha256", requireKey()).update(body).digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";

const MAX_APPEND_ATTEMPTS = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function appendAudit(
  envelopeId: string,
  actor: string,
  action: string,
  meta: { ip?: string; userAgent?: string; details?: string } = {},
) {
  requireKey(); 

  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${envelopeId}, 0))`;

        const tip = await tx.auditEvent.findFirst({
          where: { envelopeId },
          orderBy: { seq: "desc" },
          select: { seq: true, hash: true },
        });
        const seq = (tip?.seq ?? 0) + 1;
        const prevHash = tip?.hash ?? "";

        const createdAt = new Date();
        const fields: HashableEvent = {
          actor,
          action,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          createdAt,
        };

        return tx.auditEvent.create({
          data: {
            envelopeId,
            seq,
            actor,
            action,
            ip: meta.ip,
            userAgent: meta.userAgent,
            prevHash: prevHash || null,
            hash: auditHashV4(prevHash, envelopeId, seq, fields),
            createdAt,
          },
        });
      }, {
        maxWait: 15_000,
        timeout: 20_000,
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      await sleep(Math.floor(Math.random() * 25 * (attempt + 1)));
    }
  }
  throw new Error(`audit append contended out after ${MAX_APPEND_ATTEMPTS} attempts (envelope ${envelopeId})`);
}

export async function verifyAuditChain(envelopeId: string): Promise<boolean> {
  const events = await db.auditEvent.findMany({
    where: { envelopeId },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
  });
  let prevHash = "";
  let expectedSeq = 1;
  for (const e of events) {
    if (e.seq !== expectedSeq) return false;
    expectedSeq++;

    if ((e.prevHash ?? "") !== prevHash) return false;
    if (e.hash.startsWith("v4:")) {
      if (!hashesMatch(auditHashV4(prevHash, envelopeId, e.seq, e), e.hash)) return false;
    } else if (e.hash.startsWith("v3:")) {
      if (!hashesMatch(auditHashV3(prevHash, envelopeId, e), e.hash)) return false;
    } else if (e.hash.startsWith("v2:")) {
      if (!hashesMatch(auditHashV2(prevHash, e), e.hash)) return false;
    } else {
      return false; 
    }
    prevHash = e.hash;
  }
  return true;
}
