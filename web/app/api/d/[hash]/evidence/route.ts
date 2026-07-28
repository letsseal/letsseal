import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { canonicalProofQuery } from "@/lib/proofs";
import { buildEvidenceBundle } from "@/lib/evidence";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const ref = hash.toLowerCase();
  if (!isHash(ref)) return new Response("bad request", { status: 400 });

  const rec = await db.sealedDocument.findFirst({
    ...canonicalProofQuery(ref),
    select: { orgId: true, envelope: { select: { orgId: true } } },
  });
  if (!rec) return new Response("not found", { status: 404 });

  const orgId = rec.orgId ?? rec.envelope?.orgId ?? null;
  const userId = await apiUser();
  const member = userId && orgId
    ? await db.membership.findFirst({ where: { userId, orgId }, select: { id: true } })
    : null;
  if (!member) return new Response("not found", { status: 404 });

  const bundle = await buildEvidenceBundle(ref);
  if (!bundle) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(bundle.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
