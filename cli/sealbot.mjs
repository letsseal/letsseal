#!/usr/bin/env node

import { readFile, writeFile, appendFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const API = getFlag("api") || process.env.SEALBOT_API || "http://127.0.0.1:8081";
const APP = getFlag("app") || process.env.SEALBOT_APP || "http://localhost:3000";
const TOKEN = getFlag("token") || process.env.SEALBOT_TOKEN || "";

function getFlag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
// Headers for a signing-service (API) request, with the bearer when present.
function svc(extra = {}) {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}`, ...extra } : { ...extra };
}
function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
async function toBlob(path) {
  const buf = await readFile(path).catch(() => die(`cannot read ${path}`));
  return new Blob([buf]);
}

// Register a digest as a public, shareable proof page on the hosted app
// (keyless). Returns { sha256, proof, state, existing? }.
async function appAnchor(sha256, label) {
  const res = await fetch(`${APP}/api/anchor`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha256, label }),
  });
  if (!res.ok) throw new Error(`publish failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function anchor(file, forcePublish = false) {
  if (!file) die("usage: sealbot anchor <file> [--publish]");
  // Hash locally — only the 32-byte digest ever leaves this machine.
  const buf = await readFile(file).catch(() => die(`cannot read ${file}`));
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const otsPath = `${file}.ots`;
  const publish = forcePublish || process.argv.includes("--publish");

  if (publish) {
    // Public, shareable proof page via the hosted app (keyless); still fetch the
    // portable .ots so the proof works offline / against Bitcoin directly.
    const r = await appAnchor(sha256, basename(file)).catch((e) => die(e.message));
    const otsRes = await fetch(`${APP}/api/anchor/${sha256}`);
    if (otsRes.ok) await writeFile(otsPath, Buffer.from(await otsRes.arrayBuffer()));
    console.log(`anchored  ${file}  (published)`);
    console.log(`  sha256  ${sha256}  (file itself was NOT uploaded)`);
    console.log(`  status  ${r.state}${r.existing ? " (already on record)" : ""}`);
    console.log(`  page    ${APP}${r.proof}`);
    if (otsRes.ok) console.log(`  proof   ${otsPath}  (verify anytime with: ots verify ${basename(file)})`);
    return;
  }

  // Private by default: local .ots only, nothing registered anywhere public.
  const { ots_b64, status } = await anchorDigest(sha256).catch((e) => die(e.message));
  await writeFile(otsPath, Buffer.from(ots_b64, "base64"));
  console.log(`anchored  ${file}`);
  console.log(`  sha256  ${sha256}  (file itself was NOT uploaded)`);
  console.log(`  status  ${status.state}${status.state === "pending" ? " (confirming on Bitcoin, ~hours)" : ""}`);
  if (status.bitcoin_block) console.log(`  block   ${status.bitcoin_block}`);
  console.log(`  proof   ${otsPath}  (verify anytime with: ots verify ${basename(file)})`);
  console.log(`  tip     add --publish for a shareable public proof page`);
}

// Deprecated: folded into `anchor --publish`. Kept as a thin alias so existing
// scripts keep working; prints a one-line nudge to stderr.
async function notarize(file) {
  console.error("note: 'notarize' is now 'anchor --publish' — running that.");
  return anchor(file, true);
}

async function issue() {
  const id = getFlag("id"), cn = getFlag("cn"), profile = getFlag("profile") || "document";
  if (!id || !cn) die('usage: sealbot issue --id <id> --cn "<subject>" [--profile document|code|data]');
  const keyPath = `${id}.key`;
  // Generate the key + CSR locally — the private key NEVER leaves this machine;
  // the CA only ever sees (and signs) the CSR.
  try {
    await exec("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", keyPath]);
    const { stdout: csr } = await exec("openssl", ["req", "-new", "-key", keyPath, "-subj", `/CN=${cn}/O=${cn}/C=GB`]);
    const res = await fetch(`${API}/cert/sign`, {
      method: "POST", headers: svc({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, csr, profile }),
    });
    if (!res.ok) die(`issue failed: ${res.status} ${await res.text()}`);
    const r = await res.json();
    await writeFile(`${id}.crt`, r.certificate);
    await writeFile(`${id}.chain.pem`, r.chain);
    console.log(`issued   ${id}  (profile: ${r.profile})`);
    console.log(`  key    ${keyPath}   (kept locally — the CA never saw it)`);
    console.log(`  cert   ${id}.crt`);
    console.log(`  chain  ${id}.chain.pem`);
  } catch (e) {
    die(e.code === "ENOENT" ? "openssl not found (needed to generate the key locally)" : String(e.message ?? e));
  }
}

const exists = async (p) => !!(await stat(p).catch(() => null));

// Re-check the calendars for a pending .ots and persist any confirmation.
async function upgradeOts(otsPath) {
  const ots = await readFile(otsPath);
  const res = await fetch(`${API}/anchor/upgrade`, {
    method: "POST", headers: svc({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ots_b64: ots.toString("base64") }),
  });
  if (!res.ok) throw new Error(`upgrade failed: ${res.status}`);
  const { ots_b64, status } = await res.json();
  await writeFile(otsPath, Buffer.from(ots_b64, "base64"));
  return status;
}

