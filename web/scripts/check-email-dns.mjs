#!/usr/bin/env node
import { Resolver } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const problems = [];
const warnings = [];
const notes = [];

const fail = (m, fix) => problems.push({ m, fix });
const warn = (m, fix) => warnings.push({ m, fix });

async function txt(name) {
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}
async function mx(name) {
  try {
    return await resolver.resolveMx(name);
  } catch {
    return [];
  }
}
async function cname(name) {
  try {
    return await resolver.resolveCname(name);
  } catch {
    return [];
  }
}

const orgDomain = (d) => d.split(".").slice(-2).join(".");

function loadEnv() {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    for (const line of readFileSync(join(webRoot, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {  }
}

async function main() {
  loadEnv();
  const explicit = process.argv[2];
  const from = process.env.SMTP_FROM ?? "";
  const fromAddr = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = explicit || fromAddr.split("@")[1];
  if (!domain) {
    console.error("No domain. Set SMTP_FROM in web/.env, or pass one as an argument.");
    process.exit(2);
  }

  console.log(`\nDeliverability for mail sent as @${domain}`);
  console.log("=".repeat(64));

  const spfRecords = (await txt(domain)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
  console.log("\nSPF");
  if (!spfRecords.length) {
    fail(`no SPF record on ${domain}`,
         `publish TXT ${domain}  "v=spf1 include:amazonses.com ~all"`);
    console.log("  (none)");
  } else if (spfRecords.length > 1) {
    fail(`${spfRecords.length} SPF records on ${domain}; more than one is a permanent error`,
         "merge them into a single TXT record");
  } else {
    console.log(`  ${spfRecords[0]}`);
    if (!/amazonses\.com/.test(spfRecords[0])) {
      warn(`SPF on ${domain} does not include amazonses.com`,
           `if SES ever sends without the custom MAIL FROM below, this record is what is checked. Add include:amazonses.com`);
    }
  }

  console.log("\nCustom MAIL FROM (decides whether SPF can align at all)");
  let mailFrom = null;
  for (const sub of ["mail", "bounce", "bounces", "email", "ses", "mailer"]) {
    const host = `${sub}.${domain}`;
    const [records, mxs] = await Promise.all([txt(host), mx(host)]);
    const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
    const feedback = mxs.find((m) => /amazonses\.com$/.test(m.exchange));
    if (spf || feedback) {
      mailFrom = host;
      console.log(`  ${host}`);
      console.log(`    MX  ${mxs.map((m) => m.exchange).join(", ") || "(none)"}`);
      console.log(`    SPF ${spf ?? "(none)"}`);
      if (!feedback) {
        warn(`${host} has no SES feedback MX`,
             `SES needs MX ${host} -> feedback-smtp.<region>.amazonses.com or it will not use this MAIL FROM`);
      }
      if (spf && !/amazonses\.com/.test(spf)) {
        fail(`${host} SPF does not include amazonses.com`, `set TXT ${host} "v=spf1 include:amazonses.com ~all"`);
      }
      break;
    }
  }
  if (!mailFrom) {
    warn("no custom MAIL FROM subdomain found",
         "without one the Return-Path is amazonses.com, so SPF cannot align with your From domain and DMARC rests entirely on DKIM");
  } else {
    notes.push(`SPF is evaluated against ${mailFrom}, not ${domain}. Relaxed alignment accepts that (same organisational domain); strict alignment does NOT.`);
  }

  console.log("\nDKIM");
  const selectors = (process.env.DKIM_SELECTORS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let dkimFound = 0;
  const probe = selectors.length
    ? selectors
    : ["selector1", "selector2", "default", "mail", "google", "k1", "s1", "s2"];
  for (const sel of probe) {
    const host = `${sel}._domainkey.${domain}`;
    const [c, t] = await Promise.all([cname(host), txt(host)]);
    if (c.length || t.length) {
      dkimFound++;
      console.log(`  ${sel}  ->  ${c[0] ?? t[0].slice(0, 60)}`);
    }
  }
  if (!dkimFound) {
    if (selectors.length) {
      fail(`none of the given selectors resolve under _domainkey.${domain}`,
           "re-copy the CNAMEs from your provider and check they published");
    } else {
      console.log("  (cannot be determined from DNS alone)");
      notes.push(
        `DKIM could not be checked: providers use random selectors, and guessing common names says nothing. ` +
        `Get the selectors from your provider (SES: Verified identities > ${domain} > DKIM) and re-run with ` +
        `DKIM_SELECTORS=<t1>,<t2>,<t3>. Until then this says nothing either way.`,
      );
    }
  } else if (selectors.length && dkimFound < selectors.length) {
    fail(`only ${dkimFound} of ${selectors.length} DKIM selectors resolve`,
         "a partially published key set means some messages go unsigned; publish all of them");
  }

  console.log("\nDMARC");
  const dmarcAll = (await txt(`_dmarc.${domain}`)).filter((r) => r.toLowerCase().startsWith("v=dmarc1"));
  const dmarc = dmarcAll[0];
  if (dmarcAll.length > 1) {
    for (const r of dmarcAll) console.log(`  ${r}`);
    fail(`${dmarcAll.length} DMARC records on _dmarc.${domain}; receivers apply NO policy when there is more than one`,
         "delete all but one. Two valid-looking records are worth less than a single one");
  }
  if (!dmarc) {
    fail(`no DMARC record on ${domain}`,
         `publish TXT _dmarc.${domain}  "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"`);
  } else if (dmarcAll.length === 1) {
    console.log(`  ${dmarc}`);
    const tag = (k) => dmarc.match(new RegExp(`${k}\\s*=\\s*([^;\\s]+)`, "i"))?.[1];
    const p = tag("p"), pct = tag("pct"), rua = tag("rua"), aspf = tag("aspf"), adkim = tag("adkim");

    if (aspf === "s" && mailFrom && mailFrom !== domain) {
      fail(`aspf=s (strict) but the Return-Path is ${mailFrom}`,
           `strict SPF alignment requires an exact domain match, so ${mailFrom} will NOT align with ${domain}. Use relaxed (drop aspf, or aspf=r)`);
    }
    if (adkim === "s" && !dkimFound) {
      warn("adkim=s (strict) with no DKIM found", "strict DKIM alignment with no DKIM signature can only fail");
    }
    if (rua) {
      const target = rua.replace(/^mailto:/i, "").split("@")[1] ?? "";
      if (target && orgDomain(target) !== orgDomain(domain)) {
        warn(`DMARC reports go to ${rua}, outside ${orgDomain(domain)}`,
             `you cannot see your own authentication failures. Point rua at an address you actually read`);
      }
    } else {
      warn("DMARC has no rua address",
           `add rua=mailto:dmarc@${domain} so failures are visible instead of guessed at`);
    }
    if (pct && Number(pct) < 100) {
      notes.push(`pct=${pct} means only ${pct}% of failing mail is subject to p=${p}. Policy is barely enforced, so DMARC is unlikely to be the whole story.`);
    }
    if (p === "none") {
      notes.push("p=none asks receivers to do nothing on failure. Good for observing, worth tightening once SPF and DKIM both pass.");
    }
  }

  console.log("\nReceiving");
  const inbound = await mx(domain);
  console.log(`  MX ${inbound.map((m) => m.exchange).join(", ") || "(none)"}`);
  if (!inbound.length) {
    warn(`${domain} has no MX record`,
         "a From domain that cannot receive mail is itself a spam signal; add an MX even if it only forwards");
  }

  console.log("\n" + "=".repeat(64));
  for (const { m, fix } of problems) console.log(`  PROBLEM  ${m}\n           fix: ${fix}`);
  for (const { m, fix } of warnings) console.log(`  WARNING  ${m}\n           fix: ${fix}`);
  for (const n of notes) console.log(`  NOTE     ${n}`);
  if (!problems.length && !warnings.length) console.log("  Authentication looks correct for this domain.");
  console.log();
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
