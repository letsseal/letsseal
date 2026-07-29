import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SPEC = readFileSync(join(ROOT, "SPEC.md"), "utf8");
const TRANSLOG = readFileSync(join(ROOT, "web", "lib", "translog.ts"), "utf8");

const MEMBERS = ["v", "sha256", "sealType", "certCN", "ts"];

function membersOf(source: string): string[] {
  return [...source.matchAll(/["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:/g)].map((m) => m[1]);
}

test("the code emits the leaf members in the documented order", () => {
  const fn = TRANSLOG.match(/export function leafPayload[\s\S]*?\n}/);
  assert.ok(fn, "leafPayload has moved or been renamed; this test needs updating with it");
  const body = fn[0].slice(fn[0].indexOf("JSON.stringify"));
  const emitted = membersOf(body).filter((m) => MEMBERS.includes(m));
  assert.deepEqual(emitted, MEMBERS);
});

test("SPEC.md documents the same members in the same order", () => {
  const sample = SPEC.match(/\{"v":1,[^\n]*\}/);
  assert.ok(sample, "the leaf payload sample has gone from SPEC.md section 6");
  assert.deepEqual(membersOf(sample[0]), MEMBERS);
});

test("SPEC.md warns that sorting produces a different leaf", () => {
  const six = SPEC.slice(SPEC.indexOf("## 6."), SPEC.indexOf("## 7."));
  assert.match(six, /fixed member order/i);
  assert.match(six, /8785/, "the specification should name the canonicalisation it differs from");
});

test("the version member is documented, not just emitted", () => {
  assert.match(SPEC, /`v` is the payload version/);
  assert.match(TRANSLOG, /v:\s*1/);
});

test("the documented sample serialises to exactly what the code produces", () => {
  const entry = { sha256: "ab".repeat(32), sealType: "pades", certCN: "Acme Ltd", ts: 1785300000000 };
  const emitted = JSON.stringify({
    v: 1, sha256: entry.sha256, sealType: entry.sealType, certCN: entry.certCN, ts: entry.ts,
  });
  const documented =
    `{"v":1,"sha256":"${entry.sha256}","sealType":"${entry.sealType}",`
    + `"certCN":"${entry.certCN}","ts":${entry.ts}}`;
  assert.equal(emitted, documented);
  assert.notEqual(
    emitted,
    JSON.stringify(entry, Object.keys(entry).sort()),
    "a sorted serialisation must differ, or this test proves nothing",
  );
});