async function verify(file) {
  if (!file) die("usage: sealbot verify <file>   (a sealed PDF, or an .ots proof)");

  // An .ots argument → refresh its Bitcoin confirmation status (was `upgrade`).
  if (file.endsWith(".ots")) {
    const status = await upgradeOts(file).catch((e) => die(e.message));
    console.log(`${status.state === "confirmed" ? "confirmed" : "pending  "} ${file}`);
    if (status.bitcoin_block) console.log(`  block   ${status.bitcoin_block}`);
    return;
  }

  // Otherwise a sealed PDF → check the seal + integrity against the CA.
  const form = new FormData();
  form.append("file", await toBlob(file), basename(file));
  const res = await fetch(`${API}/verify`, { method: "POST", headers: svc(), body: form });
  const r = await res.json();
  if (!r.sealed) {
    console.log(`unsealed  ${file}  (${r.reason ?? "no signature"})`);
  } else {
    console.log(`${r.intact && r.valid ? "verified " : "TAMPERED "} ${file}`);
    console.log(`  signer  ${(r.signer ?? "").split(",")[0]}`);
    console.log(`  intact  ${r.intact}   valid ${r.valid}   trusted ${r.trusted}`);
    console.log(`  sha256  ${r.sha256}`);
  }
  // Surface a sibling anchor's Bitcoin status too, if one exists (folds in the
  // old `upgrade` for the common "sealed PDF + its .ots" pair).
  if (await exists(`${file}.ots`)) {
    try {
      const st = await upgradeOts(`${file}.ots`);
      console.log(`  anchor  ${st.state}${st.bitcoin_block ? ` (block ${st.bitcoin_block})` : ""}`);
    } catch {  }
  }
  if (!r.sealed || !(r.intact && r.valid)) process.exit(2);
}

async function seal(file) {
  const org = getFlag("org");
  if (!file || !org) die("usage: sealbot seal <file.pdf> --org <slug>");
  const form = new FormData();
  form.append("org_slug", org);
  form.append("timestamp", "false");
  form.append("file", await toBlob(file), basename(file));
  const res = await fetch(`${API}/seal`, { method: "POST", headers: svc(), body: form });
  if (!res.ok) die(`seal failed: ${res.status} ${await res.text()}`);
  const out = file.replace(/\.pdf$/i, "") + ".sealed.pdf";
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log(`sealed   ${out}`);
  console.log(`  by     ${res.headers.get("x-letsseal-cert-cn")}`);
  console.log(`  sha256 ${res.headers.get("x-letsseal-sha256")}`);
}

// Deprecated: folded into `verify <file>.ots`. Thin alias for compatibility.
async function upgrade(file) {
  if (!file) die("usage: sealbot verify <file>.ots");
  console.error("note: 'upgrade' is now 'verify <file>.ots' — running that.");
  return verify(file);
}

// ---- watch: turn a directory into an always-on notary -----------------------
// Poll a folder; anchor (or publish/seal) every new or changed file, skipping
// anything already recorded. Non-destructive by default: `anchor` hashes locally
// (only the 32-byte digest leaves the machine) and writes a sibling `<file>.ots`
// — the original bytes are never touched, which is register-in-place. A small
// dotfile state store makes it idempotent across restarts; a JSONL manifest is
// the append-only audit log. This is the piece that makes sealbot a daemon you
// point at a server directory rather than a one-shot command.

const DERIVED = (name) => name.endsWith(".ots") || /\.sealed\.pdf$/i.test(name);

async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // skip dotfiles/dirs (incl. our state/manifest)
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.isFile() && !DERIVED(e.name)) out.push(full);
  }
  return out;
}

// Anchor a bare digest via the signing service — the file never leaves the box.
async function anchorDigest(sha256) {
  const res = await fetch(`${API}/anchor/hash`, {
    method: "POST", headers: svc({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sha256 }),
  });
  if (!res.ok) throw new Error(`anchor ${res.status} ${await res.text()}`);
  return res.json(); // { ots_b64, status }
}

async function processOne(full, mode, org) {
  const buf = await readFile(full);
  const sha256 = createHash("sha256").update(buf).digest("hex");

  if (mode === "seal") {
    if (extname(full).toLowerCase() !== ".pdf") return { sha256, skipped: "not a PDF" };
    const form = new FormData();
    form.append("org_slug", org);
    form.append("timestamp", "false");
    form.append("file", new Blob([buf]), basename(full));
    const res = await fetch(`${API}/seal`, { method: "POST", headers: svc(), body: form });
    if (!res.ok) throw new Error(`seal ${res.status} ${await res.text()}`);
    const out = full.replace(/\.pdf$/i, "") + ".sealed.pdf";
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    return { sha256: res.headers.get("x-letsseal-sha256") || sha256, proof: out, state: "sealed" };
  }

  if (mode === "publish") {
    const r = await appAnchor(sha256, basename(full));
    return { sha256, proof: `${APP}${r.proof}`, state: r.state };
  }

  // default: anchor — hash-only, writes a sibling .ots (original untouched).
  const { ots_b64, status } = await anchorDigest(sha256);
  const otsPath = `${full}.ots`;
  await writeFile(otsPath, Buffer.from(ots_b64, "base64"));
  return { sha256, proof: otsPath, state: status.state };
}

