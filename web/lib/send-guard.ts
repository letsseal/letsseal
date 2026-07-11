import { db } from "@/lib/db";

const NEW_ORG_DAILY = 20; 
const TRUSTED_DAILY = 200; 
const BURST_PER_MIN = 30; 
const TRUST_AGE_DAYS = 7; 
const ACCOUNT_DAILY = 300; 

export type SendKind = "invite" | "credential" | "completed" | "completed_sender";

const GATED: SendKind[] = ["invite", "credential"];

type GuardOrg = { sendingEnabled: boolean; sendingTrusted: boolean; createdAt: Date };

function dailyCap(org: GuardOrg): number {
  if (org.sendingTrusted) return TRUSTED_DAILY;
  const ageDays = (Date.now() - org.createdAt.getTime()) / 86_400_000;
  return ageDays >= TRUST_AGE_DAYS ? TRUSTED_DAILY : NEW_ORG_DAILY;
}

export async function canSend(orgId: string): Promise<{ ok: boolean; reason?: string }> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { sendingEnabled: true, sendingTrusted: true, createdAt: true },
  });
  if (!org) return { ok: false, reason: "unknown business" };
  if (!org.sendingEnabled) return { ok: false, reason: "email sending is disabled for this business" };

  const verifiedOwner = await db.membership.findFirst({
    where: { orgId, role: { in: ["owner", "admin"] }, user: { emailVerified: { not: null } } },
    select: { id: true },
  });
  if (!verifiedOwner) return { ok: false, reason: "verify your email to start sending" };

  const now = Date.now();
  const [burst, today] = await Promise.all([
    db.emailSend.count({ where: { orgId, kind: { in: GATED }, createdAt: { gte: new Date(now - 60_000) } } }),
    db.emailSend.count({ where: { orgId, kind: { in: GATED }, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (burst >= BURST_PER_MIN) return { ok: false, reason: "sending too fast — try again in a minute" };
  const cap = dailyCap(org);
  if (today >= cap) return { ok: false, reason: `daily email limit reached (${cap}) — contact us to raise it` };

  // Per-ACCOUNT ceiling: the per-org cap alone lets one user spin up N orgs to get
  // N×cap arbitrary-recipient sends through the shared (account-wide-reputation)
  // SES identity. Sum gated sends across every org this account owns and fail closed.
  const owner = await db.membership.findFirst({ where: { orgId, role: "owner" }, select: { userId: true } });
  if (owner) {
    const ownedOrgs = await db.membership.findMany({
      where: { userId: owner.userId, role: "owner" }, select: { orgId: true },
    });
    const acctToday = await db.emailSend.count({
      where: { orgId: { in: ownedOrgs.map((m) => m.orgId) }, kind: { in: GATED }, createdAt: { gte: new Date(now - 86_400_000) } },
    });
    if (acctToday >= ACCOUNT_DAILY) return { ok: false, reason: "account-wide daily email limit reached — contact us to raise it" };
  }
  return { ok: true };
}

// Log a sent email (every kind — audit + volume). Best-effort: a logging hiccup
// must never fail the surrounding request.
export async function recordSend(orgId: string, to: string, kind: SendKind): Promise<void> {
  try {
    await db.emailSend.create({ data: { orgId, to, kind } });
  } catch {
    /* non-fatal */
  }
}
