import { createHash } from "crypto";

const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest();
export const leafHash = (entry: Buffer): Buffer => sha256(Buffer.concat([Buffer.from([0x00]), entry]));
const nodeHash = (l: Buffer, r: Buffer): Buffer => sha256(Buffer.concat([Buffer.from([0x01]), l, r]));

function splitPoint(n: number): number {
  let k = 1;
  while (k < n) k <<= 1;
  return k >> 1;
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  const n = leaves.length;
  if (n === 0) return sha256(Buffer.alloc(0));
  if (n === 1) return leaves[0];
  const k = splitPoint(n);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

export function inclusionProof(leaves: Buffer[], m: number): Buffer[] {
  const sub = (lo: number, hi: number): Buffer[] => {
    const n = hi - lo;
    if (n <= 1) return [];
    const k = splitPoint(n);
    if (m - lo < k) return [...sub(lo, lo + k), merkleRoot(leaves.slice(lo + k, hi))];
    return [...sub(lo + k, hi), merkleRoot(leaves.slice(lo, lo + k))];
  };
  return sub(0, leaves.length);
}

export function verifyInclusion(lh: Buffer, m: number, n: number, proof: Buffer[], root: Buffer): boolean {
  if (m >= n) return false;
  let fn = m;
  let sn = n - 1;
  let r = lh;
  for (const p of proof) {
    if (sn === 0) return false; 
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0) {
        do { fn >>= 1; sn >>= 1; } while ((fn & 1) === 0 && sn !== 0);
      }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && r.equals(root);
}

export function consistencyProof(leaves: Buffer[], m: number): Buffer[] {
  const n = leaves.length;
  if (m <= 0 || m > n) return [];
  if (m === n) return [];
  const sub = (m2: number, lo: number, hi: number, b: boolean): Buffer[] => {
    const nn = hi - lo;
    if (m2 === nn) return b ? [] : [merkleRoot(leaves.slice(lo, hi))];
    const k = splitPoint(nn);
    if (m2 <= k) return [...sub(m2, lo, lo + k, b), merkleRoot(leaves.slice(lo + k, hi))];
    return [...sub(m2 - k, lo + k, hi, false), merkleRoot(leaves.slice(lo, lo + k))];
  };
  return sub(m, 0, n, true);
}

export function verifyConsistency(first: number, second: number, proof: Buffer[],
                                  firstRoot: Buffer, secondRoot: Buffer): boolean {
  if (first > second) return false;
  if (first === second) return proof.length === 0 && firstRoot.equals(secondRoot);
  if (first === 0) return true; 

  let node = first - 1;
  let lastNode = second - 1;
  while (node % 2 === 1) { node = Math.floor(node / 2); lastNode = Math.floor(lastNode / 2); }

  const it = proof[Symbol.iterator]();
  const next = (): Buffer | null => { const r = it.next(); return r.done ? null : r.value; };

  let oldHash: Buffer;
  let newHash: Buffer;
  if (node > 0) {
    const seed = next();
    if (!seed) return false;
    oldHash = seed;
    newHash = seed;
  } else {
    oldHash = firstRoot;
    newHash = firstRoot;
  }

  while (node > 0) {
    if (node % 2 === 1) {
      const p = next();
      if (!p) return false;
      oldHash = nodeHash(p, oldHash);
      newHash = nodeHash(p, newHash);
    } else if (node < lastNode) {
      const p = next();
      if (!p) return false;
      newHash = nodeHash(newHash, p);
    }
    node = Math.floor(node / 2);
    lastNode = Math.floor(lastNode / 2);
  }

  while (lastNode > 0) {
    const p = next();
    if (!p) return false;
    newHash = nodeHash(newHash, p);
    lastNode = Math.floor(lastNode / 2);
  }

  return next() === null && oldHash.equals(firstRoot) && newHash.equals(secondRoot);
}
