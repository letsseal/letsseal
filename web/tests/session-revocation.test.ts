import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const TEST_DB = process.env.TEST_DATABASE_URL;
const HAS_DB = !!TEST_DB;
if (HAS_DB) process.env.DATABASE_URL = TEST_DB;

const suite = HAS_DB ? test : test.skip;

async function newUser() {
  const { db } = await import("../lib/db.ts");
  const user = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, name: "Test" },
  });
  return { db, user };
}

suite("a freshly stamped token is current", async () => {
  const { db, user } = await newUser();
  const { currentSessionVersion, sessionIsCurrent, SESSION_VERSION_CLAIM } = await import("../lib/session.ts");
  try {
    const v = await currentSessionVersion(user.id);
    assert.equal(v, 0, "a new user starts at version 0");
    assert.ok(await sessionIsCurrent({ sub: user.id, [SESSION_VERSION_CLAIM]: v! }));
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});

suite("bumping the version invalidates tokens issued before it", async () => {
  const { db, user } = await newUser();
  const { sessionIsCurrent, revokeAllSessions, SESSION_VERSION_CLAIM } = await import("../lib/session.ts");
  try {
    const token = { sub: user.id, [SESSION_VERSION_CLAIM]: 0 };
    assert.ok(await sessionIsCurrent(token), "valid before the bump");

    const next = await revokeAllSessions(user.id);
    assert.equal(next, 1);

    assert.equal(await sessionIsCurrent(token), false, "REGRESSION: a token from before the bump must be dead");
    assert.ok(await sessionIsCurrent({ sub: user.id, [SESSION_VERSION_CLAIM]: 1 }));
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});

suite("tokens minted before this feature existed keep working", async () => {
  const { db, user } = await newUser();
  const { sessionIsCurrent } = await import("../lib/session.ts");
  try {
    assert.ok(await sessionIsCurrent({ sub: user.id }), "a claimless legacy token stays valid");
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});

suite("a token for a deleted account stops working", async () => {
  const { db, user } = await newUser();
  const { sessionIsCurrent, SESSION_VERSION_CLAIM } = await import("../lib/session.ts");
  const token = { sub: user.id, [SESSION_VERSION_CLAIM]: 0 };
  assert.ok(await sessionIsCurrent(token));
  await db.user.delete({ where: { id: user.id } });
  assert.equal(await sessionIsCurrent(token), false, "a deleted user's token must not authenticate");
});

suite("a token with no subject is never current", async () => {
  const { sessionIsCurrent } = await import("../lib/session.ts");
  assert.equal(await sessionIsCurrent({}), false);
  assert.equal(await sessionIsCurrent({ sub: "" }), false);
});
