import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDORED = join(WEB_ROOT, "public", "pdf.worker.min.mjs");
const PACKAGED = join(WEB_ROOT, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

test("the vendored pdf.js worker is byte-identical to the installed one", (t) => {
  if (!existsSync(PACKAGED)) {
    t.skip("pdfjs-dist is not installed");
    return;
  }
  assert.ok(existsSync(VENDORED), "public/pdf.worker.min.mjs is missing; the PDF viewer cannot load without it");
  assert.equal(
    sha(VENDORED),
    sha(PACKAGED),
    "public/pdf.worker.min.mjs does not match the installed pdfjs-dist. " +
      "pdf.js refuses to run a worker from a different version, so PDF rendering would break in the browser " +
      "while typecheck and build both pass. Re-copy it: " +
      "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs",
  );
});
