#!/usr/bin/env node
import { readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";

const inp = (name, def = "") =>
  process.env[`INPUT_${name.toUpperCase().replace(/[ -]/g, "_")}`]?.trim() ?? def;

const MODE = inp("mode", "anchor").toLowerCase(); // anchor | seal | verify
const APP = (inp("app") || process.env.SEALBOT_APP || "").replace(/\/$/, "");
const TOKEN = inp("token");
const ORG = inp("org");
const OUTDIR = inp("output-dir");
const FAIL_ON_TAMPER = !/^(false|0|no)$/i.test(inp("fail-on-tamper", "true"));
const FILES = inp("files");

function fail(msg) { console.error(`::error::${msg}`); process.exit(1); }
if (!APP) fail("`app` (your Let's Seal base URL, e.g. https://app.letsseal.org) is required.");
if (!["anchor", "seal", "verify"].includes(MODE)) fail(`unknown mode '${MODE}' (anchor | seal | verify)`);
if (MODE === "seal" && (!TOKEN || !ORG)) fail("mode 'seal' needs `token` and `org`.");

// ---- minimal glob (no deps): supports *, **, and literal paths ----
// `**/` matches zero or more directory segments; `**` any; `*` within a segment.
function toRegex(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "@ANYDIR@")
    .replace(/\*\*/g, "@ANY@")
    .replace(/\*/g, "[^/]*")
    .replace(/@ANYDIR@/g, "(?:.*/)?")
    .replace(/@ANY@/g, ".*");
  return new RegExp("^" + re + "$");
}
async function walk(dir, acc = []) {
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc); else acc.push(p);
  }
  return acc;
}
async function expand(patterns) {
  const out = new Set();
  let all = null;
  for (const pat of patterns.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!/[*?]/.test(pat)) { out.add(pat); continue; }
    all ??= await walk(process.cwd());
    const rx = toRegex(pat);
    for (const f of all) if (rx.test(relative(process.cwd(), f))) out.add(f);
  }
  return [...out];
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function anchorFile(path) {
  const digest = sha256(await readFile(path));
  const url = TOKEN ? `${APP}/api/v1/anchor` : `${APP}/api/anchor`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ sha256: digest, label: basename(path) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const r = await res.json();
  return { file: relative(process.cwd(), path), sha256: digest, proof: r.proof, state: r.state, ok: true };
}

async function sealFile(path) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(path)]), basename(path));
  const res = await fetch(`${APP}/api/v1/seal`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const outName = basename(path).replace(/\.pdf$/i, "") + ".sealed.pdf";
  const outPath = OUTDIR ? join(OUTDIR, outName) : path.replace(/\.pdf$/i, "") + ".sealed.pdf";
  await writeFile(outPath, bytes);
  return {
    file: relative(process.cwd(), path), sealed: relative(process.cwd(), outPath),
    sha256: res.headers.get("x-letsseal-sha256"), proof: res.headers.get("x-letsseal-proof-url"),
    state: res.headers.get("x-letsseal-anchor-state"), ok: true,
  };
}

async function verifyFile(path) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(path)]), basename(path));
  const res = await fetch(`${APP}/api/v1/verify`, { method: "POST", body: form });
  const r = await res.json();
  const good = r.sealed && r.intact && r.valid;
  return { file: relative(process.cwd(), path), sealed: !!r.sealed, intact: !!r.intact, valid: !!r.valid, trusted: !!r.trusted, ok: good };
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
async function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
}
const tick = (b) => (b ? "✅" : "❌");

async function main() {
  const files = await expand(FILES);
  if (files.length === 0) fail(`no files matched \`files\`: ${JSON.stringify(FILES)}`);
  console.log(`sealbot · ${MODE} · ${files.length} file(s) · ${APP}`);

  const run = MODE === "seal" ? sealFile : MODE === "verify" ? verifyFile : anchorFile;
  const results = [];
  for (const f of files) {
    try { const r = await run(f); results.push(r); console.log(`  ✓ ${MODE} ${r.file}${r.proof ? " → " + r.proof : ""}`); }
    catch (e) { results.push({ file: relative(process.cwd(), f), ok: false, error: String(e.message ?? e) }); console.log(`::error::${MODE} failed for ${f}: ${e.message ?? e}`); }
  }

  await writeFile("sealbot-manifest.json", JSON.stringify({ mode: MODE, app: APP, results }, null, 2));
  await setOutput("manifest-path", "sealbot-manifest.json");
  await setOutput("count", String(results.length));

  const head = MODE === "verify" ? "| File | Sealed | Intact | Valid | Trusted |\n|---|---|---|---|---|"
    : "| File | State | Proof |\n|---|---|---|";
  const rows = results.map((r) => MODE === "verify"
    ? `| ${r.file} | ${tick(r.sealed)} | ${tick(r.intact)} | ${tick(r.valid)} | ${tick(r.trusted)} |`
    : `| ${r.file} | ${r.state ?? (r.ok ? "ok" : "error")} | ${r.proof ? `[proof](${r.proof})` : (r.error ?? "—")} |`);
  await summary(`### 🔏 sealbot — ${MODE}\n\n${head}\n${rows.join("\n")}`);

  const failed = results.filter((r) => !r.ok);
  if (MODE === "verify" && FAIL_ON_TAMPER && failed.length) fail(`${failed.length} file(s) failed verification.`);
  if (MODE !== "verify" && failed.length === results.length) fail("all files failed.");
  console.log(`Done: ${results.length - failed.length}/${results.length} ok.`);
}
main().catch((e) => fail(e.stack ?? String(e)));
