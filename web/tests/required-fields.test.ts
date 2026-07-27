import test from "node:test";
import assert from "node:assert/strict";
import { blockingFields } from "../lib/signers.ts";

const field = (id: string, required = true) => ({ id, required });

test("an unfilled required field blocks", () => {
  assert.equal(blockingFields([field("a")], {}).length, 1);
});

test("an unfilled optional field does not block", () => {
  assert.equal(blockingFields([field("a", false)], {}).length, 0);
});

test("a signer whose fields are all optional can finish immediately", () => {
  const fields = [field("a", false), field("b", false), field("c", false)];
  assert.deepEqual(blockingFields(fields, {}), []);
});

test("an optional field that was filled anyway still does not block", () => {
  assert.deepEqual(blockingFields([field("a", false)], { a: "X" }), []);
});

test("only the required ones are reported, and in the order given", () => {
  const fields = [field("a", false), field("b"), field("c", false), field("d")];
  assert.deepEqual(blockingFields(fields, {}).map((f) => f.id), ["b", "d"]);
});

test("filling a required field clears it from the list", () => {
  const fields = [field("a"), field("b")];
  assert.deepEqual(blockingFields(fields, { a: "signed" }).map((f) => f.id), ["b"]);
});

test("an empty string counts as unfilled, same as a missing value", () => {
  assert.equal(blockingFields([field("a")], { a: "" }).length, 1);
});

test("whitespace alone does not satisfy a required field", () => {
  assert.equal(blockingFields([field("a")], { a: "   " }).length, 1);
});

test("a field with no flag set is treated as required", () => {
  assert.equal(blockingFields([{ id: "a" }], {}).length, 1);
  assert.equal(blockingFields([{ id: "a", required: null }], {}).length, 1);
});
