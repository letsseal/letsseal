import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const TEST_DB = process.env.TEST_DATABASE_URL;
const HAS_DB = !!TEST_DB;
if (HAS_DB) process.env.DATABASE_URL = TEST_DB;

const suite = HAS_DB ? test : test.skip;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function setup(envelopeStatus = "sent") {
  const { db } = await import("../lib/db.ts");
  const tenant = await db.tenant.create({ data: { slug: `t-${randomUUID()}`, name: "T" } });
  const org = await db.organization.create({ data: { slug: `o-${randomUUID()}`, name: "O", tenantId: tenant.id } });
  const user = await db.user.create({
    data: { email: `owner-${randomUUID()}@example.com`, emailVerified: new Date() },
  });
  await db.membership.create({ data: { userId: user.id, orgId: org.id, role: "owner" } });
  const env = await db.envelope.create({
    data: { orgId: org.id, title: "Agreement", pdfPath: "x.pdf", status: envelopeStatus },
  });
  return { db, envelopeId: env.id, orgId: org.id, tenantId: tenant.id, userId: user.id };
}

async function teardown(
  db: Awaited<ReturnType<typeof setup>>["db"],
  ids: { envelopeId: string; orgId: string; tenantId: string; userId: string },
) {
  await db.auditEvent.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.signer.deleteMany({ where: { envelopeId: ids.envelopeId } });
  await db.envelope.delete({ where: { id: ids.envelopeId } });
  await db.emailSend.deleteMany({ where: { orgId: ids.orgId } });
  await db.membership.deleteMany({ where: { orgId: ids.orgId } });
  await db.organization.delete({ where: { id: ids.orgId } });
  await db.user.delete({ where: { id: ids.userId } });
  await db.tenant.delete({ where: { id: ids.tenantId } });
}

type SignerOverrides = Partial<{
  role: string; status: string; email: string | null;
  invitedAt: Date | null; lastReminderAt: Date | null; remindersSent: number;
  remindersEnabled: boolean;
}>;

async function addSigner(db: Awaited<ReturnType<typeof setup>>["db"], envelopeId: string, o: SignerOverrides = {}) {
  return db.signer.create({
    data: {
      envelopeId,
      name: "Recipient",
      email: o.email === undefined ? `r-${randomUUID()}@example.com` : o.email,
      role: o.role ?? "signer",
      status: o.status ?? "pending",
      token: randomUUID(),
      invitedAt: o.invitedAt === undefined ? daysAgo(5) : o.invitedAt,
      lastReminderAt: o.lastReminderAt ?? null,
      remindersSent: o.remindersSent ?? 0,
      remindersEnabled: o.remindersEnabled ?? true,
    },
  });
}

async function dueIdsFor(envelopeId: string): Promise<Set<string>> {
  const { dueReminders } = await import("../lib/reminders.ts");
  const due = await dueReminders();
  return new Set(due.filter((d) => d.envelopeId === envelopeId).map((d) => d.signerId));
}

suite("a signer invited longer ago than the interval is due", async () => {
  const { db, ...ids } = await setup();
  try {
    const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(4) });
    assert.ok((await dueIdsFor(ids.envelopeId)).has(s.id));
  } finally {
    await teardown(db, ids);
  }
});

suite("a signer invited inside the interval waits", async () => {
  const { db, ...ids } = await setup();
  try {
    const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(2) });
    assert.equal((await dueIdsFor(ids.envelopeId)).has(s.id), false);
  } finally {
    await teardown(db, ids);
  }
});

suite("the interval runs from the LAST reminder, not from the invite", async () => {
  const { db, ...ids } = await setup();
  try {
    const recent = await addSigner(db, ids.envelopeId, {
      invitedAt: daysAgo(21), lastReminderAt: daysAgo(1), remindersSent: 1,
    });
    const stale = await addSigner(db, ids.envelopeId, {
      invitedAt: daysAgo(21), lastReminderAt: daysAgo(4), remindersSent: 1,
    });
    const due = await dueIdsFor(ids.envelopeId);
    assert.equal(due.has(recent.id), false, "chased yesterday, must wait");
    assert.ok(due.has(stale.id), "chased four days ago, is due");
  } finally {
    await teardown(db, ids);
  }
});

