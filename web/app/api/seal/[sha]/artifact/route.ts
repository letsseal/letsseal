import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readFile, fileExists } from "@/lib/storage";

const PARTS: Record<string, { file: string; type: string; name: string }> = {
  sig: { file: "artifact.sig", type: "text/plain; charset=utf-8", name: "sig" },
  pem: { file: "artifact.pem", type: "application/x-pem-file", name: "pem" },
  chain: { file: "artifact.chain.pem", type: "application/x-pem-file", name: "chain.pem" },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const sha256 = sha.toLowerCase();
  const part = PARTS[req.nextUrl.searchParams.get("part") ?? "sig"];
  if (!part) return new Response("unknown part (sig|pem|chain)", { status: 400 });

  const rec = await db.sealedDocument.findUnique({
    where: { sha256 },
    select: { sealType: true },
  });
  if (!rec || (rec.sealType !== "blob" && rec.sealType !== "identity")) {
    return new Response("not found", { status: 404 });
  }

  const path = `hosted/${sha256}/${part.file}`;
  if (!(await fileExists(path))) {
    return new Response("This proof's signature files weren't retained.", { status: 410 });
  }
  const buf = await readFile(path);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": part.type,
      "Content-Disposition": `attachment; filename="${sha.slice(0, 16)}.${part.name}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
