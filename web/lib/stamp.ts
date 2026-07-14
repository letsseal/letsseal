import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/signing";
import { formatProofCode } from "@/lib/proofcode";

export async function stampVerifyBadge(
  pdfBytes: Buffer,
  opts: { proofUrl: string; orgName: string; proofCode?: string | null },
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[0];
  if (!page) return pdfBytes;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const qr = await doc.embedPng(await qrPng(opts.proofUrl));
  const grey = rgb(0.42, 0.42, 0.45);

  const QR = 40, margin = 10, cap = 5;
  const { width } = page.getSize();
  const qrX = width - margin - QR;
  page.drawImage(qr, { x: qrX, y: margin, width: QR, height: QR });

  if (opts.proofCode) {
    const host = (() => { try { return new URL(opts.proofUrl).host; } catch { return "letsseal.org"; } })();
    const line = `${host}/v/${formatProofCode(opts.proofCode)}`;
    const size = 6;
    const lw = font.widthOfTextAtSize(line, size);
    const gap = 6;
    page.drawText(line, {
      x: qrX - gap - lw,
      y: margin + (QR - size) / 2,
      size, font, color: grey,
    });
  } else {
    // No code (e.g. a bare anchor) — keep the tiny caption under the QR.
    const label = "letsseal.org";
    const lw = font.widthOfTextAtSize(label, cap);
    page.drawText(label, { x: qrX + (QR - lw) / 2, y: margin - cap - 1, size: cap, font, color: grey });
  }

  return Buffer.from(await doc.save());
}
