import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readFile, fileExists } from "@/lib/storage";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  tiff: "image/tiff", tif: "image/tiff", gif: "image/gif", avif: "image/avif",
  heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime",
  mp3: "audio/mpeg", flac: "audio/flac", m4a: "audio/mp4",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const sha256 = sha.toLowerCase();
  const rec = await db.sealedDocument.findUnique({
    where: { sha256 },
    select: { pdfPath: true, sealType: true },
  });
  if (!rec || rec.sealType !== "c2pa" || !rec.pdfPath) return new Response("not found", { status: 404 });
  if (!(await fileExists(rec.pdfPath))) {
    return new Response("This image wasn't retained — only its proof is kept.", { status: 410 });
  }
  const ext = rec.pdfPath.split(".").pop()?.toLowerCase() ?? "";
  const buf = await readFile(rec.pdfPath);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="sealed.${ext}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
