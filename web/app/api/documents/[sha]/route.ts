import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth-helpers";
import { readFile, fileExists } from "@/lib/storage";

const isHash = (s: string) => /^[0-9a-f]{64}$/.test(s);

export async function GET(req: NextRequest, { params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  const ref = sha.toLowerCase();
  if (!isHash(ref)) return new Response("bad request", { status: 400 });

  const rec = await db.sealedDocument.findUnique({
    where: { sha256: ref },
    select: { pdfPath: true, title: true, orgId: true, envelope: { select: { orgId: true, title: true } } },
  });
  if (!rec) return new Response("not found", { status: 404 });

  const orgId = rec.orgId ?? rec.envelope?.orgId ?? null;
  const userId = await apiUser();
  const member = userId && orgId
    ? await db.membership.findFirst({ where: { userId, orgId }, select: { id: true } })
    : null;
  if (!member) return new Response("not found", { status: 404 });

  if (!rec.pdfPath || !(await fileExists(rec.pdfPath))) {
    return new Response("This document wasn't retained — only its proof is kept.", { status: 410 });
  }

  const buf = await readFile(rec.pdfPath);
  const name = (rec.title ?? rec.envelope?.title ?? "sealed-document").replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.sealed.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
