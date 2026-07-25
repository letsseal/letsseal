import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readFile, fileExists } from "@/lib/storage";

export function sidecarPath(rec: { id: string; sha256: string }, name: string): string {
  return `hosted/${rec.sha256}/${rec.id}/${name}`;
}

function legacySidecarPath(sha256: string, name: string): string {
  return `hosted/${sha256}/${name}`;
}

export async function readSidecar(rec: { id: string; sha256: string }, name: string): Promise<string | null> {
  const scoped = sidecarPath(rec, name);
  if (await fileExists(scoped)) return (await readFile(scoped)).toString("utf8");
  const legacy = legacySidecarPath(rec.sha256, name);
  if (await fileExists(legacy)) return (await readFile(legacy)).toString("utf8");
  return null;
}

export async function sidecarExists(rec: { id: string; sha256: string }, name: string): Promise<boolean> {
  return (await fileExists(sidecarPath(rec, name))) || (await fileExists(legacySidecarPath(rec.sha256, name)));
}

export async function sidecarKey(rec: { id: string; sha256: string }, name: string): Promise<string | null> {
  const scoped = sidecarPath(rec, name);
  if (await fileExists(scoped)) return scoped;
  const legacy = legacySidecarPath(rec.sha256, name);
  if (await fileExists(legacy)) return legacy;
  return null;
}

export function canonicalProofQuery(sha256: string): {
  where: Prisma.SealedDocumentWhereInput;
  orderBy: Prisma.SealedDocumentOrderByWithRelationInput[];
} {
  return {
    where: { sha256: sha256.trim().toLowerCase() },
    orderBy: [{ sealedAt: "asc" }, { id: "asc" }],
  };
}

export type CoIssuer = { org: string | null; certCN: string; sealType: string; sealedAt: Date; proofCode: string | null };

export async function coIssuersFor(sha256: string, excludeId: string): Promise<CoIssuer[]> {
  const rows = await db.sealedDocument.findMany({
    where: { sha256: sha256.toLowerCase(), id: { not: excludeId } },
    orderBy: [{ sealedAt: "asc" }, { id: "asc" }],
    take: 20,
    select: {
      certCN: true, sealType: true, sealedAt: true, proofCode: true,
      org: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    org: r.org?.name ?? null,
    certCN: r.certCN,
    sealType: r.sealType,
    sealedAt: r.sealedAt,
    proofCode: r.proofCode,
  }));
}
