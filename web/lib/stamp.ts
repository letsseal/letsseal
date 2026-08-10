import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/signing";
import { formatProofCode } from "@/lib/proofcode";

export type StampMode =
  | "badge" 
  | "line"  
  | "none"; 

const BADGE_WORDS = new Set(["badge", "qr", "true", "1", "yes", "on"]);
const LINE_WORDS = new Set(["line", "footer", "text", "discreet"]);
const NONE_WORDS = new Set(["none", "false", "0", "no", "off"]);

export function parseStampMode(value: unknown, fallback: StampMode): StampMode {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === "") return fallback;
  if (BADGE_WORDS.has(v)) return "badge";
  if (LINE_WORDS.has(v)) return "line";
  if (NONE_WORDS.has(v)) return "none";
  return fallback;
}

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
    const label = "letsseal.org";
    const lw = font.widthOfTextAtSize(label, cap);
    page.drawText(label, { x: qrX + (QR - lw) / 2, y: margin - cap - 1, size: cap, font, color: grey });
  }

  return Buffer.from(await doc.save());
}

export async function stampVerifyLine(
  pdfBytes: Buffer,
  opts: { proofUrl: string; proofCode?: string | null },
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  if (!page) return pdfBytes;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const host = (() => { try { return new URL(opts.proofUrl).host; } catch { return "letsseal.org"; } })();
  const where = opts.proofCode ? `${host}/v/${formatProofCode(opts.proofCode)}` : host;
  const line = `This document is cryptographically sealed. Verify it at ${where}`;

  const size = 6;
  const { width } = page.getSize();
  const lw = font.widthOfTextAtSize(line, size);
  page.drawText(line, {
    x: Math.max(10, (width - lw) / 2),
    y: 12,
    size, font, color: rgb(0.42, 0.42, 0.45),
  });

  return Buffer.from(await doc.save());
}

export async function stampVerifyMark(
  pdfBytes: Buffer,
  opts: { mode: StampMode; proofUrl: string; orgName: string; proofCode?: string | null },
): Promise<Buffer> {
  try {
    if (opts.mode === "badge") return await stampVerifyBadge(pdfBytes, opts);
    if (opts.mode === "line") return await stampVerifyLine(pdfBytes, opts);
    return pdfBytes;
  } catch {
    return pdfBytes;
  }
}
