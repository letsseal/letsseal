import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LEN = 20;

function makeCode() {
  const out = [];
  while (out.length < LEN) {
    const buf = randomBytes(LEN);
    for (let i = 0; i < buf.length && out.length < LEN; i++) out.push(ALPHABET[buf[i] & 31]);
  }
  return out.join("");
}

const db = new PrismaClient();
const issued = new Set(); 

async function uniqueCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const c = makeCode();
    if (issued.has(c)) continue;
    const [d, a] = await Promise.all([
      db.sealedDocument.findUnique({ where: { proofCode: c }, select: { id: true } }),
      db.anchor.findUnique({ where: { proofCode: c }, select: { id: true } }),
    ]);
    if (!d && !a) { issued.add(c); return c; }
  }
  throw new Error("could not allocate a unique proof code after 12 attempts");
}

async function backfill(model, label) {
  const rows = await model.findMany({ where: { proofCode: null }, select: { id: true } });
  let done = 0;
  for (const row of rows) {
    await model.update({ where: { id: row.id }, data: { proofCode: await uniqueCode() } });
    done++;
    if (done % 100 === 0) console.log(`  ${label}: ${done}/${rows.length}`);
  }
  console.log(`✓ ${label}: backfilled ${done} row(s)`);
  return done;
}

try {
  const docs = await backfill(db.sealedDocument, "SealedDocument");
  const anchors = await backfill(db.anchor, "Anchor");
  console.log(`done — ${docs + anchors} row(s) given a proof code.`);
} finally {
  await db.$disconnect();
}
