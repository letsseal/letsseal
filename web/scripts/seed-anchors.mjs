import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.DATABASE_URL ||= env.DATABASE_URL;
const SVC = env.SIGNING_SERVICE_URL || "http://127.0.0.1:8081";
const TOKEN = env.LETSSEAL_SERVICE_TOKEN || "";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const limit = parseInt(getOpt("--limit", "0"), 10) || 0; 
const delayMs = parseInt(getOpt("--delay", "0"), 10);
const concurrency = Math.max(1, parseInt(getOpt("--concurrency", "12"), 10));

if (!file) {
  console.error("usage: node scripts/seed-anchors.mjs <digests-file> [--limit N] [--delay MS]");
  process.exit(1);
}

const all = readFileSync(file, "utf8")
  .split("\n")
  .map((s) => s.trim().toLowerCase())
  .filter((s) => /^[0-9a-f]{64}$/.test(s));
const digests = limit > 0 ? all.slice(0, limit) : all;

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = 0, skipped = 0, failed = 0, n = 0;
const started = Date.now();

console.log(`seeding ${digests.length} digest(s) (of ${all.length} in file), service ${SVC}, concurrency ${concurrency}, delay ${delayMs}ms`);

// Shared cursor across `concurrency` workers pulling from the same queue.
let idx = 0;
async function worker() {
  while (idx < digests.length) {
    const sha256 = digests[idx++];
    n++;
    try {
      if (await db.anchor.findUnique({ where: { sha256 } })) {
        skipped++;
      } else {
        const res = await fetch(`${SVC}/anchor/hash`, {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ sha256 }),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        const j = await res.json();
        await db.anchor.create({
          data: { sha256, label: null, otsProof: j.ots_b64 ?? null, anchorState: j?.status?.state ?? "pending" },
        });
        done++;
        if (delayMs) await sleep(delayMs);
      }
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      // A concurrent worker (or the anchor cron) may have created this digest
      // between our findUnique and create. Harmless race: the anchor exists, so
      // count it as skipped rather than a real failure.
      if (e?.code === "P2002" || /Unique constraint/i.test(msg)) {
        skipped++;
      } else {
        failed++;
        console.error(`fail ${sha256}: ${msg.slice(0, 140)}`);
      }
    }
    if (n % 200 === 0) {
      const rate = (n / ((Date.now() - started) / 1000)).toFixed(1);
      console.log(`  ${n}/${digests.length}  done=${done} skipped=${skipped} failed=${failed}  (${rate}/s)`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`FINISHED  anchored=${done} skipped=${skipped} failed=${failed}  in ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);
await db.$disconnect();
