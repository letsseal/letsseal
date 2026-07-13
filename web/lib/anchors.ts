import { db } from "./db";
import { upgradeAnchor, anchorHash } from "./signing";
import { saveFile } from "./storage";
import { appendAudit } from "./audit";

export async function reanchorOrphans(limit = 25): Promise<{ found: number; anchored: number }> {
  const orphans = await db.sealedDocument.findMany({
    where: { anchorState: "none" },
    take: limit,
    orderBy: { sealedAt: "asc" },
  });

  let anchored = 0;
  for (const rec of orphans) {
    try {
      const res = await anchorHash(rec.sha256);
      await db.sealedDocument.update({
        where: { id: rec.id },
        data: { otsProof: res.ots_b64, anchorState: res.status.state }, 
      });
      if (rec.envelopeId) {
        await saveFile(`envelopes/${rec.envelopeId}/sealed.pdf.ots`, Buffer.from(res.ots_b64, "base64")).catch(() => {});
        await appendAudit(rec.envelopeId, "system", "anchored", { details: `OpenTimestamps ${res.status.state} (re-anchored)` });
      }
      anchored++;
    } catch {
      // Service still down — leave as-is and retry next run.
    }
  }
  return { found: orphans.length, anchored };
}

// Upgrade all pending OpenTimestamps anchors: ask the calendars whether their
// aggregated Bitcoin transaction has confirmed, and persist any that have.
// Sweeps both sealed documents and standalone "anchor anything" timestamps.
// Safe to call repeatedly (cron or in-process interval).
export async function upgradePendingAnchors(limit = 50): Promise<{ checked: number; confirmed: number }> {
  let checked = 0;
  let confirmed = 0;

  // Sealed documents.
  const docs = await db.sealedDocument.findMany({
    where: { anchorState: "pending", otsProof: { not: null } },
    take: limit,
    orderBy: { sealedAt: "asc" },
  });
  for (const rec of docs) {
    checked++;
    try {
      const up = await upgradeAnchor(rec.otsProof!);
      if (up.status.state === "confirmed") {
        await db.sealedDocument.update({
          where: { id: rec.id },
          data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
        });
        // Hosted (API-sealed) docs have no envelope/audit trail — skip for those.
        if (rec.envelopeId) {
          await appendAudit(rec.envelopeId, "system", "anchor_confirmed", {
            details: `Bitcoin block ${up.status.bitcoin_block}`,
          });
        }
        confirmed++;
      }
    } catch {
      // still pending or service offline — leave as-is, try again next run
    }
  }

  // Standalone "anchor anything" timestamps.
  const anchors = await db.anchor.findMany({
    where: { anchorState: "pending", otsProof: { not: null } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  for (const rec of anchors) {
    checked++;
    try {
      const up = await upgradeAnchor(rec.otsProof!);
      if (up.status.state === "confirmed") {
        await db.anchor.update({
          where: { id: rec.id },
          data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
        });
        confirmed++;
      }
    } catch {
      // still pending or service offline — leave as-is, try again next run
    }
  }

  return { checked, confirmed };
}
