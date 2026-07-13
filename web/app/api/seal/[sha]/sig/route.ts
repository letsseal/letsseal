import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const sha256 = sha.toLowerCase();
  const rec = await db.sealedDocument.findUnique({
    where: { sha256 },
    select: { detachedSig: true, sealType: true },
  });
  if (!rec || rec.sealType !== "detached" || !rec.detachedSig) {
    return new Response("not found", { status: 404 });
  }
  return new Response(new Uint8Array(Buffer.from(rec.detachedSig, "base64")), {
    headers: {
      "Content-Type": "application/pkcs7-signature",
      "Content-Disposition": `attachment; filename="${sha.slice(0, 16)}.sig"`,
      "Cache-Control": "no-store",
    },
  });
}
