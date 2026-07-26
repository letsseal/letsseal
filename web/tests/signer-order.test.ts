import test from "node:test";
import assert from "node:assert/strict";

type Row = { id: string; contacted: boolean };

function reorderAllowed(before: Row[], afterIds: string[]): { ok: boolean; reason?: string } {
  const contacted = new Set(before.filter((r) => r.contacted).map((r) => r.id));
  const beforeContacted = before.filter((r) => contacted.has(r.id)).map((r) => r.id);
  const afterContacted = afterIds.filter((id) => contacted.has(id));
  if (beforeContacted.join() !== afterContacted.join()) {
    return { ok: false, reason: "already asked cannot be reordered among themselves" };
  }
  const lastContactedAt = afterIds.reduce((last, id, i) => (contacted.has(id) ? i : last), -1);
  if (afterIds.some((id, i) => i < lastContactedAt && !contacted.has(id))) {
    return { ok: false, reason: "not-yet-asked cannot jump ahead of asked" };
  }
  return { ok: true };
}

const rows = (spec: string): Row[] =>
  spec.split(" ").map((s) => ({ id: s.replace("*", ""), contacted: s.endsWith("*") }));

test("the not-yet-asked tail can be rearranged freely", () => {
  const before = rows("a* b c d");
  assert.ok(reorderAllowed(before, ["a", "d", "b", "c"]).ok);
  assert.ok(reorderAllowed(before, ["a", "c", "b", "d"]).ok);
});

test("someone already asked cannot be moved", () => {
  const before = rows("a* b* c");
  const result = reorderAllowed(before, ["b", "a", "c"]);
  assert.equal(result.ok, false, "swapping two invited recipients rewrites what happened");
});

test("someone not yet asked cannot jump ahead of someone who was", () => {
  const before = rows("a* b c");
  const result = reorderAllowed(before, ["b", "a", "c"]);
  assert.equal(result.ok, false, "b has not been asked, so it cannot claim to have gone first");
});

test("a signed recipient is as fixed as an invited one", () => {
  const before = rows("a* b* c d");
  assert.equal(reorderAllowed(before, ["c", "a", "b", "d"]).ok, false);
  assert.ok(reorderAllowed(before, ["a", "b", "d", "c"]).ok, "the untouched tail still moves");
});

test("with nobody contacted yet, any order is allowed", () => {
  const before = rows("a b c");
  for (const order of [["c", "b", "a"], ["b", "a", "c"], ["a", "b", "c"]]) {
    assert.ok(reorderAllowed(before, order).ok, `${order.join(",")} should be allowed`);
  }
});

test("an unchanged order is always allowed", () => {
  const before = rows("a* b* c");
  assert.ok(reorderAllowed(before, ["a", "b", "c"]).ok);
});
