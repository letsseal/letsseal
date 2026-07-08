import { NextRequest } from "next/server";
import { readFile, fileExists } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = req.nextUrl.searchParams.get("variant");

  if (variant === "ots") {
    const key = `envelopes/${id}/sealed.pdf.ots`;
    if (!(await fileExists(key))) return new Response("not found", { status: 404 });
    const buf = await readFile(key);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="sealed.pdf.ots"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const v = variant === "sealed" ? "sealed" : "working";
  const key = `envelopes/${id}/${v}.pdf`;
  if (!(await fileExists(key))) return new Response("not found", { status: 404 });
  const buf = await readFile(key);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${v}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
