import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/signing";

export async function stampVerifyBadge(
  pdfBytes: Buffer,
  opts: { proofUrl: string; orgName: string },
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[0];
  if (!page) return pdfBytes;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const qr = await doc.embedPng(await qrPng(opts.proofUrl));
  const grey = rgb(0.42, 0.42, 0.45);

  const QR = 42, margin = 10, cap = 5;
  const { width } = page.getSize();
  const qrX = width - margin - QR;
  page.drawImage(qr, { x: qrX, y: margin, width: QR, height: QR });

  const label = "letsseal.org";
  const lw = font.widthOfTextAtSize(label, cap);
  page.drawText(label, { x: qrX + (QR - lw) / 2, y: margin - cap - 1, size: cap, font, color: grey });

  return Buffer.from(await doc.save());
}
