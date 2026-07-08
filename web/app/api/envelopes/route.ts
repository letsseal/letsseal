import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { appendAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const orgSlug = String(form.get("orgSlug") ?? "");
  const title = String(form.get("title") ?? "Untitled");
  const file = form.get("file");

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "unknown org" }, { status: 404 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let pageCount = 1;
  try {
    const doc = await PDFDocument.load(bytes);
    pageCount = doc.getPageCount();
  } catch {
    return NextResponse.json({ error: "not a valid PDF" }, { status: 400 });
  }

  const envelope = await db.envelope.create({
    data: { orgId: org.id, title, status: "draft", pdfPath: "" },
  });
  const key = `envelopes/${envelope.id}/working.pdf`;
  await saveFile(key, bytes);
  await db.envelope.update({ where: { id: envelope.id }, data: { pdfPath: key } });
  await appendAudit(envelope.id, "system", "created", { details: `${pageCount}p` });

  return NextResponse.json({ id: envelope.id, pageCount });
}
