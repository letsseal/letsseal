import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseStampMode, stampVerifyLine, stampVerifyMark } from "../lib/stamp.ts";

const PROOF_URL = "https://letsseal.org/v/ABCD1234EFGH5678";
const CODE = "ABCD1234EFGH5678";

async function makePdf(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`page ${i + 1}`, { x: 50, y: 800, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

test("the older boolean spelling still means what it meant", () => {
  assert.equal(parseStampMode("true", "none"), "badge");
  assert.equal(parseStampMode("1", "none"), "badge");
  assert.equal(parseStampMode("yes", "none"), "badge");
  assert.equal(parseStampMode("false", "badge"), "none");
  assert.equal(parseStampMode("0", "badge"), "none");
  assert.equal(parseStampMode("no", "badge"), "none");
});

test("the three modes are addressable by name, whatever the casing", () => {
  assert.equal(parseStampMode("badge", "none"), "badge");
  assert.equal(parseStampMode("LINE", "none"), "line");
  assert.equal(parseStampMode(" None ", "badge"), "none");
  assert.equal(parseStampMode("footer", "none"), "line");
});

test("absent, empty and unrecognised values fall back to the caller's default", () => {
  assert.equal(parseStampMode(null, "badge"), "badge");
  assert.equal(parseStampMode(undefined, "none"), "none");
  assert.equal(parseStampMode("", "line"), "line");
  assert.equal(parseStampMode("sparkles", "none"), "none");
});

test("choosing nothing returns the document byte for byte", async () => {
  const pdf = await makePdf();
  const out = await stampVerifyMark(pdf, {
    mode: "none", proofUrl: PROOF_URL, orgName: "Acme", proofCode: CODE,
  });
  assert.deepEqual(out, pdf, "a document with no mark must be the document that went in");
});

test("the line lands on the last page and leaves the page count alone", async () => {
  const pdf = await makePdf(3);
  const out = await stampVerifyLine(pdf, { proofUrl: PROOF_URL, proofCode: CODE });
  assert.notDeepEqual(out, pdf);

  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 3, "stamping must not add or drop a page");
});

test("a one-page document takes the line on that page", async () => {
  const pdf = await makePdf(1);
  const out = await stampVerifyLine(pdf, { proofUrl: PROOF_URL, proofCode: CODE });
  assert.notDeepEqual(out, pdf);
  assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
});

test("the line still marks a document that has no short code", async () => {
  const pdf = await makePdf();
  const out = await stampVerifyLine(pdf, { proofUrl: PROOF_URL, proofCode: null });
  assert.notDeepEqual(out, pdf);
});

test("a document that cannot be marked comes back unchanged rather than throwing", async () => {
  const notAPdf = Buffer.from("this is not a pdf at all");
  const out = await stampVerifyMark(notAPdf, {
    mode: "line", proofUrl: PROOF_URL, orgName: "Acme", proofCode: CODE,
  });
  assert.deepEqual(out, notAPdf);
});

test("the mode chosen decides the path, and line differs from none", async () => {
  const pdf = await makePdf();
  const plain = await stampVerifyMark(pdf, { mode: "none", proofUrl: PROOF_URL, orgName: "Acme", proofCode: CODE });
  const lined = await stampVerifyMark(pdf, { mode: "line", proofUrl: PROOF_URL, orgName: "Acme", proofCode: CODE });
  assert.deepEqual(plain, pdf);
  assert.notDeepEqual(lined, pdf);
});
