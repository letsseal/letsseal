import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const sha256 = sha.toLowerCase();
  const anchor = await db.anchor.findUnique({ where: { sha256 } });
  const ots = anchor?.otsProof
    ?? (await db.sealedDocument.findFirst({ where: { sha256 }, orderBy: [{ sealedAt: "asc" }, { id: "asc" }], select: { otsProof: true } }))?.otsProof;
  if (!ots) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(ots, "base64")), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sha.slice(0, 16)}.ots"`,
      "Cache-Control": "no-store",
    },
  });
}
