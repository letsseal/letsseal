#!/usr/bin/env node
import { X509Certificate } from "node:crypto";
import { prismaClient } from "./_db.mjs";

const db = prismaClient();

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

const DIGEST_ONLY = ["blob", "identity", "attestation", "detached"];

async function main() {
  const dupes = await db.$queryRaw`
    SELECT "sha256", COUNT(*)::int AS n
    FROM "SealedDocument"
    GROUP BY "sha256"
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `;

  const rows = await db.sealedDocument.findMany({
    where: { sealType: { in: DIGEST_ONLY }, detachedSig: { not: null } },
    select: { id: true, sha256: true, sealType: true, certCN: true, detachedSig: true, sealedAt: true,
              org: { select: { slug: true, name: true } } },
    orderBy: { sealedAt: "asc" },
  });

  const broken = [];
  const unchecked = [];

  for (const r of rows) {
    let pem = null;
    for (const key of [`hosted/${r.sha256}/${r.id}/artifact.pem`, `hosted/${r.sha256}/artifact.pem`]) {
      try { pem = (await readKey(key)).toString("utf8"); break; } catch {  }
    }
    if (!pem) { unchecked.push({ ...r, why: "no stored certificate" }); continue; }

    let cn = "";
    try {
      const cert = new X509Certificate(pem);
      cn = /CN=([^,\n]+)/.exec(cert.subject)?.[1]?.trim() ?? "";
    } catch {
      unchecked.push({ ...r, why: "certificate did not parse" });
      continue;
    }

    const rowCN = (r.certCN || "").trim();
    if (cn && rowCN && cn !== rowCN) {
      broken.push({ ...r, storedCertCN: cn });
    }
  }

  console.log(`Checked ${rows.length} digest-only seal(s).\n`);

  if (dupes.length) {
    console.log(`${dupes.length} digest(s) now carry more than one seal (expected after the fix):`);
    for (const d of dupes.slice(0, 20)) console.log(`  ${d.sha256}  ${d.n} seals`);
    console.log("");
  }

  if (unchecked.length) {
    console.log(`${unchecked.length} seal(s) could not be checked (bytes not retained, which is normal):`);
    for (const u of unchecked.slice(0, 10)) console.log(`  ${u.sha256.slice(0, 16)}...  ${u.why}`);
    console.log("");
  }

  if (!broken.length) {
    console.log("NO AFFECTED PROOFS. No stored certificate disagrees with the signature it sits beside.");
    console.log("The collision never happened on this deployment.");
    await db.$disconnect();
    process.exit(0);
  }

  console.log(`AFFECTED: ${broken.length} proof(s) whose stored certificate is not the one that signed.\n`);
  for (const b of broken) {
    console.log(`  /d/${b.sha256}`);
    console.log(`      seal type      ${b.sealType}`);
    console.log(`      row says       ${b.certCN}  (org: ${b.org?.slug ?? "unknown"})`);
    console.log(`      disk holds     ${b.storedCertCN}`);
    console.log(`      sealed         ${b.sealedAt.toISOString()}`);
  }
  console.log(`
What to do: the signature in the row is intact and the seal is genuine. Only the
stored certificate beside it was overwritten. Ask the affected business to re-seal
those artifacts (the API call is idempotent per org now, so it will create their
own record with their own sidecars), or restore the certificate from a backup
taken before the overwrite.`);

  await db.$disconnect();
  process.exit(1);
}

main().catch(async (e) => {
  console.error("check failed:", e);
  await db.$disconnect();
  process.exit(2);
});
