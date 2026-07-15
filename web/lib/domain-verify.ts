import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const CONTROLLER_ALIASES = ["admin", "administrator", "postmaster", "hostmaster", "webmaster"] as const;

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
  "yandex.com", "pm.me", "fastmail.com",
]);

const DNS_PREFIX = "_letsseal-challenge";
const VALUE_PREFIX = "letsseal-verify=";
const DNS_TTL_DAYS = 7;
const EMAIL_TTL_HOURS = 24;

export type StartResult =
  | { ok: true; method: "dns"; domain: string; recordName: string; recordValue: string; expiresAt: string }
  | { ok: true; method: "email"; domain: string; sentTo: string; expiresAt: string }
  | { ok: false; error: string };

export function normalizeDomain(input: string): string | null {
  let d = String(input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
  return d;
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain);
}

export function dnsRecord(domain: string, token: string) {
  return { name: `${DNS_PREFIX}.${domain}`, value: `${VALUE_PREFIX}${token}` };
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Reject if some OTHER org already owns this verified domain. */
async function domainTakenByAnother(domain: string, orgId: string): Promise<boolean> {
  const owner = await db.organization.findUnique({ where: { verifiedDomain: domain }, select: { id: true } });
  return !!owner && owner.id !== orgId;
}

/**
 * Begin a challenge. For email, `alias` must be a controller alias; the caller is
 * responsible for actually sending the mail (see mailer.sendDomainVerification) —
 * we return the token via the StartResult only for dns (it's public in the record).
 */
export async function startChallenge(
  orgId: string,
  rawDomain: string,
  method: "dns" | "email",
  alias?: string,
): Promise<{ result: StartResult; token?: string; emailTo?: string }> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { result: { ok: false, error: "Enter a valid domain, e.g. acme.co.uk" } };
  if (isFreeEmailDomain(domain)) {
    return { result: { ok: false, error: "That's a public email provider — verify a domain your organisation controls." } };
  }
  if (await domainTakenByAnother(domain, orgId)) {
    return { result: { ok: false, error: "That domain is already verified by another organisation." } };
  }

  // Retire any previous pending challenges for this org+domain to avoid dangling tokens.
  await db.domainChallenge.updateMany({
    where: { orgId, domain, status: "pending" },
    data: { status: "expired" },
  });

  const token = newToken();
  if (method === "dns") {
    const expiresAt = new Date(Date.now() + DNS_TTL_DAYS * 86400_000);
    await db.domainChallenge.create({ data: { orgId, domain, method: "dns", token, expiresAt } });
    const rec = dnsRecord(domain, token);
    return {
      result: { ok: true, method: "dns", domain, recordName: rec.name, recordValue: rec.value, expiresAt: expiresAt.toISOString() },
      token,
    };
  }

  // email
  if (!alias || !(CONTROLLER_ALIASES as readonly string[]).includes(alias)) {
    return { result: { ok: false, error: "Choose a controller address (admin, postmaster, hostmaster, webmaster, administrator)." } };
  }
  const emailTo = `${alias}@${domain}`;
  const expiresAt = new Date(Date.now() + EMAIL_TTL_HOURS * 3600_000);
  await db.domainChallenge.create({ data: { orgId, domain, method: "email", token, emailTarget: emailTo, expiresAt } });
  return {
    result: { ok: true, method: "email", domain, sentTo: emailTo, expiresAt: expiresAt.toISOString() },
    token,
    emailTo,
  };
}

