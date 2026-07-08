import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const orgs = [
  { slug: "acme", name: "Acme Property Ltd", brandColor: "#0f766e", fromEmail: "docs@acme.example" },
  { slug: "northside", name: "Northside Lettings", brandColor: "#7c3aed", fromEmail: "sign@northside.example" },
];

for (const o of orgs) {
  const org = await db.organization.upsert({
    where: { slug: o.slug },
    update: { name: o.name, brandColor: o.brandColor, fromEmail: o.fromEmail },
    create: o,
  });
  await db.user.upsert({
    where: { orgId_email: { orgId: org.id, email: `owner@${o.slug}.example` } },
    update: {},
    create: { orgId: org.id, email: `owner@${o.slug}.example`, name: "Owner", role: "owner" },
  });
  console.log(`seeded ${o.slug} (${org.id})`);
}
await db.$disconnect();
