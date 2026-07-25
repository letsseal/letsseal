import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const TEST_DB = process.env.TEST_DATABASE_URL;
const HAS_DB = !!TEST_DB;
if (HAS_DB) process.env.DATABASE_URL = TEST_DB;

const suite = HAS_DB ? test : test.skip;

const SEAL_CLAIM_TTL_MS = 10 * 60_000; 

async function setup() {
  const { db } = await import("../lib/db.ts");
  const tenant = await db.tenant.create({ data: { slug: `t-${randomUUID()}`, name: "T" } });
  const org = await db.organization.create({ data: { slug: `o-${randomUUID()}`, name: "O", tenantId: tenant.id } });
  const env = await db.envelope.create({
    data: { orgId: org.id, title: "E", pdfPath: "x.pdf", status: "sent" },
  });
  return { db, envelopeId: env.id, orgId: org.id, tenantId: tenant.id };
}

async function teardown(db: Awaited<ReturnType<typeof setup>>["db"], ids: { envelopeId: string; orgId: string; tenantId: string }) {
  await db.auditEvent.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.envelope.delete({ where: { id: ids.envelopeId } });
  await db.organization.delete({ where: { id: ids.orgId } });
  await db.tenant.delete({ where: { id: ids.tenantId } });
}

async function claim(db: Awaited<ReturnType<typeof setup>>["db"], envelopeId: string): Promise<boolean> {
  const staleAfter = new Date(Date.now() - SEAL_CLAIM_TTL_MS);
  const r = await db.envelope.updateMany({
    where: {
      id: envelopeId,
      status: "sent",
      OR: [{ sealingStartedAt: null }, { sealingStartedAt: { lt: staleAfter } }],
    },
    data: { sealingStartedAt: new Date() },
  });
  return r.count === 1;
}

suite("only ONE of many simultaneous finishers may seal", async () => {
  const { db, ...ids } = await setup();
  try {
    const results = await Promise.all(Array.from({ length: 20 }, () => claim(db, ids.envelopeId)));
    const winners = results.filter(Boolean).length;
    assert.equal(winners, 1, `exactly one request may seal (got ${winners})`);
  } finally {
    await teardown(db, ids);
  }
});

suite("a live claim blocks a later attempt", async () => {
  const { db, ...ids } = await setup();
  try {
    assert.ok(await claim(db, ids.envelopeId), "the first attempt wins");
    assert.equal(await claim(db, ids.envelopeId), false, "a second attempt must be refused while the claim is live");
  } finally {
    await teardown(db, ids);
  }
});

suite("a STALE claim is reclaimable, so a crash mid-seal cannot strand the envelope", async () => {
  const { db, ...ids } = await setup();
  try {
    assert.ok(await claim(db, ids.envelopeId));
    await db.envelope.update({
      where: { id: ids.envelopeId },
      data: { sealingStartedAt: new Date(Date.now() - SEAL_CLAIM_TTL_MS - 60_000) },
    });
    assert.ok(await claim(db, ids.envelopeId), "REGRESSION: a stale claim must be reclaimable");
  } finally {
    await teardown(db, ids);
  }
});

suite("releasing a failed claim allows an immediate retry", async () => {
  const { db, ...ids } = await setup();
  try {
    assert.ok(await claim(db, ids.envelopeId));
    await db.envelope.updateMany({ where: { id: ids.envelopeId, status: "sent" }, data: { sealingStartedAt: null } });
    assert.ok(await claim(db, ids.envelopeId), "a released claim must be immediately retryable");
  } finally {
    await teardown(db, ids);
  }
});

suite("a completed or voided envelope can never be claimed", async () => {
  const { db, ...ids } = await setup();
  try {
    for (const status of ["completed", "voided", "draft"]) {
      await db.envelope.update({ where: { id: ids.envelopeId }, data: { status, sealingStartedAt: null } });
      assert.equal(await claim(db, ids.envelopeId), false, `must not be claimable while ${status}`);
    }
  } finally {
    await db.envelope.update({ where: { id: ids.envelopeId }, data: { status: "sent" } });
    await teardown(db, ids);
  }
});
