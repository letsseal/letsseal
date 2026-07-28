import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeZip, crc32 } from "../lib/zip.ts";

const MTIME = new Date("2026-07-28T10:20:30Z");

function hasUnzip(): boolean {
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); return true; } catch { return false; }
}

test("crc32 matches the standard check vector", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("crc32 of the empty input is zero", () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("an archive is accepted by the system unzip, and every file round trips", (t) => {
  if (!hasUnzip()) return t.skip("no unzip binary available");

  const binary = new Uint8Array(256);
  for (let i = 0; i < 256; i++) binary[i] = i;
  const entries = [
    { name: "README.md", data: "# Evidence\n\nPlain text entry.\n" },
    { name: "document.sealed.pdf", data: binary },
    { name: "transparency-log/inclusion-proof.json", data: '{"index":3,"treeSize":9}\n' },
    { name: "empty.txt", data: new Uint8Array(0) },
    { name: "unicode.txt", data: "sealed ✓ anchored\n" },
  ];

  const zip = makeZip(entries, MTIME);
  const dir = mkdtempSync(join(tmpdir(), "letsseal-zip-"));
  try {
    const path = join(dir, "bundle.zip");
    writeFileSync(path, zip);

    const tested = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    assert.match(tested, /No errors detected/);

    execFileSync("unzip", ["-q", "-o", path, "-d", join(dir, "out")]);
    for (const entry of entries) {
      const got = readFileSync(join(dir, "out", entry.name));
      const want = typeof entry.data === "string"
        ? Buffer.from(new TextEncoder().encode(entry.data))
        : Buffer.from(entry.data);
      assert.deepEqual(got, want, `${entry.name} did not round trip`);
    }

    const listed = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
    assert.match(listed, /transparency-log\/inclusion-proof\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an archive with no entries is a well-formed empty archive", (t) => {
  const bytes = makeZip([], MTIME);
  assert.equal(bytes.length, 22, "an empty archive is exactly the EOCD record");
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x06054b50);

  if (!hasUnzip()) return t.skip("no unzip binary available");
  const dir = mkdtempSync(join(tmpdir(), "letsseal-zip-"));
  try {
    const path = join(dir, "empty.zip");
    writeFileSync(path, bytes);
    let output = "";
    try { output = execFileSync("unzip", ["-l", path], { encoding: "utf8", stdio: "pipe" }); }
    catch (e: any) { output = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    assert.match(output, /zipfile is empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same entries and mtime produce the same bytes", () => {
  const entries = [{ name: "a.txt", data: "one" }, { name: "b.txt", data: "two" }];
  assert.deepEqual(makeZip(entries, MTIME), makeZip(entries, MTIME));
});

test("a pre-1980 mtime is clamped rather than wrapped", (t) => {
  if (!hasUnzip()) return t.skip("no unzip binary available");
  const dir = mkdtempSync(join(tmpdir(), "letsseal-zip-"));
  try {
    const path = join(dir, "old.zip");
    writeFileSync(path, makeZip([{ name: "a.txt", data: "x" }], new Date("1970-01-01T00:00:00Z")));
    const out = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
    assert.match(out, /1980/);
    assert.match(execFileSync("unzip", ["-t", path], { encoding: "utf8" }), /No errors detected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
