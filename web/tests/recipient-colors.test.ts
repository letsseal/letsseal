import test from "node:test";
import assert from "node:assert/strict";
import { RECIPIENT_COLORS, recipientColor } from "../lib/signers.ts";

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const gap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

test("the first two recipients are blue and green", () => {
  assert.equal(recipientColor(0).name, "blue");
  assert.equal(recipientColor(1).name, "emerald");
});

test("consecutive recipients are far apart in hue", () => {
  for (let i = 1; i < RECIPIENT_COLORS.length; i++) {
    const a = RECIPIENT_COLORS[i - 1], b = RECIPIENT_COLORS[i];
    const d = gap(hue(a.solid), hue(b.solid));
    assert.ok(d >= 55, `${a.name} and ${b.name} are only ${d.toFixed(0)} degrees apart`);
  }
});

test("the first four are mutually distinct, not just consecutively", () => {
  const first4 = RECIPIENT_COLORS.slice(0, 4);
  for (let i = 0; i < first4.length; i++) {
    for (let j = i + 1; j < first4.length; j++) {
      const d = gap(hue(first4[i].solid), hue(first4[j].solid));
      assert.ok(d >= 55, `${first4[i].name} and ${first4[j].name} are only ${d.toFixed(0)} degrees apart`);
    }
  }
});

test("the palette wraps rather than running out", () => {
  const n = RECIPIENT_COLORS.length;
  assert.equal(recipientColor(n).name, RECIPIENT_COLORS[0].name);
  assert.equal(recipientColor(n + 1).name, RECIPIENT_COLORS[1].name);
  assert.ok(recipientColor(-1)?.name);
});

test("every colour carries a full set of variants", () => {
  for (const c of RECIPIENT_COLORS) {
    for (const key of ["solid", "border", "text"] as const) {
      assert.match(c[key], /^#[0-9a-f]{6}$/i, `${c.name}.${key} is not a hex colour`);
    }
    for (const key of ["fill", "fillActive"] as const) {
      assert.match(c[key], /^rgba\(/, `${c.name}.${key} should be translucent`);
    }
  }
});
