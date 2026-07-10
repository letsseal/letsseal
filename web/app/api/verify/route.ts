import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPdf, upgradeAnchor } from "@/lib/signing";
import { overContentLength, tooLarge } from "@/lib/limits";

export async function POST(req: NextRequest) {
  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const crypto = await verifyPdf(bytes);

  let registry: null | {
    org: string | null; title: string | null; completedAt: string | null; auditEvents: number;
  } = null;
  let anchor: null | { state: string; btcBlock: number | null } = null;
  let otsUrl: string | null = null;

  if (crypto.sha256) {
    const rec = await db.sealedDocument.findUnique({
      where: { sha256: crypto.sha256 },
      include: { org: true, envelope: { include: { org: true, _count: { select: { audit: true } } } } },
    });
    if (rec) {
      registry = {
        org: rec.org?.name ?? rec.envelope?.org.name ?? null,
        title: rec.title ?? rec.envelope?.title ?? null,
        completedAt: (rec.envelope?.completedAt ?? rec.sealedAt).toISOString(),
        auditEvents: rec.envelope?._count.audit ?? 0,
      };
      anchor = { state: rec.anchorState, btcBlock: rec.btcBlock };
      if (rec.otsProof) otsUrl = rec.envelopeId ? `/api/file/${rec.envelopeId}?variant=ots` : `/api/anchor/${rec.sha256}`;
      // If still pending, opportunistically ask the calendars whether the
      // Bitcoin tx has confirmed, and persist an upgrade.
      if (rec.anchorState === "pending" && rec.otsProof) {
        try {
          const up = await upgradeAnchor(rec.otsProof);
          if (up.status.state === "confirmed") {
            await db.sealedDocument.update({
              where: { id: rec.id },
              data: { anchorState: "confirmed", btcBlock: up.status.bitcoin_block ?? null, otsProof: up.ots_b64 },
            });
            anchor = { state: "confirmed", btcBlock: up.status.bitcoin_block ?? null };
          }
        } catch { /* still pending / offline — keep prior state */ }
      }
    }
  }

  return NextResponse.json({ ...crypto, onRecord: !!registry, registry, anchor, otsUrl });
}