suite("chasing STOPS at the cap and never resumes", async () => {
  const { db, ...ids } = await setup();
  try {
    const { REMINDER_MAX } = await import("../lib/reminders.ts");
    const done = await addSigner(db, ids.envelopeId, {
      invitedAt: daysAgo(90), lastReminderAt: daysAgo(60), remindersSent: REMINDER_MAX,
    });
    assert.equal((await dueIdsFor(ids.envelopeId)).has(done.id), false,
      "a recipient at the cap must go quiet permanently, however overdue");
  } finally {
    await teardown(db, ids);
  }
});

suite("people who were never asked to sign are never chased", async () => {
  const { db, ...ids } = await setup();
  try {
    const cc = await addSigner(db, ids.envelopeId, { role: "cc" });
    const viewer = await addSigner(db, ids.envelopeId, { role: "viewer" });
    const signed = await addSigner(db, ids.envelopeId, { status: "signed" });
    const declined = await addSigner(db, ids.envelopeId, { status: "declined" });
    const noEmail = await addSigner(db, ids.envelopeId, { email: null, role: "in_person" });
    const uninvited = await addSigner(db, ids.envelopeId, { invitedAt: null });

    const due = await dueIdsFor(ids.envelopeId);
    for (const [label, s] of Object.entries({ cc, viewer, signed, declined, noEmail, uninvited })) {
      assert.equal(due.has(s.id), false, `${label} must not be chased`);
    }
  } finally {
    await teardown(db, ids);
  }
});

suite("a completed or voided envelope stops chasing immediately", async () => {
  for (const status of ["completed", "voided", "draft"]) {
    const { db, ...ids } = await setup(status);
    try {
      const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(30) });
      assert.equal((await dueIdsFor(ids.envelopeId)).has(s.id), false,
        `an envelope in "${status}" must not chase anyone`);
    } finally {
      await teardown(db, ids);
    }
  }
});

suite("a long-overdue recipient gets ONE reminder, not the whole backlog at once", async () => {
  const { db, ...ids } = await setup();
  try {
    const { runReminders } = await import("../lib/reminders.ts");
    const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(60) });

    const first = await runReminders({ dryRun: true, signerIds: [s.id] });
    assert.equal(first.sent, 1, "one run must offer exactly one reminder");

    await db.signer.update({
      where: { id: s.id },
      data: { remindersSent: 1, lastReminderAt: new Date() },
    });
    const second = await runReminders({ dryRun: true, signerIds: [s.id] });
    assert.equal(second.sent, 0, "the second reminder must wait out the interval");
  } finally {
    await teardown(db, ids);
  }
});

suite("a dry run changes nothing", async () => {
  const { db, ...ids } = await setup();
  try {
    const { runReminders } = await import("../lib/reminders.ts");
    const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(10) });
    await runReminders({ dryRun: true, signerIds: [s.id] });
    const after = await db.signer.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(after.remindersSent, 0);
    assert.equal(after.lastReminderAt, null);
    assert.equal(await db.emailSend.count({ where: { orgId: ids.orgId } }), 0);
  } finally {
    await teardown(db, ids);
  }
});

suite("a recipient with chasing switched off is never chased", async () => {
  const { db, ...ids } = await setup();
  try {
    const off = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(30), remindersEnabled: false });
    const on = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(30) });
    const due = await dueIdsFor(ids.envelopeId);
    assert.equal(due.has(off.id), false, "switched off must mean never emailed");
    assert.ok(due.has(on.id), "the others on the same envelope carry on as normal");
  } finally {
    await teardown(db, ids);
  }
});

suite("switching chasing off mid-run stops the send", async () => {
  const { db, ...ids } = await setup();
  try {
    const { runReminders } = await import("../lib/reminders.ts");
    const s = await addSigner(db, ids.envelopeId, { invitedAt: daysAgo(30) });
    await db.signer.update({ where: { id: s.id }, data: { remindersEnabled: false } });
    const run = await runReminders({ dryRun: true, signerIds: [s.id] });
    assert.equal(run.sent, 0, "a decision to stop must apply even mid-run");
  } finally {
    await teardown(db, ids);
  }
});
