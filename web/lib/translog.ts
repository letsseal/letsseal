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

export async function appendRekorLeaf(sha256: string, canonicalBody: string, sealType = "blob"):
  Promise<{ idx: number; leafHash: string }> {
  const sha = sha256.trim().toLowerCase();
  const lh = leafHash(Buffer.from(canonicalBody)).toString("hex");
  const existing = await db.logEntry.findUnique({ where: { leafHash: lh }, select: { idx: true, leafHash: true } });
  if (existing) return existing;
  try {
    return await db.logEntry.create({
      data: { leafHash: lh, payload: canonicalBody, sha256: sha, sealType },
      select: { idx: true, leafHash: true },
    });
  } catch {
    const row = await db.logEntry.findUnique({ where: { leafHash: lh }, select: { idx: true, leafHash: true } });
    if (row) return row;
    throw new Error("rekor leaf append failed");
  }
}

export async function treeSnapshot(): Promise<{ leaves: Buffer[]; rows: { idx: number; leafHash: string }[]; root: Buffer }> {
  const { leaves, rows } = await orderedLeaves();
  return { leaves, rows, root: merkleRoot(leaves) };
}

type LeafCache = { rows: { idx: number; leafHash: string }[]; leaves: Buffer[]; maxIdx: number };
const g = globalThis as unknown as { __letssealLeafCache?: LeafCache; __letssealRootCache?: Map<number, Buffer> };
const leafCache: LeafCache = (g.__letssealLeafCache ??= { rows: [], leaves: [], maxIdx: -1 });
const rootCache: Map<number, Buffer> = (g.__letssealRootCache ??= new Map());

async function orderedLeaves(): Promise<{ leaves: Buffer[]; rows: { idx: number; leafHash: string }[] }> {
  const fresh = await db.logEntry.findMany({
    where: leafCache.maxIdx >= 0 ? { idx: { gt: leafCache.maxIdx } } : undefined,
    orderBy: { idx: "asc" },
    select: { idx: true, leafHash: true },
  });
  if (fresh.length) {
    leafCache.rows.push(...fresh);
    leafCache.leaves.push(...fresh.map((r) => Buffer.from(r.leafHash, "hex")));
    leafCache.maxIdx = fresh[fresh.length - 1].idx;
  }
  return { leaves: leafCache.leaves, rows: leafCache.rows };
}

const MAX_CACHED_ROOTS = 64;
function rootAt(leaves: Buffer[], size: number): Buffer {
  const hit = rootCache.get(size);
  if (hit) return hit;
  const root = merkleRoot(size === leaves.length ? leaves : leaves.slice(0, size));
  if (rootCache.size >= MAX_CACHED_ROOTS) {
    const oldest = rootCache.keys().next().value;
    if (oldest !== undefined) rootCache.delete(oldest);
  }
  rootCache.set(size, root);
  return root;
}

export type SignedTreeHead = {
  treeSize: number; rootHash: string; timestamp: number; signature: string;
  logCert: string; logChain: string; anchorState: string; btcBlock: number | null;
};

export async function getSignedTreeHead(): Promise<SignedTreeHead> {
  const { leaves } = await orderedLeaves();
  const treeSize = leaves.length;
  const rootHash = rootAt(leaves, treeSize).toString("hex");

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

export async function getInclusionProof(opts: { leafHash?: string; sha256?: string; treeSize?: number }):
  Promise<InclusionProof | null> {
  const { leaves, rows } = await orderedLeaves();
  let pos = -1;
  if (opts.leafHash) pos = rows.findIndex((r) => r.leafHash === opts.leafHash!.toLowerCase());
  else if (opts.sha256) {
    const row = await db.logEntry.findFirst({ where: { sha256: opts.sha256.toLowerCase() }, select: { leafHash: true } });
    if (row) pos = rows.findIndex((r) => r.leafHash === row.leafHash);
  }
  if (pos < 0) return null;
  const size = opts.treeSize ?? leaves.length;
  if (!Number.isInteger(size) || size < 1 || size > leaves.length) {
    throw new RangeError(`treeSize must be an integer in 1..${leaves.length}`);
  }
  if (pos >= size) throw new RangeError(`leaf is at index ${pos}, not present in a tree of size ${size}`);
  const sub = size === leaves.length ? leaves : leaves.slice(0, size);
  return {
    index: pos, treeSize: size, leafHash: rows[pos].leafHash,
    rootHash: rootAt(leaves, size).toString("hex"),
    proof: inclusionProof(sub, pos).map((b) => b.toString("hex")),
  };
}

export async function getConsistencyProof(first: number, second: number): Promise<string[]> {
  const { leaves } = await orderedLeaves();
  if (second > leaves.length) {
    throw new RangeError(`second (${second}) exceeds the current tree size (${leaves.length})`);
  }
  const sliced = leaves.slice(0, second);
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
