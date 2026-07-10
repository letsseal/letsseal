import { db } from "./db";
import { verifyAuditChain } from "./audit";

export type TrailEntry = { action: string; actorName: string; at: string; ip: string | null };

export type SignerAttribution = {
  name: string;
  channel: "email" | "link" | "in_person"; 
  email: string | null;
  viewedAt: string | null;
  signedAt: string | null;
};

export type SigningTrail = {
  entries: TrailEntry[];
  signers: SignerAttribution[];
  sharedSession: boolean; 
  chainIntact: boolean; 
};

const realIp = (ip: string | null | undefined): string | null =>
  ip && ip !== "local" && ip !== "127.0.0.1" && ip !== "::1" ? ip : null;

export async function getSigningTrail(envelopeId: string): Promise<SigningTrail> {
  const [events, signers, chainIntact] = await Promise.all([
    db.auditEvent.findMany({ where: { envelopeId }, orderBy: { createdAt: "asc" } }),
    db.signer.findMany({ where: { envelopeId }, orderBy: { order: "asc" } }),
    verifyAuditChain(envelopeId),
  ]);
  const nameOf = new Map(signers.map((s) => [s.id, s.name]));

  const entries: TrailEntry[] = events.map((e) => ({
    action: e.action,
    actorName: e.actor === "system" ? "System" : nameOf.get(e.actor) ?? "Unknown",
    at: e.createdAt.toISOString(),
    ip: realIp(e.ip),
  }));

  const attributions: SignerAttribution[] = signers.map((s) => {
    const invited = events.some((e) => e.actor === s.id && e.action === "invite_sent");
    const viewed = events.find((e) => e.actor === s.id && e.action === "viewed");
    const signed = events.find((e) => e.actor === s.id && e.action === "signed");
    return {
      name: s.name,
      channel: invited ? "email" : s.email ? "link" : "in_person",
      email: s.email,
      viewedAt: viewed?.createdAt.toISOString() ?? null,
      signedAt: signed?.createdAt.toISOString() ?? s.signedAt?.toISOString() ?? null,
    };
  });

  const ipToSigners = new Map<string, Set<string>>();
  for (const e of events) {
    const ip = realIp(e.ip);
    if (e.action !== "signed" || !ip || !nameOf.has(e.actor)) continue;
    (ipToSigners.get(ip) ?? ipToSigners.set(ip, new Set()).get(ip)!).add(e.actor);
  }
  const sharedSession = signers.length >= 2 && [...ipToSigners.values()].some((set) => set.size >= 2);

  return { entries, signers: attributions, sharedSession, chainIntact };
}
