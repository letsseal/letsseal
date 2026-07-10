import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { qrPng } from "@/lib/signing";

export type CertFields = {
  recipientName: string;
  credType: string;
  title: string;
  description?: string | null;
  credentialCode?: string | null;
  issuedOn: Date;
  expiresOn?: Date | null;
};

function hexToRgb(hex: string | null | undefined, fallback: RGB): RGB {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function generateCertificatePdf(
  org: { name: string; brandColor?: string | null; logoUrl?: string | null },
  cert: CertFields,
  proofUrl: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([841.89, 595.28]); 
  const { width, height } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  const brand = hexToRgb(org.brandColor, rgb(0.102, 0.451, 0.910));
  const ink = rgb(0.09, 0.13, 0.2);
  const muted = rgb(0.42, 0.46, 0.53);

  const centre = (text: string, y: number, size: number, font: PDFFont, color: RGB) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  const inset = 26;
  const border = (i: number, w: number) =>
    page.drawRectangle({ x: i, y: i, width: width - 2 * i, height: height - 2 * i, borderColor: brand, borderWidth: w });
  border(inset, 2.5);
  border(inset + 6, 0.75);

  let topY = height - 96;
  const logo = await tryEmbedLogo(doc, org.logoUrl);
  if (logo) {
    const lw = 120, lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: (width - lw) / 2, y: height - 70 - lh, width: lw, height: Math.min(lh, 64) });
    topY = height - 70 - Math.min(lh, 64) - 24;
    centre(org.name.toUpperCase(), topY, 11, sans, muted);
    topY -= 34;
  } else {
    centre(org.name.toUpperCase(), topY, 13, serifBold, brand);
    topY -= 40;
  }

  centre(cert.credType.toUpperCase(), topY, 30, serifBold, ink);
  topY -= 30;
  page.drawLine({ start: { x: width / 2 - 60, y: topY }, end: { x: width / 2 + 60, y: topY }, thickness: 2, color: brand });

  centre("This is to certify that", topY - 44, 13, serif, muted);
  centre(cert.recipientName, topY - 86, 34, serifBold, ink);

  centre(cert.title, topY - 124, 16, serif, ink);
  if (cert.description) {
    wrapCentre(page, cert.description, topY - 150, 11.5, serif, muted, width - 260, 15, (t, y, s, f, c) => centre(t, y, s, f, c));
  }

  const metaY = 96;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const meta: string[] = [`Issued ${fmt(cert.issuedOn)}`];
  if (cert.expiresOn) meta.push(`Expires ${fmt(cert.expiresOn)}`);
  if (cert.credentialCode) meta.push(`Credential ID: ${cert.credentialCode}`);
  meta.forEach((line, i) => page.drawText(line, { x: inset + 34, y: metaY - i * 15, size: 9.5, font: sans, color: muted }));

  try {
    const qr = await doc.embedPng(await qrPng(proofUrl));
    const qs = 66;
    page.drawImage(qr, { x: width - inset - 34 - qs, y: metaY - 30, width: qs, height: qs });
    page.drawText("Scan to verify", { x: width - inset - 34 - qs, y: metaY - 42, size: 7.5, font: sans, color: muted });
  } catch { /* QR service down — certificate is still valid, just no inline QR */ }

  const verifyLine = "Verify authenticity at " + proofUrl.replace(/^https?:\/\//, "");
  centre(verifyLine, 44, 8.5, sans, muted);

  return Buffer.from(await doc.save());
}

async function tryEmbedLogo(doc: PDFDocument, logoUrl: string | null | undefined) {
  if (!logoUrl?.startsWith("data:image/")) return null;
  try {
    const b64 = logoUrl.split(",")[1];
    const bytes = Buffer.from(b64, "base64");
    return logoUrl.includes("image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

// Minimal greedy word-wrap, centred.
function wrapCentre(
  page: PDFPage, text: string, y: number, size: number, font: PDFFont, color: RGB, maxWidth: number, lineH: number,
  centre: (t: string, y: number, s: number, f: PDFFont, c: RGB) => void,
) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      centre(line, yy, size, font, color);
      yy -= lineH;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) centre(line, yy, size, font, color);
}
