import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { reissueOrgCert } from "@/lib/signing";

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

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export function normalizeDomain(input: string): string | null {
  let d = String(input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!d) return null;
  let ascii: string;
  try {
    ascii = new URL(`http://${d}`).hostname;
  } catch {
    return null;
  }
  if (!HOSTNAME_RE.test(ascii)) return null;
  return ascii;
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

async function domainUnavailable(domain: string, tenantId: string): Promise<boolean> {
  const claim = await db.domainClaim.findUnique({ where: { domain }, select: { tenantId: true, releasedAt: true } });
  if (claim && !claim.releasedAt) {
    if (!claim.tenantId || claim.tenantId !== tenantId) return true;
  }
  const owner = await db.tenant.findUnique({ where: { verifiedDomain: domain }, select: { id: true } });
  return !!owner && owner.id !== tenantId;
}

export async function startChallenge(
  orgId: string,
  rawDomain: string,
  method: "dns" | "email",
  alias?: string,
): Promise<{ result: StartResult; token?: string; emailTo?: string }> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { result: { ok: false, error: "Enter a valid domain, e.g. acme.co.uk" } };
  if (isFreeEmailDomain(domain)) {
    return { result: { ok: false, error: "That's a public email provider. Verify a domain your organisation controls." } };
  }
  const startingOrg = await db.organization.findUnique({ where: { id: orgId }, select: { tenantId: true } });
  if (!startingOrg) return { result: { ok: false, error: "Unknown organisation." } };
  if (await domainUnavailable(domain, startingOrg.tenantId)) {
    return { result: { ok: false, error: "That domain is already claimed by another organisation and can't be verified here." } };
  }

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

async function promote(challengeId: string, orgId: string, domain: string, via: "dns" | "email"): Promise<{ verified: boolean; error?: string }> {
  const org0 = await db.organization.findUnique({ where: { id: orgId }, select: { tenantId: true } });
  if (!org0) return { verified: false, error: "Unknown organisation." };
  const tenantId = org0.tenantId;
  const existing = await db.domainClaim.findUnique({ where: { domain }, select: { tenantId: true, releasedAt: true } });
  if (existing && !existing.releasedAt && existing.tenantId && existing.tenantId !== tenantId) {
    return { verified: false, error: "That domain was just claimed by another organisation." };
  }
  try {
    await db.$transaction([
      db.tenant.update({
        where: { id: tenantId },
        data: { verifiedDomain: domain, domainVerifiedVia: via, domainVerifiedAt: new Date() },
      }),
      db.domainChallenge.update({ where: { id: challengeId }, data: { status: "verified", verifiedAt: new Date() } }),
      db.domainClaim.upsert({
        where: { domain },
        create: { domain, tenantId, orgId, verifiedAt: new Date() },
        update: { tenantId, orgId, verifiedAt: new Date(), releasedAt: null },
      }),
    ]);
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      return { verified: false, error: "That domain was just verified by another organisation." };
    }
    return { verified: false, error: "Could not complete verification. Try again." };
  }
  await syncTenantCerts(tenantId, domain);
  return { verified: true };
}

async function syncTenantCerts(tenantId: string, domain: string | null): Promise<void> {
  const orgs = await db.organization.findMany({ where: { tenantId }, select: { slug: true, name: true } });
  await Promise.all(orgs.map((o) => syncCertDomain(o.slug, o.name, domain)));
}

async function syncCertDomain(slug: string, name: string, domain: string | null): Promise<void> {
  try {
    await reissueOrgCert(slug, name, domain);
  } catch (e) {
    console.error(`[domain-verify] cert ${domain ? "bind" : "unbind"} failed for ${slug}:`, e);
  }
}

export async function releaseDomainClaim(rawDomain: string): Promise<boolean> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return false;
  const claim = await db.domainClaim.findUnique({ where: { domain }, select: { id: true, releasedAt: true } });
  if (!claim || claim.releasedAt) return false;
  await db.domainClaim.update({ where: { id: claim.id }, data: { releasedAt: new Date() } });
  return true;
}

export async function listDomainClaims() {
  return db.domainClaim.findMany({ orderBy: { verifiedAt: "desc" } });
}

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

export async function clearVerification(orgId: string): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { tenantId: true } });
  if (!org) return;
  await db.$transaction([
    db.tenant.update({
      where: { id: org.tenantId },
      data: { verifiedDomain: null, domainVerifiedVia: null, domainVerifiedAt: null },
    }),
    db.domainChallenge.updateMany({ where: { org: { tenantId: org.tenantId }, status: "pending" }, data: { status: "expired" } }),
  ]);
  await syncTenantCerts(org.tenantId, null);
}
