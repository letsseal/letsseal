import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { qrPng } from "@/lib/signing";

function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

export async function stampVerifyBadge(
  pdfBytes: Buffer,
  opts: { proofUrl: string; orgName: string },
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[0];
  if (!page) return pdfBytes;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qr = await doc.embedPng(await qrPng(opts.proofUrl));

  const wax = rgb(0.102, 0.451, 0.910);   
  const grey = rgb(0.42, 0.42, 0.45);
  const border = rgb(0.86, 0.87, 0.9);

  const s1 = 7, s2 = 6;
  const CAP_MAX = 148;
  const line1 = fitText(`Sealed by ${opts.orgName}`, bold, s1, CAP_MAX);
  const line2 = "Scan to verify · letsseal.org";
  const capW = Math.max(bold.widthOfTextAtSize(line1, s1), font.widthOfTextAtSize(line2, s2));

  const QR = 46, pad = 8, gap = 8, dotCol = 12, margin = 22;
  const boxW = pad + dotCol + capW + gap + QR + pad;
  const boxH = pad + QR + pad;
  const { width } = page.getSize();
  const boxX = Math.max(margin, width - margin - boxW);
  const boxY = margin;

  // Faint white card so the mark reads as a deliberate stamp, not stray ink.
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, color: rgb(1, 1, 1), borderColor: border, borderWidth: 0.75, opacity: 0.96 });

  // Left-aligned caption with an inline seal dot, then the QR on the right.
  const textX = boxX + pad + dotCol;
  const midY = boxY + boxH / 2;
  page.drawCircle({ x: boxX + pad + 4, y: midY + 3, size: 2.5, color: wax });
  page.drawText(line1, { x: textX, y: midY + 1.5, size: s1, font: bold, color: wax });
  page.drawText(line2, { x: textX, y: midY - 8.5, size: s2, font, color: grey });
  page.drawImage(qr, { x: textX + capW + gap, y: boxY + pad, width: QR, height: QR });

  return Buffer.from(await doc.save());
}
