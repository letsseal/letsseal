import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const [arg1, arg2] = process.argv.slice(2);

async function main() {
  if (arg1 === "--list" || !arg1) {
    const ts = await db.tenant.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, enterprise: true, _count: { select: { organizations: true, memberships: true } } } });
    for (const t of ts) console.log(`${t.enterprise ? "✓" : " "} ${t.slug.padEnd(16)} ${t.name}  (orgs=${t._count.organizations}, people=${t._count.memberships})`);
    return;
  }
  const on = /^(on|true|1|yes)$/i.test(arg2 || "");
  const off = /^(off|false|0|no)$/i.test(arg2 || "");
  if (!on && !off) { console.error("usage: set-enterprise.mjs <tenant-slug> on|off   (or --list)"); process.exit(1); }

  const tenant = await db.tenant.findUnique({ where: { slug: arg1 }, select: { id: true, name: true } });
  if (!tenant) { console.error(`no tenant with slug '${arg1}'`); process.exit(1); }
  await db.tenant.update({ where: { id: tenant.id }, data: { enterprise: on } });
  console.log(`${tenant.name} (${arg1}) → enterprise ${on ? "ON" : "OFF"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
