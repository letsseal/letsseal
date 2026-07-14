import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readFile, fileExists } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const sha256 = sha.toLowerCase();
  const rec = await db.sealedDocument.findUnique({
    where: { sha256 },
    select: { pdfPath: true, sealType: true },
  });
  if (!rec || rec.sealType !== "smime" || !rec.pdfPath) return new Response("not found", { status: 404 });
  if (!(await fileExists(rec.pdfPath))) {
    return new Response("This message wasn't retained — only its proof is kept.", { status: 410 });
  }
  const buf = await readFile(rec.pdfPath);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `inline; filename="${sha.slice(0, 16)}.signed.eml"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
