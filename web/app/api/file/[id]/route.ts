import { NextRequest } from "next/server";
import { readFile, fileExists } from "@/lib/storage";
import { db } from "@/lib/db";
import { apiUser, userOwnsEnvelope } from "@/lib/auth-helpers";
import { ctEqual } from "@/lib/ct";
import { clientIp } from "@/lib/ip";
import { attemptCountAsync, recordFailureAsync } from "@/lib/ratelimit";

const isId = (s: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(s);

const CODE_FAILS = 8;
const CODE_WINDOW = 15 * 60_000;

async function mayRead(req: NextRequest, envelopeId: string, variant: string | null): Promise<boolean> {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const signer = await db.signer.findFirst({
      where: { token, envelopeId }, select: { id: true, accessCode: true },
    });
    if (signer) {
      if (variant !== "sealed" && signer.accessCode) {
        const supplied = req.nextUrl.searchParams.get("code") ?? req.headers.get("x-access-code");
        const ip = clientIp(req);
        if ((await attemptCountAsync(`code:${token}`)) >= CODE_FAILS || (await attemptCountAsync(`code:ip:${ip}`)) >= CODE_FAILS * 5) return false;
        const ok = ctEqual(signer.accessCode, supplied);
        if (!ok && supplied != null) {
          await recordFailureAsync(`code:${token}`, CODE_WINDOW);
          await recordFailureAsync(`code:ip:${ip}`, CODE_WINDOW);
        }
        return ok;
      }
      return true;
    }
  }
  const userId = await apiUser();
  if (userId && (await userOwnsEnvelope(userId, envelopeId))) return true;
  return false;
}

// Streams an envelope's PDF (working copy or sealed) for pdf.js / download.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return new Response("bad request", { status: 400 });
  const variant = req.nextUrl.searchParams.get("variant");

  // OpenTimestamps proof download for independent Bitcoin verification. This is
  // public by design — it's a bare timestamp, not the document contents.
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
  if (!(await mayRead(req, id, variant))) return new Response("not found", { status: 404 });

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
