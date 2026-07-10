import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upgradeAnchor } from "@/lib/signing";
import { authApiKey } from "@/lib/api-auth";
import { proofUrl } from "@/lib/hosted";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "anchor");
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const sha256 = String(body.sha256 ?? "").trim().toLowerCase();
  if (!isHash(sha256)) return NextResponse.json({ error: "sha256 (64 hex) required" }, { status: 400 });

  const anchor = await db.anchor.findUnique({ where: { sha256 } });
  const sealed = anchor ? null : await db.sealedDocument.findUnique({ where: { sha256 } });
  const rec = anchor ?? sealed;
  if (!rec?.otsProof) return NextResponse.json({ error: "no anchor on record for this digest" }, { status: 404 });
  if (rec.anchorState === "confirmed") {
    return NextResponse.json({ sha256, state: "confirmed", btcBlock: rec.btcBlock, proof: proofUrl(sha256) });
  }

  try {
    const up = await upgradeAnchor(rec.otsProof);
    const state = up.status.state;
    if (state === "confirmed") {
      const btcBlock = up.status.bitcoin_block ?? null;
      const data = { anchorState: "confirmed", btcBlock, otsProof: up.ots_b64 };
      if (anchor) await db.anchor.update({ where: { id: anchor.id }, data });
      else await db.sealedDocument.update({ where: { id: sealed!.id }, data });
      return NextResponse.json({ sha256, state, btcBlock, proof: proofUrl(sha256) });
    }
    return NextResponse.json({ sha256, state, proof: proofUrl(sha256) });
  } catch (e) {
    return NextResponse.json({ error: `upgrade failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
