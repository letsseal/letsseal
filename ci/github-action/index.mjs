#!/usr/bin/env node
import { readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";

const inp = (name, def = "") =>
  process.env[`INPUT_${name.toUpperCase().replace(/[ -]/g, "_")}`]?.trim() ?? def;

const MODE = inp("mode", "anchor").toLowerCase(); // anchor | sign | seal | verify
const APP = (inp("app") || process.env.SEALBOT_APP || "").replace(/\/$/, "");
const TOKEN = inp("token");
const ORG = inp("org");
const OUTDIR = inp("output-dir");
const FAIL_ON_TAMPER = !/^(false|0|no)$/i.test(inp("fail-on-tamper", "true"));
const DO_ANCHOR = !/^(false|0|no)$/i.test(inp("anchor", "true"));   // sign: also anchor the digest
const DO_ATTEST = !/^(false|0|no)$/i.test(inp("attest", "true"));   // sign: also emit SLSA provenance
const FILES = inp("files");

function fail(msg) { console.error(`::error::${msg}`); process.exit(1); }
if (!APP) fail("`app` (your Let's Seal base URL, e.g. https://app.letsseal.org) is required.");
if (!["anchor", "sign", "seal", "verify"].includes(MODE)) fail(`unknown mode '${MODE}' (anchor | sign | seal | verify)`);
if (MODE === "seal" && (!TOKEN || !ORG)) fail("mode 'seal' needs `token` and `org`.");
if (MODE === "sign" && !TOKEN) fail("mode 'sign' needs `token` (an API key whose org has a code-signing cert).");

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

// SLSA v1.0 provenance predicate, filled from the CI build context. The whole
// point of provenance is that the builder describes the build — so we read the
// repo, commit, ref, workflow, and run straight from the GitHub Actions env
// (all optional, so a local/non-GHA run still produces a valid, if sparser,
// statement). The API maps predicateType "slsaprovenance" → slsa.dev/provenance/v1.
function slsaPredicate(path) {
  const e = process.env;
  const server = (e.GITHUB_SERVER_URL || "https://github.com").replace(/\/$/, "");
  const repo = e.GITHUB_REPOSITORY;                 // owner/name
  const repoUri = repo ? `git+${server}/${repo}` : undefined;
  const srcRef = repoUri && e.GITHUB_REF ? `${repoUri}@${e.GITHUB_REF}` : repoUri;
  return {
    buildDefinition: {
      buildType: "https://letsseal.org/provenance/github-actions/v1",
      externalParameters: {
        artifact: basename(path),
        ...(srcRef ? { source: srcRef } : {}),
        ...(e.GITHUB_WORKFLOW_REF ? { workflow: e.GITHUB_WORKFLOW_REF } : {}),
      },
      internalParameters: {
        ...(e.GITHUB_EVENT_NAME ? { eventName: e.GITHUB_EVENT_NAME } : {}),
        runnerEnvironment: e.GITHUB_ACTIONS ? "github-hosted" : "self-hosted",
      },
      resolvedDependencies: repoUri && e.GITHUB_SHA ? [{ uri: repoUri, digest: { gitCommit: e.GITHUB_SHA } }] : [],
    },
    runDetails: {
      builder: { id: e.GITHUB_WORKFLOW_REF ? `${server}/${e.GITHUB_WORKFLOW_REF}` : "https://letsseal.org/provenance/builder/github-actions" },
      metadata: {
        ...(e.GITHUB_RUN_ID ? { invocationId: `${server}/${repo}/actions/runs/${e.GITHUB_RUN_ID}/attempts/${e.GITHUB_RUN_ATTEMPT || "1"}` } : {}),
      },
    },
  };
}

// Sign a build artifact digest-only under the org's code-signing cert, plus (by
// default) a SLSA provenance attestation. The artifact never leaves the runner —
// only its SHA-256 is sent. The API returns tlog-native Sigstore bundles backed
// by Let's Seal's own transparency log, so consumers verify with stock cosign
// against our trusted root WITHOUT --insecure-ignore-tlog:
//   cosign verify-blob            --bundle <file>.cosign.bundle --trusted-root <(curl -s <APP>/trusted_root.json) ...
//   cosign verify-blob-attestation --bundle <file>.att.bundle    --trusted-root <(curl -s <APP>/trusted_root.json) ...
// Writes <file>.cosign.bundle (+ <file>.att.bundle). If a bundle is unavailable
// (a transient log hiccup), falls back to the legacy .sig/.pem/.chain.pem
// sidecars so signing never silently produces nothing.
async function signFile(path) {
  const digest = sha256(await readFile(path));
  const base = OUTDIR ? join(OUTDIR, basename(path)) : path;
  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
  const nl = (s) => (typeof s === "string" ? s : JSON.stringify(s));

  const bRes = await fetch(`${APP}/api/v1/seal/blob?anchor=${DO_ANCHOR ? 1 : 0}`, {
    method: "POST", headers: jsonHeaders,
    body: JSON.stringify({ sha256: digest, title: basename(path) }),
  });
  if (!bRes.ok) throw new Error(`seal/blob ${bRes.status} ${await bRes.text()}`);
  const b = await bRes.json();
  const out = { file: relative(process.cwd(), path), sha256: digest, identity: b.identity, certCN: b.certCN, proof: b.proofUrl, state: b.anchorState, ok: true };
  if (b.bundle) {
    await writeFile(`${base}.cosign.bundle`, nl(b.bundle).replace(/\n?$/, "\n"));
    out.bundle = relative(process.cwd(), `${base}.cosign.bundle`);
  } else {
    // Fallback: no tlog bundle this time — emit the cosign sidecars so the artifact
    // is still verifiable (with --certificate/--signature + --insecure-ignore-tlog).
    await writeFile(`${base}.sig`, nl(b.sig).replace(/\n?$/, "\n"));
    await writeFile(`${base}.pem`, nl(b.certPem).replace(/\n?$/, "\n"));
    await writeFile(`${base}.chain.pem`, nl(b.chainPem).replace(/\n?$/, "\n"));
    out.bundle = null;
  }

  if (DO_ATTEST) {
    const aRes = await fetch(`${APP}/api/v1/attest?anchor=${DO_ANCHOR ? 1 : 0}`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ sha256: digest, predicate: slsaPredicate(path), predicateType: "slsaprovenance", subjectName: basename(path), title: `${basename(path)} (SLSA provenance)` }),
    });
    if (!aRes.ok) throw new Error(`attest ${aRes.status} ${await aRes.text()}`);
    const a = await aRes.json();
    await writeFile(`${base}.att.bundle`, nl(a.bundle).replace(/\n?$/, "\n"));
    out.attestation = a.predicateType;
  }
  return out;
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

  const run = MODE === "seal" ? sealFile : MODE === "sign" ? signFile : MODE === "verify" ? verifyFile : anchorFile;
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
