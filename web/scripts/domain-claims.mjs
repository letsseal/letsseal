
import { prismaClient } from "./_db.mjs";
const db = prismaClient();
const [cmd, domain] = process.argv.slice(2);

async function main() {
  if (!cmd || cmd === "list") {
    const claims = await db.domainClaim.findMany({ orderBy: { verifiedAt: "desc" } });
    if (!claims.length) { console.log("(no domain claims)"); return; }
    for (const c of claims) {
      const t = c.tenantId ? await db.tenant.findUnique({ where: { id: c.tenantId }, select: { slug: true } }) : null;
      console.log(`${c.releasedAt ? "released" : "ACTIVE  "}  ${c.domain.padEnd(28)} account=${t?.slug ?? c.tenantId ?? "-"}  verified=${c.verifiedAt.toISOString().slice(0, 10)}`);
    }
    return;
  }
  if (cmd === "release") {
    if (!domain) { console.error("usage: domain-claims.mjs release <domain>"); process.exit(1); }
    const c = await db.domainClaim.findUnique({ where: { domain: domain.toLowerCase() } });
    if (!c || c.releasedAt) { console.error(`no active claim for ${domain}`); process.exit(1); }
    await db.domainClaim.update({ where: { id: c.id }, data: { releasedAt: new Date() } });
    console.log(`released claim on ${domain} — another account can now verify it`);
    return;
  }
  if (cmd === "backfill") {
    const tenants = await db.tenant.findMany({ where: { verifiedDomain: { not: null } }, select: { verifiedDomain: true, id: true, domainVerifiedAt: true } });
    let n = 0;
    for (const t of tenants) {
      await db.domainClaim.upsert({
        where: { domain: t.verifiedDomain },
        create: { domain: t.verifiedDomain, tenantId: t.id, verifiedAt: t.domainVerifiedAt ?? new Date() },
        update: {}, 
      });
      n++;
    }
    console.log(`backfill: ${n} verified account(s) -> claims ensured`);
    return;
  }
  console.error("unknown command; use list | release <domain> | backfill");
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
