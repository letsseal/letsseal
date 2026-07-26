const { promises: fs } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");

const ROOT = path.join(
  process.env.NEXT_CACHE_DIR ||
    process.env.CACHE_DIRECTORY ||
    path.join(os.tmpdir(), "letsseal-next-cache"),
  "isr",
);

let ready = null;
function ensureDir(dir) {
  if (!ready) ready = fs.mkdir(dir, { recursive: true }).catch(() => {});
  return ready;
}

const fileFor = (key) => path.join(ROOT, `${createHash("sha256").update(String(key)).digest("hex")}.json`);

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options;
  }

  async get(key) {
    try {
      const raw = await fs.readFile(fileFor(key), "utf8");
      const entry = JSON.parse(raw);
      if (Array.isArray(entry.tags) && entry.tags.length) {
        for (const tag of entry.tags) {
          const at = await this.#tagInvalidatedAt(tag);
          if (at && entry.lastModified <= at) return null;
        }
      }
      return { value: entry.value, lastModified: entry.lastModified };
    } catch {
      return null; 
    }
  }

  async set(key, data, ctx) {
    const entry = {
      value: data,
      lastModified: Date.now(),
      tags: (ctx && ctx.tags) || [],
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ensureDir(ROOT);
        const target = fileFor(key);
        const tmp = `${target}.${process.pid}.${Math.floor(performance.now() * 1000)}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(entry), "utf8");
        await fs.rename(tmp, target);
        return;
      } catch {
        ready = null;
      }
    }
  }

  async revalidateTag(tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    for (const tag of list) {
      try {
        await fs.mkdir(path.join(ROOT, "tags"), { recursive: true });
        await fs.writeFile(this.#tagFile(tag), String(Date.now()), "utf8");
      } catch {
      }
    }
  }

  #tagFile(tag) {
    return path.join(ROOT, "tags", `${createHash("sha256").update(String(tag)).digest("hex")}`);
  }

  async #tagInvalidatedAt(tag) {
    try {
      return Number(await fs.readFile(this.#tagFile(tag), "utf8")) || 0;
    } catch {
      return 0;
    }
  }
};
