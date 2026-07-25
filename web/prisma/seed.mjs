import { prismaClient } from "../scripts/_db.mjs";
import { hash } from "@node-rs/argon2";

const db = prismaClient();

const orgs = [
  { slug: "acme", name: "Acme Property Ltd", brandColor: "#0f766e", accentColor: "#14b8a6", fromEmail: "docs@acme.example" },
  { slug: "northside", name: "Northside Lettings", brandColor: "#7c3aed", accentColor: "#a855f7", fromEmail: "sign@northside.example" },
];

const DEMO_EMAIL = "demo@letsseal.org";
const DEMO_PASSWORD = "letsseal";

const passwordHash = await hash(DEMO_PASSWORD);
const user = await db.user.upsert({
  where: { email: DEMO_EMAIL },
  update: { passwordHash, name: "Demo Owner" },
  create: { email: DEMO_EMAIL, name: "Demo Owner", passwordHash },
});

for (const o of orgs) {
  const org = await db.organization.upsert({
    where: { slug: o.slug },
    update: { name: o.name, brandColor: o.brandColor, accentColor: o.accentColor, fromEmail: o.fromEmail },
    create: o,
  });
  await db.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: { role: "owner" },
    create: { userId: user.id, orgId: org.id, role: "owner" },
  });
  console.log(`seeded ${o.slug} (owner: ${DEMO_EMAIL})`);
}

console.log(`\nLogin: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
await db.$disconnect();