const sleep = (ms, aborted) => new Promise((res) => {
  const poll = setInterval(() => { if (aborted()) { clearInterval(poll); clearTimeout(end); res(); } }, 200);
  const end = setTimeout(() => { clearInterval(poll); res(); }, ms);
});

async function watch(dir) {
  if (!dir) die("usage: sealbot watch <dir> [--mode anchor|publish|seal] [--org <slug>] [--interval <sec>] [--once]");
  let mode = getFlag("mode") || "anchor";
  if (mode === "notarize") mode = "publish"; // back-compat alias
  if (!["anchor", "publish", "seal"].includes(mode)) die(`unknown --mode '${mode}' (anchor|publish|seal)`);
  const org = getFlag("org");
  if (mode === "seal" && !org) die("seal mode needs --org <slug>");
  const interval = Math.max(1, Number(getFlag("interval") || 15)) * 1000;
  const once = process.argv.includes("--once");
  const statePath = getFlag("state") || join(dir, ".sealbot-state.json");
  const manifestPath = getFlag("manifest") || join(dir, ".sealbot-manifest.jsonl");

  let state = {};
  try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* first run */ }

  let stopping = false;
  process.on("SIGINT", () => { if (!stopping) { stopping = true; console.log("\nstopping after this scan…"); } });

  console.log(`watching ${dir}`);
  console.log(`  mode ${mode}${org ? `  org ${org}` : ""}   every ${interval / 1000}s   ${once ? "(single pass)" : "(Ctrl-C to stop)"}`);

  let totalNew = 0;
  do {
    const files = await walk(dir);
    let fresh = 0, unchanged = 0, failed = 0;
    for (const full of files) {
      if (stopping) break;
      const rel = relative(dir, full);
      let st; try { st = await stat(full); } catch { continue; }
      const prev = state[rel];
      if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) { unchanged++; continue; }
      try {
        const r = await processOne(full, mode, org);
        if (r.skipped) { unchanged++; continue; }
        const entry = { ts: new Date().toISOString(), file: rel, sha256: r.sha256, mode, state: r.state, proof: r.proof };
        state[rel] = { size: st.size, mtimeMs: st.mtimeMs, ...entry };
        await appendFile(manifestPath, JSON.stringify(entry) + "\n").catch(() => {});
        console.log(`  + ${rel}  → ${r.state}${r.proof ? `  ${r.proof}` : ""}`);
        fresh++;
      } catch (e) {
        console.error(`  ! ${rel}: ${e.message}`);
        failed++;
      }
    }
    await writeFile(statePath, JSON.stringify(state, null, 2)).catch(() => {});
    totalNew += fresh;
    if (fresh || failed) console.log(`scan: +${fresh} new, ${unchanged} unchanged${failed ? `, ${failed} failed` : ""} (${files.length} files)`);
    if (once || stopping) break;
    await sleep(interval, () => stopping);
  } while (!stopping);

  console.log(`done — ${totalNew} file(s) ${mode === "seal" ? "sealed" : "anchored"} this run.`);
}

const HELP = `sealbot — timestamp any file on Bitcoin and prove it existed, unaltered.

  sealbot anchor <file> [--publish]      hash locally -> writes <file>.ots
                                          (--publish also registers a public proof page)
  sealbot verify <file>                  check a sealed PDF, or refresh an .ots's status
  sealbot watch  <dir> [--mode anchor|publish|seal] [--interval <sec>] [--once]
                                          notarise a folder continuously, idempotently

Advanced — keyed signing (needs the signing service + a bearer token):
  sealbot seal   <file.pdf> --org <slug>     seal a PDF with your CA
  sealbot issue  --id <id> --cn "<subject>" [--profile document|code|data]

  --api <url>   | SEALBOT_API    signing service   (default ${API})
  --app <url>   | SEALBOT_APP    hosted app        (default ${APP})
  --token <tok> | SEALBOT_TOKEN  bearer for the keyed service

Hash-only by default: the file never leaves your machine, only its 32-byte digest.
Every .ots verifies against Bitcoin with stock \`ots verify <file>\` — no reliance
on Let's Seal. Composes OpenTimestamps + an X.509 CA; trust is self-anchored.`;

const VALUE_FLAGS = new Set(["api", "org", "reason", "app", "token", "id", "cn", "profile", "mode", "interval", "state", "manifest"]);
const positionals = [];
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { if (VALUE_FLAGS.has(a.slice(2))) i++; continue; }
    positionals.push(a);
  }
}
const [cmd, arg] = positionals;

const cmds = { anchor, notarize, verify, seal, upgrade, issue, watch };
if (!cmd || cmd === "help" || cmd === "--help") { console.log(HELP); process.exit(0); }
if (!cmds[cmd]) die(`unknown command '${cmd}'. Run 'sealbot help'.`);
await cmds[cmd](arg);
