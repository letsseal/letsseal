import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { canonicalizeProofCode } from "@/lib/proofcode";
import { rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export default async function ProofCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(`v:${ip}`, 60, 60_000)) notFound();

  const canon = canonicalizeProofCode(code);
  if (!canon) notFound();

  const [doc, anchor] = await Promise.all([
    db.sealedDocument.findUnique({ where: { proofCode: canon }, select: { sha256: true } }),
    db.anchor.findUnique({ where: { proofCode: canon }, select: { sha256: true } }),
  ]);

  const sha = doc?.sha256 ?? anchor?.sha256;
  if (!sha) notFound();
  redirect(`/d/${sha}`);
}
