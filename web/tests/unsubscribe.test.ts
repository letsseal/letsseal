import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.AUDIT_HMAC_SECRET ??= "test-audit-key-not-a-real-secret";

const TEST_DB = process.env.TEST_DATABASE_URL;
const HAS_DB = !!TEST_DB;
if (HAS_DB) process.env.DATABASE_URL = TEST_DB;

const suite = HAS_DB ? test : test.skip;

async function setup() {
  const { db } = await import("../lib/db.ts");
  const tenant = await db.tenant.create({ data: { slug: `t-${randomUUID()}`, name: "T" } });
  const org = await db.organization.create({ data: { slug: `o-${randomUUID()}`, name: "O", tenantId: tenant.id } });
  const env = await db.envelope.create({
    data: { orgId: org.id, title: "Agreement", pdfPath: "x.pdf", status: "sent" },
  });
  const signer = await db.signer.create({
    data: {
      envelopeId: env.id, name: "Recipient", email: `r-${randomUUID()}@example.com`,
      role: "signer", status: "pending", token: randomUUID(), invitedAt: new Date(),
    },
  });
  return { db, tenantId: tenant.id, orgId: org.id, envelopeId: env.id, signer };
}

async function teardown(db: any, ids: { tenantId: string; orgId: string; envelopeId: string }) {
  await db.auditEvent.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.signer.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.envelope.delete({ where: { id: ids.envelopeId } });
  await db.organization.delete({ where: { id: ids.orgId } });
  await db.tenant.delete({ where: { id: ids.tenantId } });
}

const url = (token: string) => `https://app.letsseal.org/api/reminders/unsubscribe?token=${token}`;

suite("a one-click POST stops reminders for that recipient", async () => {
  const { db, signer, ...ids } = await setup();
  try {
    const { POST } = await import("../app/api/reminders/unsubscribe/route.ts");
    const res = await POST(new Request(url(signer.token), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }) as never);

    assert.equal(res.status, 200, "a provider must never see an error from this");
    const after = await db.signer.findUniqueOrThrow({ where: { id: signer.id } });
    assert.equal(after.remindersEnabled, false, "reminders must actually stop");
  } finally {
    await teardown(db, ids);
  }
});

suite("a GET never unsubscribes anyone", async () => {
  const { db, signer, ...ids } = await setup();
  try {
    const { GET } = await import("../app/api/reminders/unsubscribe/route.ts");
    const res = await GET(new Request(url(signer.token)) as never);
    assert.equal(res.status, 200);

    const after = await db.signer.findUniqueOrThrow({ where: { id: signer.id } });
    assert.equal(after.remindersEnabled, true,
      "a link preview or security scanner must not be able to switch reminders off");
  } finally {
    await teardown(db, ids);
  }
});

suite("unsubscribing does not disturb the signing link", async () => {
  const { db, signer, ...ids } = await setup();
  try {
    const { POST } = await import("../app/api/reminders/unsubscribe/route.ts");
    await POST(new Request(url(signer.token), { method: "POST", body: "List-Unsubscribe=One-Click" }) as never);

    const after = await db.signer.findUniqueOrThrow({ where: { id: signer.id } });
    assert.equal(after.token, signer.token, "the signing token must be untouched");
    assert.equal(after.status, "pending", "they are still a signer who has not signed");
  } finally {
    await teardown(db, ids);
  }
});

suite("an unknown token is accepted quietly rather than probed", async () => {
  const { db, ...ids } = await setup();
  try {
    const { POST } = await import("../app/api/reminders/unsubscribe/route.ts");
    const res = await POST(new Request(url("not-a-real-token"), {
      method: "POST", body: "List-Unsubscribe=One-Click",
    }) as never);
    assert.equal(res.status, 200);
  } finally {
    await teardown(db, ids);
  }
});

suite("unsubscribing twice is harmless", async () => {
  const { db, signer, ...ids } = await setup();
  try {
    const { POST } = await import("../app/api/reminders/unsubscribe/route.ts");
    const once = () => POST(new Request(url(signer.token), { method: "POST", body: "List-Unsubscribe=One-Click" }) as never);
    assert.equal((await once()).status, 200);
    assert.equal((await once()).status, 200);
    const after = await db.signer.findUniqueOrThrow({ where: { id: signer.id } });
    assert.equal(after.remindersEnabled, false);
    const events = await db.auditEvent.count({
      where: { envelopeId: ids.envelopeId, action: "reminders_disabled" },
    });
    assert.equal(events, 1, "only the state change is recorded, not every request");
  } finally {
    await teardown(db, ids);
  }
});
