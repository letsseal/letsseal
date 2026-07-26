import test from "node:test";
import assert from "node:assert/strict";
import { reorderMap, reorder } from "../lib/signers.ts";

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function ownersAfterMove(count: number, from: number, to: number) {
  const before = people(count);
  const after = reorder(before, from, to);
  const remap = reorderMap(count, from, to);
  return before.map((person, oldIndex) => ({
    person,
    stillOwnedBy: after[remap.get(oldIndex)!],
  }));
}

test("every field keeps its owner, for every possible move", () => {
  for (let count = 1; count <= 7; count++) {
    for (let from = 0; from < count; from++) {
      for (let to = 0; to < count; to++) {
        for (const { person, stillOwnedBy } of ownersAfterMove(count, from, to)) {
          assert.equal(stillOwnedBy, person,
            `moving ${from} to ${to} of ${count} detached a field from ${person}`);
        }
      }
    }
  }
});

test("the list itself is reordered as asked", () => {
  assert.deepEqual(reorder(["a", "b", "c"], 0, 2), ["b", "c", "a"], "first to last");
  assert.deepEqual(reorder(["a", "b", "c"], 2, 0), ["c", "a", "b"], "last to first");
  assert.deepEqual(reorder(["a", "b", "c"], 1, 1), ["a", "b", "c"], "no-op");
});

test("a move is a permutation: nobody is lost or duplicated", () => {
  for (let count = 1; count <= 7; count++) {
    for (let from = 0; from < count; from++) {
      for (let to = 0; to < count; to++) {
        const after = reorder(people(count), from, to);
        assert.equal(new Set(after).size, count, "a recipient was duplicated or dropped");
        const targets = [...reorderMap(count, from, to).values()];
        assert.equal(new Set(targets).size, count, "two recipients mapped to one position");
      }
    }
  }
});

test("out-of-range moves change nothing rather than corrupting the list", () => {
  for (const [from, to] of [[-1, 1], [1, -1], [0, 99], [99, 0], [5, 5]]) {
    assert.deepEqual(reorder(["a", "b", "c"], from, to), ["a", "b", "c"],
      `move ${from} to ${to} must be inert`);
    const map = reorderMap(3, from, to);
    assert.deepEqual([...map.entries()], [[0, 0], [1, 1], [2, 2]],
      `map for ${from} to ${to} must be the identity`);
  }
});

test("moving one recipient leaves the others in their original relative order", () => {
  const before = people(6);
  const after = reorder(before, 4, 1);
  const others = after.filter((p) => p !== "p4");
  assert.deepEqual(others, ["p0", "p1", "p2", "p3", "p5"]);
});
