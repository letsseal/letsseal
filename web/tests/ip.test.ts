import test from "node:test";
import assert from "node:assert/strict";

const headersOf = (h: Record<string, string>) => ({
  headers: { get: (n: string) => h[n.toLowerCase()] ?? null },
});

async function withProxy(mode: string | undefined, fn: (clientIp: typeof import("../lib/ip.ts").clientIp) => void) {
  const prev = process.env.TRUSTED_PROXY;
  const prevXff = process.env.TRUST_XFF;
  if (mode === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = mode;
  delete process.env.TRUST_XFF;
  try {
    const { clientIp } = await import("../lib/ip.ts");
    fn(clientIp);
  } finally {
    if (prev === undefined) delete process.env.TRUSTED_PROXY; else process.env.TRUSTED_PROXY = prev;
    if (prevXff === undefined) delete process.env.TRUST_XFF; else process.env.TRUST_XFF = prevXff;
  }
}

test("with no trusted proxy, NO forwarding header is believed", async () => {
  await withProxy("none", (clientIp) => {
    assert.equal(clientIp(headersOf({ "cf-connecting-ip": "1.2.3.4" })), "local");
    assert.equal(clientIp(headersOf({ "x-real-ip": "1.2.3.4" })), "local");
    assert.equal(clientIp(headersOf({ "x-forwarded-for": "1.2.3.4" })), "local");
    assert.equal(clientIp(headersOf({ "true-client-ip": "1.2.3.4" })), "local");
  });
});

test("TRUSTED_PROXY is unset by default, which means trust nothing", async () => {
  await withProxy(undefined, (clientIp) => {
    assert.equal(clientIp(headersOf({ "cf-connecting-ip": "1.2.3.4" })), "local");
  });
});

test("each mode reads its own header and ignores the others", async () => {
  await withProxy("cloudflare", (clientIp) => {
    assert.equal(clientIp(headersOf({ "cf-connecting-ip": "9.9.9.9", "x-real-ip": "1.1.1.1" })), "9.9.9.9");
    assert.equal(clientIp(headersOf({ "x-real-ip": "1.1.1.1" })), "local");
  });
  await withProxy("xrealip", (clientIp) => {
    assert.equal(clientIp(headersOf({ "x-real-ip": "9.9.9.9", "cf-connecting-ip": "1.1.1.1" })), "9.9.9.9");
    assert.equal(clientIp(headersOf({ "cf-connecting-ip": "1.1.1.1" })), "local");
  });
});

test("X-Forwarded-For takes the LAST hop, the one our own proxy appended", async () => {
  await withProxy("xff", (clientIp) => {
    assert.equal(clientIp(headersOf({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 9.9.9.9" })), "9.9.9.9");
    assert.equal(clientIp(headersOf({ "x-forwarded-for": "9.9.9.9" })), "9.9.9.9");
  });
});

test("non-IP header values never become a bucket key or an audit entry", async () => {
  await withProxy("xrealip", (clientIp) => {
    for (const bad of ["not-an-ip", "'; DROP TABLE", "", "  ", "999.999.999.999", "1.2.3", "a".repeat(500)]) {
      assert.equal(clientIp(headersOf({ "x-real-ip": bad })), "local", `rejected: ${JSON.stringify(bad)}`);
    }
  });
});

test("real IPv4 and IPv6 literals are accepted", async () => {
  await withProxy("xrealip", (clientIp) => {
    for (const good of ["1.2.3.4", "255.255.255.255", "0.0.0.0", "::1", "2001:db8::1", "[2001:db8::1]"]) {
      assert.notEqual(clientIp(headersOf({ "x-real-ip": good })), "local", `accepted: ${good}`);
    }
  });
});

test("TRUST_XFF=1 still works as the legacy alias", async () => {
  const prev = process.env.TRUSTED_PROXY;
  delete process.env.TRUSTED_PROXY;
  process.env.TRUST_XFF = "1";
  try {
    const { clientIp } = await import("../lib/ip.ts");
    assert.equal(clientIp(headersOf({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" })), "9.9.9.9");
  } finally {
    delete process.env.TRUST_XFF;
    if (prev !== undefined) process.env.TRUSTED_PROXY = prev;
  }
});
