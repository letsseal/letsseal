import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upgradeAnchor } from "@/lib/signing";
import { proofUrl, appUrl } from "@/lib/hosted";
import { withCors, preflight } from "@/lib/cors";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);
const json = (body: unknown, init?: ResponseInit) => withCors(NextResponse.json(body, init));

export function OPTIONS() { return preflight(); }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const sha256 = hash.toLowerCase();
  if (!isHash(sha256)) return json({ error: "sha256 (64 hex) required" }, { status: 400 });

  const doc = await db.sealedDocument.findUnique({
    where: { sha256 },
    include: { org: true, envelope: { include: { org: true } } },
  });
  const anchor = doc ? null : await db.anchor.findUnique({ where: { sha256 } });
  if (!doc && !anchor) return json({ error: "no proof on record for this digest" }, { status: 404 });

  const rec = doc ?? anchor!;
  let anchorState = rec.anchorState;
  let btcBlock = rec.btcBlock;
  if (anchorState === "pending" && rec.otsProof) {
    try {
      const up = await upgradeAnchor(rec.otsProof);
      if (up.status.state === "confirmed") {
        anchorState = "confirmed";
        btcBlock = up.status.bitcoin_block ?? null;
        const data = { anchorState, btcBlock, otsProof: up.ots_b64 };
        if (doc) await db.sealedDocument.update({ where: { id: doc.id }, data });
        else await db.anchor.update({ where: { id: anchor!.id }, data });
      }
    } catch {  }
  }

  const anchorInfo = {
    provider: rec.anchorProvider ?? "bitcoin",
    state: anchorState,
    btcBlock,
    otsUrl: rec.otsProof ? `${appUrl()}/api/anchor/${sha256}` : null,
  };

  if (doc) {
    return json({
      sha256,
      kind: "document",
      sealed: true,
      issuer: doc.org?.name ?? doc.envelope?.org.name ?? null,
      // The document title is deliberately private for contracts/hosted docs —
      // the HTML proof page hides it from non-issuers (page.tsx gateContent). This
      // keyless twin must match: only issued credentials expose their title.
      title: doc.source === "credential" ? (doc.title ?? doc.envelope?.title ?? null) : null,
      certCN: doc.certCN,
      sealedAt: doc.sealedAt.toISOString(),
      anchor: anchorInfo,
      proof: proofUrl(sha256),
    });
  }
  return json({
    sha256,
    kind: "timestamp",
    sealed: false,
    title: anchor!.label,
    anchor: anchorInfo,
    proof: proofUrl(sha256),
  });
}
