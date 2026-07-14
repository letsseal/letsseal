import { db } from "@/lib/db";
import { signSth, getLogCert, anchorHash, upgradeAnchor } from "@/lib/signing";
import { leafHash, merkleRoot, inclusionProof, consistencyProof } from "@/lib/merkle";

let _logCert: { cert: string; chain: string } | null = null;
async function logCert(): Promise<{ cert: string; chain: string }> {
  if (_logCert) return _logCert;
  const c = await getLogCert();
  _logCert = { cert: c.cert_pem, chain: c.chain_pem };
  return _logCert;
}

export function leafPayload(e: { sha256: string; sealType: string; certCN: string; ts: number }): string {
  return JSON.stringify({ v: 1, sha256: e.sha256, sealType: e.sealType, certCN: e.certCN, ts: e.ts });
}

export async function appendToLog(e: { sha256: string; sealType: string; certCN: string }):
  Promise<{ idx: number; leafHash: string }> {
  const sha = e.sha256.trim().toLowerCase();
  const existing = await db.logEntry.findFirst({ where: { sha256: sha }, select: { idx: true, leafHash: true } });
  if (existing) return existing;

  const payload = leafPayload({ sha256: sha, sealType: e.sealType, certCN: e.certCN, ts: Date.now() });
  const lh = leafHash(Buffer.from(payload)).toString("hex");
  try {
    const row = await db.logEntry.create({
      data: { leafHash: lh, payload, sha256: sha, sealType: e.sealType },
      select: { idx: true, leafHash: true },
    });
    return row;
  } catch {
    const row = await db.logEntry.findUnique({ where: { leafHash: lh }, select: { idx: true, leafHash: true } });
    if (row) return row;
    throw new Error("log append failed");
  }
}

async function orderedLeaves(): Promise<{ leaves: Buffer[]; rows: { idx: number; leafHash: string }[] }> {
  const rows = await db.logEntry.findMany({ orderBy: { idx: "asc" }, select: { idx: true, leafHash: true } });
  return { leaves: rows.map((r) => Buffer.from(r.leafHash, "hex")), rows };
}

export type SignedTreeHead = {
  treeSize: number; rootHash: string; timestamp: number; signature: string;
  logCert: string; logChain: string; anchorState: string; btcBlock: number | null;
};

export async function getSignedTreeHead(): Promise<SignedTreeHead> {
  const { leaves } = await orderedLeaves();
  const treeSize = leaves.length;
  const rootHash = merkleRoot(leaves).toString("hex");

  const cached = await db.treeHead.findFirst({
    where: { treeSize, rootHash }, orderBy: { createdAt: "desc" },
  });
  if (cached) {
    const c = await logCert();
    return {
      treeSize, rootHash, timestamp: cached.createdAt.getTime(), signature: cached.signature,
      logCert: c.cert, logChain: c.chain, anchorState: cached.anchorState, btcBlock: cached.btcBlock,
    };
  }

  const ts = Date.now();
  const s = await signSth(treeSize, rootHash, ts);
  await db.treeHead.create({
    data: { treeSize, rootHash, signature: s.signature, anchorState: "none", createdAt: new Date(s.ts) },
  });
  _logCert = { cert: s.cert_pem, chain: s.chain_pem }; 
  return {
    treeSize, rootHash, timestamp: s.ts, signature: s.signature,
    logCert: s.cert_pem, logChain: s.chain_pem, anchorState: "none", btcBlock: null,
  };
}

export type InclusionProof = {
  index: number; treeSize: number; leafHash: string; rootHash: string; proof: string[];
};

export async function getInclusionProof(opts: { leafHash?: string; sha256?: string }):
  Promise<InclusionProof | null> {
  const { leaves, rows } = await orderedLeaves();
  let pos = -1;
  if (opts.leafHash) pos = rows.findIndex((r) => r.leafHash === opts.leafHash!.toLowerCase());
  else if (opts.sha256) {
    const row = await db.logEntry.findFirst({ where: { sha256: opts.sha256.toLowerCase() }, select: { leafHash: true } });
    if (row) pos = rows.findIndex((r) => r.leafHash === row.leafHash);
  }
  if (pos < 0) return null;
  return {
    index: pos, treeSize: leaves.length, leafHash: rows[pos].leafHash,
    rootHash: merkleRoot(leaves).toString("hex"),
    proof: inclusionProof(leaves, pos).map((b) => b.toString("hex")),
  };
}

export async function getConsistencyProof(first: number, second: number): Promise<string[]> {
  const { leaves } = await orderedLeaves();
  const sliced = leaves.slice(0, Math.min(second, leaves.length));
  return consistencyProof(sliced, first).map((b) => b.toString("hex"));
}

export async function anchorTreeHeads(): Promise<{ anchored: number; upgraded: number; treeSize: number }> {
  const sth = await getSignedTreeHead();

  let anchored = 0;
  const latest = await db.treeHead.findFirst({ orderBy: { treeSize: "desc" } });
  if (latest && latest.anchorState === "none" && latest.treeSize > 0) {
    try {
      const a = await anchorHash(latest.rootHash);
      await db.treeHead.update({
        where: { id: latest.id },
        data: { otsProof: a.ots_b64, anchorState: a.status.state },
      });
      anchored = 1;
    } catch {  }
  }

  let upgraded = 0;
  const pending = await db.treeHead.findMany({ where: { anchorState: "pending" } });
  for (const th of pending) {
    if (!th.otsProof) continue;
    try {
      const up = await upgradeAnchor(th.otsProof);
      if (up.status.state === "confirmed") {
        await db.treeHead.update({
          where: { id: th.id },
          data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
        });
        upgraded++;
      }
    } catch {  }
  }

  return { anchored, upgraded, treeSize: sth.treeSize };
}
