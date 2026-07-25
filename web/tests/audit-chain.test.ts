import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const TEST_DB = process.env.TEST_DATABASE_URL;
const HAS_DB = !!TEST_DB;
if (HAS_DB) process.env.DATABASE_URL = TEST_DB; 

process.env.AUDIT_HMAC_SECRET ??= "test-audit-key-not-a-real-secret";

const suite = HAS_DB ? test : test.skip;

async function setup() {
  const { db } = await import("../lib/db.ts");
  const tenant = await db.tenant.create({ data: { slug: `t-${randomUUID()}`, name: "Test Tenant" } });
  const org = await db.organization.create({
    data: { slug: `o-${randomUUID()}`, name: "Test Org", tenantId: tenant.id },
  });
  const env = await db.envelope.create({
    data: { orgId: org.id, title: "Test envelope", pdfPath: "test.pdf" },
  });
  return { db, envelopeId: env.id, tenantId: tenant.id, orgId: org.id };
}

async function teardown(db: Awaited<ReturnType<typeof setup>>["db"], ids: { envelopeId: string; orgId: string; tenantId: string }) {
  await db.auditEvent.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.envelope.delete({ where: { id: ids.envelopeId } });
  await db.organization.delete({ where: { id: ids.orgId } });
  await db.tenant.delete({ where: { id: ids.tenantId } });
}

suite("a sequential chain verifies, and every event gets the next position", async () => {
  const { db, ...ids } = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    for (const action of ["created", "viewed", "field_filled", "signed", "sealed"]) {
      await appendAudit(ids.envelopeId, "system", action, { ip: "1.2.3.4", userAgent: "test" });
    }
    const rows = await db.auditEvent.findMany({ where: { envelopeId: ids.envelopeId }, orderBy: { seq: "asc" } });
    assert.deepEqual(rows.map((r) => r.seq), [1, 2, 3, 4, 5]);
    assert.equal(rows[0].prevHash, null);
    for (let i = 1; i < rows.length; i++) assert.equal(rows[i].prevHash, rows[i - 1].hash);
    assert.ok(await verifyAuditChain(ids.envelopeId));
  } finally {
    await teardown(db, ids);
  }
});

suite("CONCURRENT appends do not break the chain", async () => {
  const { db, ...ids } = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    const N = 60;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        appendAudit(ids.envelopeId, `signer-${i}`, "signed", { ip: "1.2.3.4" }),
      ),
    );
    const rejected = settled.filter((r) => r.status === "rejected");
    assert.equal(rejected.length, 0, `no append may be dropped (${rejected.length} threw)`);

    const rows = await db.auditEvent.findMany({ where: { envelopeId: ids.envelopeId }, orderBy: { seq: "asc" } });
    assert.equal(rows.length, N, "every append must land");
    assert.deepEqual(rows.map((r) => r.seq), Array.from({ length: N }, (_, i) => i + 1), "positions must be 1..N with no gap or repeat");
    assert.ok(await verifyAuditChain(ids.envelopeId), "the chain must still verify after concurrent appends");
  } finally {
    await teardown(db, ids);
  }
});

suite("editing a stored event breaks verification", async () => {
  const { db, ...ids } = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    await appendAudit(ids.envelopeId, "system", "created");
    await appendAudit(ids.envelopeId, "alice", "signed", { ip: "1.2.3.4" });
    await appendAudit(ids.envelopeId, "system", "sealed");
    assert.ok(await verifyAuditChain(ids.envelopeId));

    const target = await db.auditEvent.findFirst({ where: { envelopeId: ids.envelopeId, action: "signed" } });
    await db.auditEvent.update({ where: { id: target!.id }, data: { actor: "mallory" } });
    assert.equal(await verifyAuditChain(ids.envelopeId), false, "an edited actor must fail the chain");
  } finally {
    await teardown(db, ids);
  }
});

suite("TRUNCATING the trail is detected", async () => {
  const { db, ...ids } = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    for (const a of ["created", "viewed", "signed", "sealed"]) await appendAudit(ids.envelopeId, "system", a);
    assert.ok(await verifyAuditChain(ids.envelopeId));

    const mid = await db.auditEvent.findFirst({ where: { envelopeId: ids.envelopeId, seq: 2 } });
    await db.auditEvent.delete({ where: { id: mid!.id } });
    assert.equal(await verifyAuditChain(ids.envelopeId), false, "a gap in the chain must fail");
  } finally {
    await teardown(db, ids);
  }
});

suite("a forged row with an arbitrary hash fails closed", async () => {
  const { db, ...ids } = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    await appendAudit(ids.envelopeId, "system", "created");
    const tip = await db.auditEvent.findFirst({ where: { envelopeId: ids.envelopeId }, orderBy: { seq: "desc" } });
    await db.auditEvent.create({
      data: {
        envelopeId: ids.envelopeId, seq: 2, actor: "mallory", action: "signed",
        prevHash: tip!.hash, hash: "deadbeef".repeat(8),
      },
    });
    assert.equal(await verifyAuditChain(ids.envelopeId), false, "an unrecognised hash scheme must not be trusted");
  } finally {
    await teardown(db, ids);
  }
});

suite("chains are bound to their envelope and cannot be transplanted", async () => {
  const a = await setup();
  const b = await setup();
  const { appendAudit, verifyAuditChain } = await import("../lib/audit.ts");
  try {
    await appendAudit(a.envelopeId, "system", "created");
    await appendAudit(a.envelopeId, "alice", "signed");
    assert.ok(await verifyAuditChain(a.envelopeId));

    await a.db.auditEvent.updateMany({ where: { envelopeId: a.envelopeId }, data: { envelopeId: b.envelopeId } });
    assert.equal(await verifyAuditChain(b.envelopeId), false, "a transplanted chain must not verify");
  } finally {
    await a.db.auditEvent.deleteMany({ where: { envelopeId: b.envelopeId } });
    await teardown(a.db, a);
    await teardown(b.db, b);
  }
});
