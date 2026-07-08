import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPdf, upgradeAnchor } from "@/lib/signing";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const crypto = await verifyPdf(bytes);

  let registry: null | {
    org: string; title: string; completedAt: string | null; auditEvents: number;
  } = null;
  let anchor: null | { state: string; btcBlock: number | null } = null;
  let otsUrl: string | null = null;

  if (crypto.sha256) {
    const rec = await db.sealedDocument.findUnique({
      where: { sha256: crypto.sha256 },
      include: { envelope: { include: { org: true, _count: { select: { audit: true } } } } },
    });
    if (rec) {
      registry = {
        org: rec.envelope.org.name,
        title: rec.envelope.title,
        completedAt: rec.envelope.completedAt?.toISOString() ?? null,
        auditEvents: rec.envelope._count.audit,
      };
      anchor = { state: rec.anchorState, btcBlock: rec.btcBlock };
      if (rec.otsProof) otsUrl = `/api/file/${rec.envelopeId}?variant=ots`;
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
