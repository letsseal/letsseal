import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.env.APPLY === "1";
const ORPHAN_OWNER_EMAIL = (process.env.ORPHAN_OWNER_EMAIL || "").trim().toLowerCase();

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "account";
}

async function uniqueTenantSlug(base, taken) {
  let slug = base, n = 1;
  while (taken.has(slug) || (await db.tenant.findUnique({ where: { slug }, select: { id: true } }))) {
    slug = `${base}-${++n}`;
  }
  taken.add(slug);
  return slug;
}

async function main() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, name: true, tenantId: true,
      memberships: { select: { role: true, userId: true, user: { select: { email: true } } } },
    },
  });

  const orphanOwner = ORPHAN_OWNER_EMAIL
    ? await db.user.findUnique({ where: { email: ORPHAN_OWNER_EMAIL }, select: { id: true, email: true } })
    : null;
  if (ORPHAN_OWNER_EMAIL && !orphanOwner) throw new Error(`ORPHAN_OWNER_EMAIL not found: ${ORPHAN_OWNER_EMAIL}`);

  const takenSlugs = new Set();
  const plan = [];
  for (const o of orgs) {
    if (o.tenantId) { plan.push({ org: o.slug, action: "skip (already has tenant)", tenant: o.tenantId }); continue; }
    const ownerM = o.memberships.find((m) => m.role === "owner") || o.memberships[0] || null;
    let owner = ownerM ? { id: ownerM.userId, email: ownerM.user?.email } : null;
    let ownerNote = owner ? owner.email : "(no member)";
    if (!owner) {
      if (!orphanOwner) { plan.push({ org: o.slug, action: "ERROR: orphan org, set ORPHAN_OWNER_EMAIL", tenant: "-" }); continue; }
      owner = { id: orphanOwner.id, email: orphanOwner.email };
      ownerNote = `${orphanOwner.email} (assigned — orphan)`;
    }
    const slug = await uniqueTenantSlug(slugify(o.slug), takenSlugs);
    plan.push({ org: o.slug, action: "create tenant + owner + link", tenant: `${o.name} [${slug}]`, owner: ownerNote, _o: o, _owner: owner, _slug: slug });
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${orgs.length} org(s)\n`);
  for (const p of plan) {
    console.log(`  ${p.org.padEnd(14)} → ${p.action}`);
    if (p.tenant && p.action.startsWith("create")) console.log(`  ${" ".padEnd(14)}   tenant: ${p.tenant}   owner: ${p.owner}`);
  }
  const errors = plan.filter((p) => p.action.startsWith("ERROR"));
  if (errors.length) { console.log(`\n${errors.length} error(s) — fix before applying.`); process.exit(1); }

  if (!APPLY) {
    console.log(`\nDRY RUN complete — nothing written. Re-run with APPLY=1 to write.`);
    return;
  }

  let created = 0;
  for (const p of plan.filter((x) => x._o)) {
    await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { slug: p._slug, name: p._o.name } });
      await tx.tenantMembership.create({ data: { tenantId: tenant.id, userId: p._owner.id, role: "owner" } });
      await tx.organization.update({ where: { id: p._o.id }, data: { tenantId: tenant.id } });
      created++;
    });
    console.log(`  ✓ ${p._o.slug} → tenant ${p._slug}`);
  }
  const remaining = await db.organization.count({ where: { tenantId: null } });
  console.log(`\nDone. Created ${created} tenant(s). Orgs still without a tenant: ${remaining}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
