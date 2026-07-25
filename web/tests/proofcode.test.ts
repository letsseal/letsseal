import test from "node:test";
import assert from "node:assert/strict";
import { makeProofCode, canonicalizeProofCode, formatProofCode, uniqueProofCode } from "../lib/proofcode.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

test("generated codes are 20 characters from the Crockford alphabet", () => {
  for (let i = 0; i < 500; i++) {
    const code = makeProofCode();
    assert.equal(code.length, 20);
    for (const c of code) assert.ok(ALPHABET.includes(c), `unexpected character ${JSON.stringify(c)}`);
  }
});

test("the alphabet excludes the characters humans confuse", () => {
  for (const c of "ILOU") assert.ok(!ALPHABET.includes(c), `${c} should not be in the alphabet`);
});

test("codes are drawn uniformly (no character starves or dominates)", () => {
  const counts = new Map<string, number>();
  const samples = 2000;
  for (let i = 0; i < samples; i++) {
    for (const c of makeProofCode()) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = samples * 20;
  const expected = total / 32;
  for (const c of ALPHABET) {
    const n = counts.get(c) ?? 0;
    assert.ok(n > expected * 0.7 && n < expected * 1.3, `${c} appeared ${n} times, expected around ${expected}`);
  }
});

test("canonicalize folds the look-alikes a human would type", () => {
  const base = makeProofCode();
  assert.equal(canonicalizeProofCode(base), base);
  assert.equal(canonicalizeProofCode(base.toLowerCase()), base);
  assert.equal(canonicalizeProofCode(formatProofCode(base)), base);
  assert.equal(canonicalizeProofCode(`  ${formatProofCode(base)}  `), base);
  assert.equal(canonicalizeProofCode("I".repeat(20)), "1".repeat(20));
  assert.equal(canonicalizeProofCode("L".repeat(20)), "1".repeat(20));
  assert.equal(canonicalizeProofCode("O".repeat(20)), "0".repeat(20));
  assert.equal(canonicalizeProofCode("U".repeat(20)), "V".repeat(20));
});

test("canonicalize rejects anything that is not a code", () => {
  assert.equal(canonicalizeProofCode(""), null);
  assert.equal(canonicalizeProofCode("TOO-SHORT"), null);
  assert.equal(canonicalizeProofCode("A".repeat(21)), null);
  assert.equal(canonicalizeProofCode("$" + "A".repeat(19)), null);
});

test("display grouping round-trips", () => {
  const code = makeProofCode();
  const shown = formatProofCode(code);
  assert.equal(shown, `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}-${code.slice(16, 20)}`);
  assert.equal(canonicalizeProofCode(shown), code);
});

test("uniqueProofCode retries past a collision and gives up rather than looping", async () => {
  let asked = 0;
  const code = await uniqueProofCode(async () => {
    asked++;
    return asked < 3; 
  });
  assert.equal(asked, 3);
  assert.equal(canonicalizeProofCode(code), code);

  await assert.rejects(() => uniqueProofCode(async () => true), /could not allocate/);
});
