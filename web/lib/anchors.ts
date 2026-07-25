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
    }
  }
  return { found: orphans.length, anchored };
}

export async function upgradePendingAnchors(limit = 50): Promise<{ checked: number; confirmed: number }> {
  let checked = 0;
  let confirmed = 0;

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
        if (rec.envelopeId) {
          await appendAudit(rec.envelopeId, "system", "anchor_confirmed", {
            details: `Bitcoin block ${up.status.bitcoin_block}`,
          });
        }
        confirmed++;
      }
    } catch {
    }
  }

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
    }
  }

  return { checked, confirmed };
}