/** Check the DNS TXT record for the org's latest pending dns challenge. */
export async function checkDnsChallenge(orgId: string): Promise<{ verified: boolean; error?: string }> {
  const ch = await db.domainChallenge.findFirst({
    where: { orgId, method: "dns", status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!ch) return { verified: false, error: "No pending DNS verification. Start one first." };
  if (ch.expiresAt < new Date()) {
    await db.domainChallenge.update({ where: { id: ch.id }, data: { status: "expired" } });
    return { verified: false, error: "This challenge expired — start a new one." };
  }
  const { name, value } = dnsRecord(ch.domain, ch.token);
  let records: string[][];
  try {
    records = await dns.resolveTxt(name);
  } catch {
    return { verified: false, error: `No TXT record found yet at ${name}. DNS can take a few minutes to propagate.` };
  }
  const flat = records.map((chunks) => chunks.join("").trim());
  if (!flat.includes(value)) {
    return { verified: false, error: `Found TXT records at ${name}, but none matched. Check the value is exactly "${value}".` };
  }
  return promote(ch.id, orgId, ch.domain, "dns");
}

/** Confirm an email-method challenge from a clicked link token. Public (proves mailbox control). */
export async function confirmEmailToken(token: string): Promise<{ verified: boolean; domain?: string; org?: string; error?: string }> {
  const ch = await db.domainChallenge.findUnique({ where: { token }, include: { org: { select: { name: true } } } });
  if (!ch || ch.method !== "email") return { verified: false, error: "This verification link is not valid." };
  if (ch.status === "verified") return { verified: true, domain: ch.domain, org: ch.org.name };
  if (ch.status !== "pending" || ch.expiresAt < new Date()) {
    if (ch.status === "pending") await db.domainChallenge.update({ where: { id: ch.id }, data: { status: "expired" } });
    return { verified: false, error: "This verification link has expired — start a new one from settings." };
  }
  const r = await promote(ch.id, ch.orgId, ch.domain, "email");
  return r.verified ? { verified: true, domain: ch.domain, org: ch.org.name } : { verified: false, error: r.error };
}

/** Atomically mark the org verified for a domain, guarding the one-org-per-domain rule. */
async function promote(challengeId: string, orgId: string, domain: string, via: "dns" | "email"): Promise<{ verified: boolean; error?: string }> {
  try {
    await db.$transaction([
      db.organization.update({
        where: { id: orgId },
        data: { verifiedDomain: domain, domainVerifiedVia: via, domainVerifiedAt: new Date() },
      }),
      db.domainChallenge.update({ where: { id: challengeId }, data: { status: "verified", verifiedAt: new Date() } }),
    ]);
    return { verified: true };
  } catch (e: unknown) {
    // Unique-constraint race: another org grabbed this domain between check and write.
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      return { verified: false, error: "That domain was just verified by another organisation." };
    }
    return { verified: false, error: "Could not complete verification — try again." };
  }
}

/** Read-only lookup of an email challenge by token, for the confirm landing page. */
export async function peekChallenge(token: string): Promise<
  { domain: string; org: string; status: "pending" | "verified" | "expired" | "invalid" } | null
> {
  const ch = await db.domainChallenge.findUnique({ where: { token }, include: { org: { select: { name: true } } } });
  if (!ch || ch.method !== "email") return null;
  let status: "pending" | "verified" | "expired" | "invalid" =
    ch.status === "verified" ? "verified" : ch.status === "pending" ? "pending" : "expired";
  if (status === "pending" && ch.expiresAt < new Date()) status = "expired";
  return { domain: ch.domain, org: ch.org.name, status };
}

/** Latest still-live pending challenge for an org, shaped for the settings UI. */
export async function pendingForSettings(orgId: string): Promise<
  | { kind: "dns"; domain: string; recordName: string; recordValue: string }
  | { kind: "email"; domain: string; sentTo: string }
  | null
> {
  const ch = await db.domainChallenge.findFirst({
    where: { orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!ch || ch.expiresAt < new Date()) return null;
  if (ch.method === "dns") {
    const rec = dnsRecord(ch.domain, ch.token);
    return { kind: "dns", domain: ch.domain, recordName: rec.name, recordValue: rec.value };
  }
  return { kind: "email", domain: ch.domain, sentTo: ch.emailTarget ?? "" };
}

/** Clear an org's domain verification (and any pending challenges). */
export async function clearVerification(orgId: string): Promise<void> {
  await db.$transaction([
    db.organization.update({ where: { id: orgId }, data: { verifiedDomain: null, domainVerifiedVia: null, domainVerifiedAt: null } }),
    db.domainChallenge.updateMany({ where: { orgId, status: "pending" }, data: { status: "expired" } }),
  ]);
}
