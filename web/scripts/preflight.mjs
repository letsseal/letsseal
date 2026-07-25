#!/usr/bin/env node
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  for (const line of readFileSync(path.join(webRoot, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {
  console.error("✗ could not read web/.env — copy .env.example to .env and fill it in first.");
  process.exit(1);
}

const results = [];
const ok = (name, msg = "") => results.push({ name, state: "ok", msg });
const warn = (name, msg) => results.push({ name, state: "warn", msg });
const fail = (name, msg) => results.push({ name, state: "fail", msg });

const REQUIRED = ["DATABASE_URL", "APP_URL", "AUTH_SECRET", "LETSSEAL_SERVICE_TOKEN", "SIGNING_SERVICE_URL"];
for (const k of REQUIRED) {
  if (process.env[k] && process.env[k].trim()) ok(`env ${k}`);
  else fail(`env ${k}`, "missing/empty");
}
const s3keys = ["STORAGE_S3_BUCKET", "STORAGE_S3_ENDPOINT", "STORAGE_S3_REGION", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY"];
const s3set = s3keys.filter((k) => process.env[k] && process.env[k].trim());
if (s3set.length === 0) warn("storage", "no STORAGE_S3_* → LOCAL DISK (ok for self-host; expected on a hosted VPS to be B2)");
else if (s3set.length < s3keys.length) fail("storage", `partial S3 config — missing ${s3keys.filter((k) => !s3set.includes(k)).join(", ")}`);

try {
  const { prismaClient } = await import("./_db.mjs");
  const db = prismaClient();
  await db.$queryRaw`SELECT 1`;
  const orgs = await db.organization.count();
  ok("postgres", `connected · ${orgs} org(s) · migrations applied`);
  await db.$disconnect();
} catch (e) {
  fail("postgres", `${e.message?.split("\n")[0] ?? e} (is it running + migrated? \`prisma migrate deploy\`)`);
}

try {
  const base = process.env.SIGNING_SERVICE_URL;
  const res = await fetch(base, { signal: AbortSignal.timeout(5000) });
  ok("signing-service", `reachable at ${base} (HTTP ${res.status})`);
} catch (e) {
  fail("signing-service", `unreachable at ${process.env.SIGNING_SERVICE_URL} — is letsseal-signing running? (${e.message ?? e})`);
}

if (s3set.length === s3keys.length) {
  try {
    const { AwsClient } = await import("aws4fetch");
    const client = new AwsClient({
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY,
      service: "s3",
      region: process.env.STORAGE_S3_REGION,
    });
    const url = `${process.env.STORAGE_S3_ENDPOINT.replace(/\/+$/, "")}/${process.env.STORAGE_S3_BUCKET}/preflight/check.txt`;
    const put = await client.fetch(url, { method: "PUT", body: new Uint8Array([112, 111, 110, 103]) });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
    const get = await client.fetch(url);
    if (!get.ok) throw new Error(`GET ${get.status}`);
    const del = await client.fetch(url, { method: "DELETE" });
    if (!del.ok && del.status !== 204) throw new Error(`DELETE ${del.status}`);
    ok("backblaze-b2", `bucket "${process.env.STORAGE_S3_BUCKET}" · PUT/GET/DELETE all work`);
  } catch (e) {
    fail("backblaze-b2", `round-trip failed: ${e.message ?? e} (check keyID/appKey + bucket scope)`);
  }
}

if (process.env.SMTP_HOST && process.env.SMTP_HOST.trim()) {
  try {
    const nodemailer = (await import("nodemailer")).default;
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await t.verify();
    ok("smtp", `${process.env.SMTP_HOST} auth OK` + (process.env.SES_CONFIGURATION_SET ? ` · config-set "${process.env.SES_CONFIGURATION_SET}"` : ""));
  } catch (e) {
    fail("smtp", `${e.message?.split("\n")[0] ?? e} (host/port/credentials?)`);
  }
} else {
  warn("smtp", "SMTP_HOST unset → ALL email will silently no-op (invites, completion, credentials)");
}

const icon = { ok: "✓", warn: "!", fail: "✗" };
console.log("\n  Let's Seal — deploy pre-flight\n  " + "─".repeat(40));
for (const r of results) console.log(`  ${icon[r.state]} ${r.name.padEnd(22)} ${r.msg}`);
const fails = results.filter((r) => r.state === "fail").length;
const warns = results.filter((r) => r.state === "warn").length;
console.log("  " + "─".repeat(40));
console.log(`  ${fails ? "✗ " + fails + " FAILED" : "✓ all hard checks passed"}${warns ? ` · ${warns} warning(s)` : ""}\n`);
process.exit(fails ? 1 : 0);
