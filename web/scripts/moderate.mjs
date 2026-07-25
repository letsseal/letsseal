import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { prismaClient } from "./_db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(here, "..", ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
} catch {  }

const db = prismaClient();
const SVC = process.env.SIGNING_SERVICE_URL ?? "http://127.0.0.1:8081";
const TOKEN = process.env.LETSSEAL_SERVICE_TOKEN ?? "";

async function syncCert(slug, name, domain) {
  try {
    const r = await fetch(`${SVC}/org/reissue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ slug, legal_name: name, domain }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    console.log(`  cert ${domain ? "bound to " + domain : "domain unbound"}`);
  } catch (e) {
    console.error(`  ⚠ cert re-issue failed (reconcile later): ${e.message}`);
  }
}

async function orgBySlug(slug) {
  const o = await db.organization.findUnique({
    where: { slug },
    include: { tenant: { select: { verifiedDomain: true, domainVerifiedVia: true } } },
  });
  if (!o) { console.error(`No org with slug "${slug}".`); process.exit(1); }
  return o;
}

async function reports(which = "open") {
  const where = which === "all" ? {} : { status: "open" };
  const rows = await db.abuseReport.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
    include: { org: { select: { slug: true, name: true, status: true } } },
  });
  if (!rows.length) { console.log("No reports."); return; }
  for (const r of rows) {
    console.log(`[${r.status}] ${r.id}  ${r.createdAt.toISOString().slice(0, 16)}`);
    console.log(`  org: ${r.org.name} (${r.org.slug})  org-status: ${r.org.status}`);
    console.log(`  category: ${r.category}${r.reporterEmail ? `  from: ${r.reporterEmail}` : ""}`);
    if (r.proofHash) console.log(`  proof: /d/${r.proofHash}`);
    if (r.detail) console.log(`  detail: ${r.detail.replace(/\n/g, " ").slice(0, 300)}`);
    if (r.handledNote) console.log(`  note: ${r.handledNote}`);
    console.log("");
  }
  console.log(`${rows.length} report(s).`);
}

async function show(slug) {
  const o = await orgBySlug(slug);
  console.log(`${o.name} (${o.slug})`);
  console.log(`  status: ${o.status}${o.suspendedReason ? `  reason: ${o.suspendedReason}` : ""}`);
  console.log(`  verifiedDomain (brand): ${o.tenant?.verifiedDomain ?? "-"} (${o.tenant?.domainVerifiedVia ?? "n/a"})`);
  const n = await db.abuseReport.count({ where: { orgId: o.id } });
  const open = await db.abuseReport.count({ where: { orgId: o.id, status: "open" } });
  console.log(`  reports: ${n} total, ${open} open`);
}

async function suspend(slug, reason) {
  if (!reason) { console.error('A reason is required: suspend <slug> "reason"'); process.exit(1); }
  const o = await orgBySlug(slug);
  await db.organization.update({
    where: { id: o.id },
    data: { status: "suspended", suspendedAt: new Date(), suspendedReason: reason },
  });
  console.log(`Suspended ${o.name} (${o.slug}): ${reason}`);
  await syncCert(o.slug, o.name, null); 
  const upd = await db.abuseReport.updateMany({
    where: { orgId: o.id, status: "open" },
    data: { status: "actioned", handledAt: new Date(), handledNote: `suspended: ${reason}` },
  });
  if (upd.count) console.log(`  closed ${upd.count} open report(s) as actioned`);
}

async function reinstate(slug) {
  const o = await orgBySlug(slug);
  await db.organization.update({
    where: { id: o.id },
    data: { status: "active", suspendedAt: null, suspendedReason: null },
  });
  console.log(`Reinstated ${o.name} (${o.slug}).`);
  await syncCert(o.slug, o.name, o.tenant?.verifiedDomain ?? null);
}

async function handleReport(id, status, note) {
  const r = await db.abuseReport.updateMany({
    where: { id }, data: { status, handledAt: new Date(), handledNote: note ?? null },
  });
  if (!r.count) { console.error(`No report with id "${id}".`); process.exit(1); }
  console.log(`Report ${id} → ${status}${note ? ` (${note})` : ""}`);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "reports") await reports(a);
  else if (cmd === "show") await show(a);
  else if (cmd === "suspend") await suspend(a, b);
  else if (cmd === "reinstate") await reinstate(a);
  else if (cmd === "dismiss") await handleReport(a, "dismissed", b);
  else if (cmd === "action") await handleReport(a, "actioned", b);
  else {
    console.log("Usage: node scripts/moderate.mjs reports [open|all] | show <slug> | suspend <slug> \"reason\" | reinstate <slug> | dismiss <id> [note] | action <id> [note]");
    process.exit(1);
  }
} finally {
  await db.$disconnect();
}
