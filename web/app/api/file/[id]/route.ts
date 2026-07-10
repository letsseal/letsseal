import { NextRequest } from "next/server";
import { readFile, fileExists } from "@/lib/storage";
import { db } from "@/lib/db";
import { apiUser, userOwnsEnvelope } from "@/lib/auth-helpers";

const isId = (s: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(s);

async function mayRead(req: NextRequest, envelopeId: string): Promise<boolean> {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const signer = await db.signer.findFirst({
      where: { token, envelopeId }, select: { id: true },
    });
    if (signer) return true;
  }
  const userId = await apiUser();
  if (userId && (await userOwnsEnvelope(userId, envelopeId))) return true;
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return new Response("bad request", { status: 400 });
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

  // Document bytes (working draft or sealed final) require authorisation.
  if (!(await mayRead(req, id))) return new Response("not found", { status: 404 });

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
