import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function handlerIn(dir: string) {
  process.env.NEXT_CACHE_DIR = dir;
  delete require.cache[require.resolve("../cache-handler.js")];
  const CacheHandler = require("../cache-handler.js");
  return new CacheHandler({});
}

test("a value survives a set and get", async () => {
  const dir = mkdtempSync(join(tmpdir(), "isr-"));
  try {
    const h = handlerIn(dir);
    await h.set("/site", { kind: "PAGE", html: "<p>hello</p>" }, { tags: [] });
    const got = await h.get("/site");
    assert.ok(got, "a value that was just stored must be readable");
    assert.equal(got.value.html, "<p>hello</p>");
    assert.equal(typeof got.lastModified, "number");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a key that was never stored misses", async () => {
  const dir = mkdtempSync(join(tmpdir(), "isr-"));
  try {
    assert.equal(await handlerIn(dir).get("/never-written"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keys with slashes and queries do not collide or escape the directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "isr-"));
  try {
    const h = handlerIn(dir);
    await h.set("/a/b?x=1", { html: "first" }, { tags: [] });
    await h.set("../../escape", { html: "second" }, { tags: [] });
    assert.equal((await h.get("/a/b?x=1")).value.html, "first");
    assert.equal((await h.get("../../escape")).value.html, "second");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("revalidateTag invalidates entries carrying that tag, and only those", async () => {
  const dir = mkdtempSync(join(tmpdir(), "isr-"));
  try {
    const h = handlerIn(dir);
    await h.set("/tagged", { html: "stats" }, { tags: ["network-stats"] });
    await h.set("/untagged", { html: "static" }, { tags: ["something-else"] });
    assert.ok(await h.get("/tagged"), "stored and readable before invalidation");

    await new Promise((r) => setTimeout(r, 5));
    await h.revalidateTag("network-stats");

    assert.equal(await h.get("/tagged"), null, "a tagged entry must go stale");
    assert.ok(await h.get("/untagged"), "an entry with other tags must survive");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unwritable cache directory degrades to misses rather than throwing", async () => {
  const base = mkdtempSync(join(tmpdir(), "isr-"));
  const asFile = join(base, "not-a-directory");
  writeFileSync(asFile, "");
  try {
    const h = handlerIn(join(asFile, "cache"));
    await assert.doesNotReject(() => h.set("/x", { html: "y" }, { tags: [] }));
    assert.equal(await h.get("/x"), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("importing the handler never touches the filesystem", async () => {
  const base = mkdtempSync(join(tmpdir(), "isr-"));
  const unused = join(base, "never-created");
  try {
    handlerIn(unused);
    assert.equal(existsSync(unused), false,
      "the cache directory must not be created until something is actually written");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a cache directory removed after startup is recreated on the next write", async () => {
  const dir = mkdtempSync(join(tmpdir(), "isr-"));
  try {
    const h = handlerIn(dir);
    await h.set("/first", { html: "one" }, { tags: [] });
    assert.ok(await h.get("/first"), "stored before the directory is removed");

    rmSync(join(dir, "isr"), { recursive: true, force: true });
    assert.equal(await h.get("/first"), null, "the entry is gone with the directory");

    await h.set("/second", { html: "two" }, { tags: [] });
    const back = await h.get("/second");
    assert.ok(back, "the next write must recreate the directory rather than give up");
    assert.equal(back.value.html, "two");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
