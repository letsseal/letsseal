import { db } from "@/lib/db";

export const SESSION_VERSION_CLAIM = "sv";

export type VersionedToken = { sub?: string; [SESSION_VERSION_CLAIM]?: unknown };

export async function currentSessionVersion(userId: string): Promise<number | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  return u ? u.sessionVersion : null;
}

export async function sessionIsCurrent(token: VersionedToken): Promise<boolean> {
  if (!token?.sub) return false;
  const current = await currentSessionVersion(token.sub);
  if (current === null) return false; 
  const claimed = typeof token[SESSION_VERSION_CLAIM] === "number" ? (token[SESSION_VERSION_CLAIM] as number) : 0;
  return claimed === current;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const u = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return u.sessionVersion;
}
