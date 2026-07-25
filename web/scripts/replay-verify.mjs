#!/usr/bin/env node
import { prismaClient } from "./_db.mjs";

const db = prismaClient();
const BASE = process.env.REPLAY_BASE ?? "http://127.0.0.1:3000";

async function readKey(key) {
  if (process.env.STORAGE_S3_BUCKET) {
    const { readFile } = await import("../lib/storage.ts");
    return readFile(key);
  }
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const { gunzipSync } = await import("node:zlib");
  const buf = await fs.readFile(path.join(process.cwd(), "storage", key));
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const recs = await db.sealedDocument.findMany({
    where: { pdfPath: { not: null } },
    orderBy: [{ sealedAt: "asc" }],
    select: {
      id: true, sha256: true, sealType: true, sealedAt: true, certCN: true,
      pdfPath: true, orgId: true, proofCode: true,
    },
  });

  console.log(`Replaying ${recs.length} retained artifact(s) through ${BASE}/api/verify\n`);

  const out = { authentic: [], notAuthentic: [], unreadable: [], error: [] };
  let n = 0;

  for (const r of recs) {
    n++;
    if (n % 40 === 0) { console.log("  … pausing for the rate-limit window"); await sleep(62_000); }

    const tag = `${r.sha256.slice(0, 12)} ${r.sealType.padEnd(11)} ${r.sealedAt.toISOString().slice(0, 10)}`;

    let bytes;
    try {
      bytes = await readKey(r.pdfPath);
    } catch (e) {
      out.unreadable.push({ ...r, why: e.message });
      console.log(`  BYTES GONE  ${tag}  (${e.message.slice(0, 50)})`);
      continue;
    }

    try {
      const fd = new FormData();
      fd.append("file", new Blob([bytes]), "artifact");
      const res = await fetch(`${BASE}/api/verify`, {
        method: "POST", body: fd, headers: { Host: "app.letsseal.org" },
      });
      if (!res.ok) {
        out.error.push({ ...r, status: res.status });
        console.log(`  HTTP ${res.status}    ${tag}`);
        continue;
      }
      const j = await res.json();
      const ok = j.authentic === true || (j.valid === true && j.trusted === true);
      const digestMatches = j.sha256 === r.sha256;
      if (ok && digestMatches) {
        out.authentic.push(r);
        console.log(`  ok          ${tag}  ${(j.signer ?? "").slice(0, 44)}`);
      } else {
        out.notAuthentic.push({ ...r, verdict: j });
        console.log(`  NOT OK      ${tag}  sealed=${j.sealed} valid=${j.valid} trusted=${j.trusted} digest=${digestMatches}`);
      }
    } catch (e) {
      out.error.push({ ...r, why: e.message });
      console.log(`  ERROR       ${tag}  ${e.message.slice(0, 60)}`);
    }
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  verified authentic : ${out.authentic.length}`);
  console.log(`  NOT authentic      : ${out.notAuthentic.length}`);
  console.log(`  bytes not retained : ${out.unreadable.length}`);
  console.log(`  transport errors   : ${out.error.length}`);

  if (out.notAuthentic.length) {
    console.log("\nRECORDS THAT NO LONGER VERIFY:");
    for (const r of out.notAuthentic) {
      console.log(`  ${r.sha256}  ${r.sealType}  ${r.sealedAt.toISOString()}  org=${r.orgId ?? "-"}`);
      console.log(`      ${JSON.stringify(r.verdict).slice(0, 300)}`);
    }
  }
  await db.$disconnect();
  process.exit(out.notAuthentic.length ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(2); });
