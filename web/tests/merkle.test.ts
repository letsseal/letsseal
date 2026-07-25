import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  leafHash,
  merkleRoot,
  inclusionProof,
  verifyInclusion,
  consistencyProof,
  verifyConsistency,
} from "../lib/merkle.ts";

const hex = (b: Buffer) => b.toString("hex");
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

function referenceRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return sha256(Buffer.alloc(0)); 
  const stack: { hash: Buffer; size: number }[] = [];
  for (const leaf of leaves) {
    let node = { hash: leaf, size: 1 };
    while (stack.length && stack[stack.length - 1].size === node.size) {
      const left = stack.pop()!;
      node = { hash: sha256(Buffer.concat([Buffer.from([0x01]), left.hash, node.hash])), size: left.size * 2 };
    }
    stack.push(node);
  }
  let acc = stack[stack.length - 1].hash;
  for (let i = stack.length - 2; i >= 0; i--) {
    acc = sha256(Buffer.concat([Buffer.from([0x01]), stack[i].hash, acc]));
  }
  return acc;
}

test("empty tree root is SHA-256 of the empty string (RFC 6962 MTH({}))", () => {
  assert.equal(hex(merkleRoot([])), createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
});

test("single-leaf tree root is the leaf hash itself (RFC 6962 MTH({d0}))", () => {
  const leaf = leafHash(Buffer.from("only"));
  assert.equal(hex(merkleRoot([leaf])), hex(leaf));
});

test("root agrees with an independent reference implementation for sizes 0..64", () => {
  const all = Array.from({ length: 64 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  for (let n = 0; n <= 64; n++) {
    const leaves = all.slice(0, n);
    assert.equal(hex(merkleRoot(leaves)), hex(referenceRoot(leaves)), `tree size ${n}`);
  }
});

test("every leaf of every tree size 1..64 has a verifiable inclusion proof", () => {
  const all = Array.from({ length: 64 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  for (let n = 1; n <= 64; n++) {
    const leaves = all.slice(0, n);
    const root = merkleRoot(leaves);
    for (let m = 0; m < n; m++) {
      const proof = inclusionProof(leaves, m);
      assert.ok(verifyInclusion(leaves[m], m, n, proof, root), `leaf ${m} of ${n} should verify`);
    }
  }
});

test("an inclusion proof does not verify against the wrong leaf, index or root", () => {
  const leaves = Array.from({ length: 11 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 4);

  assert.ok(verifyInclusion(leaves[4], 4, 11, proof, root));
  assert.ok(!verifyInclusion(leaves[5], 4, 11, proof, root));
  assert.ok(!verifyInclusion(leaves[4], 5, 11, proof, root));
  assert.ok(!verifyInclusion(leaves[4], 4, 11, proof, merkleRoot(leaves.slice(0, 10))));
  const tampered = proof.map((p, i) => (i === 0 ? leafHash(Buffer.from("forged")) : p));
  assert.ok(!verifyInclusion(leaves[4], 4, 11, tampered, root));
  assert.ok(!verifyInclusion(leaves[4], 11, 11, proof, root));
});

test("consistency holds between every pair of sizes m <= n for n up to 33", () => {
  const all = Array.from({ length: 33 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  for (let n = 1; n <= 33; n++) {
    const leaves = all.slice(0, n);
    const rootN = merkleRoot(leaves);
    for (let m = 1; m <= n; m++) {
      const rootM = merkleRoot(leaves.slice(0, m));
      const proof = consistencyProof(leaves, m);
      assert.ok(verifyConsistency(m, n, proof, rootM, rootN), `consistency ${m} -> ${n}`);
    }
  }
});

test("consistency proof rejects a rewritten history", () => {
  const base = Array.from({ length: 8 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  const honest = [...base, leafHash(Buffer.from("entry-8"))];
  const rewritten = [...base, leafHash(Buffer.from("entry-8"))];
  rewritten[3] = leafHash(Buffer.from("tampered"));

  const rootOld = merkleRoot(base);
  const proof = consistencyProof(honest, 8);

  assert.ok(verifyConsistency(8, 9, proof, rootOld, merkleRoot(honest)));
  assert.ok(!verifyConsistency(8, 9, proof, rootOld, merkleRoot(rewritten)));
});

test("consistency with the empty tree, and with itself", () => {
  const leaves = Array.from({ length: 5 }, (_, i) => leafHash(Buffer.from(`entry-${i}`)));
  const root = merkleRoot(leaves);
  assert.ok(verifyConsistency(0, 5, [], merkleRoot([]), root));
  assert.ok(verifyConsistency(5, 5, [], root, root));
  assert.ok(!verifyConsistency(5, 5, [leaves[0]], root, root));
  assert.ok(!verifyConsistency(6, 5, [], root, root));
});

test("leaf and node hashing use the RFC's domain separation prefixes", () => {
  const entry = Buffer.from("hello");
  const expected = createHash("sha256").update(Buffer.concat([Buffer.from([0x00]), entry])).digest("hex");
  assert.equal(hex(leafHash(entry)), expected);
  assert.notEqual(hex(merkleRoot([leafHash(Buffer.from("a")), leafHash(Buffer.from("b"))])), expected);
});
