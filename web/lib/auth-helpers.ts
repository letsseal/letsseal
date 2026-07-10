import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as { id: string; email: string; name?: string | null };
}

export async function getUserOrgs(userId: string) {
  return db.organization.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { envelopes: true } } },
  });
}

export async function requireOrg(userId: string, slug: string) {
  const org = await db.organization.findFirst({
    where: { slug, memberships: { some: { userId } } },
  });
  return org; 
}

export async function apiUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function userOwnsEnvelope(userId: string, envelopeId: string) {
  const env = await db.envelope.findUnique({
    where: { id: envelopeId },
    select: { org: { select: { slug: true, memberships: { where: { userId }, select: { id: true } } } } },
  });
  return !!env?.org.memberships.length;
}
