import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeBundle, type SealRecord, type EvidenceInput } from "../lib/evidence-bundle.ts";

const SHA = "a".repeat(64);
const SEALED_AT = new Date("2026-07-28T10:20:30Z");

function record(over: Partial<SealRecord> = {}): SealRecord {
  return {
    sha256: SHA, certCN: "Acme Property Ltd", sealType: "pades", sealedAt: SEALED_AT,
    title: "Lease agreement", detachedSig: null, proofCode: "ABC123",
    otsProof: null, anchorState: "none", anchorProvider: "bitcoin", btcBlock: null,
    oidcProvider: null, oidcIssuer: null,
    orgName: "Acme Property Ltd", verifiedDomain: null, envelope: null,
    ...over,
  };
}

function input(over: Partial<EvidenceInput> = {}): EvidenceInput {
  return { rec: record(), pdfBytes: null, log: null, auditEvents: null, revocations: null, ...over };
}

function extract(zip: Uint8Array): Map<string, string> {
  const dir = mkdtempSync(join(tmpdir(), "letsseal-evidence-"));
  try {
    const path = join(dir, "bundle.zip");
    writeFileSync(path, zip);
    const listed = execFileSync("unzip", ["-Z", "-1", path], { encoding: "utf8" });
    execFileSync("unzip", ["-q", "-o", path, "-d", join(dir, "out")]);
    const files = new Map<string, string>();
    for (const name of listed.split("\n").map((s) => s.trim()).filter(Boolean)) {
      files.set(name, readFileSync(join(dir, "out", name), "utf8"));
    }
    return files;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const summaryOf = (files: Map<string, string>) => JSON.parse(files.get("evidence.json")!);
const claimFor = (files: Map<string, string>, needle: string) =>
  summaryOf(files).claims.find((c: { claim: string }) => c.claim.includes(needle));

test("the bundle always carries a guide, a summary and the pinned root", () => {
  const files = extract(composeBundle(input()).zip);
  for (const name of ["README.md", "VERIFY.md", "evidence.json", "letsseal-root.crt"]) {
    assert.ok(files.has(name), `${name} is missing`);
  }
  assert.match(files.get("letsseal-root.crt")!, /BEGIN CERTIFICATE/);
});

test("a retained PDF is included and claimed", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); 
  const files = extract(composeBundle(input({ pdfBytes })).zip);
  assert.ok(files.has("document.sealed.pdf"));
  assert.equal(claimFor(files, "sealed document").state, "included");
});

test("a document whose bytes are not retained says so, and claims no file", () => {
  const files = extract(composeBundle(input()).zip);
  assert.equal(files.has("document.sealed.pdf"), false);
  const claim = claimFor(files, "sealed document");
  assert.equal(claim.state, "held by the parties");
  assert.equal(claim.evidence, null);
});

test("a detached seal ships its signature rather than a document", () => {
  const rec = record({ sealType: "detached", detachedSig: Buffer.from("cms").toString("base64") });
  const files = extract(composeBundle(input({ rec })).zip);
  assert.ok(files.has("signature.sig"));
  assert.equal(files.has("document.sealed.pdf"), false);
});

test("a confirmed anchor names its block and ships the proof beside the document", () => {
  const rec = record({ otsProof: Buffer.from("ots").toString("base64"), anchorState: "confirmed", btcBlock: 912345 });
  const files = extract(composeBundle(input({ rec, pdfBytes: new Uint8Array([1]) })).zip);
  assert.ok(files.has("document.sealed.pdf.ots"));
  assert.match(claimFor(files, "public ledger").state, /confirmed in block 912345/);
});

test("a pending anchor is reported as pending, never as established", () => {
  const rec = record({ otsProof: Buffer.from("ots").toString("base64"), anchorState: "pending" });
  const files = extract(composeBundle(input({ rec })).zip);
  const claim = claimFor(files, "public ledger");
  assert.equal(claim.state, "pending");
  assert.doesNotMatch(claim.state, /confirmed/);
  assert.match(claim.detail, /settling/);
});

test("with no anchor at all, no ledger claim is made and the guide skips that step", () => {
  const files = extract(composeBundle(input()).zip);
  assert.equal(claimFor(files, "public ledger"), undefined);
  assert.doesNotMatch(files.get("VERIFY.md")!, /ots verify/);
});

test("an anchored bundle tells the reader how to verify it independently", () => {
  const rec = record({ otsProof: Buffer.from("ots").toString("base64"), anchorState: "confirmed" });
  const files = extract(composeBundle(input({ rec, pdfBytes: new Uint8Array([1]) })).zip);
  assert.match(files.get("VERIFY.md")!, /ots verify document\.sealed\.pdf\.ots/);
});

test("a log proof that was fetched is included and located in the tree", () => {
  const log = { proof: { index: 3, treeSize: 9, leafHash: "ab", rootHash: "cd", proof: [] }, sth: { treeSize: 9 } };
  const files = extract(composeBundle(input({ log })).zip);
  assert.ok(files.has("transparency-log/inclusion-proof.json"));
  assert.ok(files.has("transparency-log/signed-tree-head.json"));
  assert.match(claimFor(files, "transparency log").state, /index 3 of 9/);
});

test("a log proof that could not be fetched is stated as such, with where to get it", () => {
  const files = extract(composeBundle(input()).zip);
  assert.equal(files.has("transparency-log/inclusion-proof.json"), false);
  const claim = claimFor(files, "transparency log");
  assert.equal(claim.state, "not fetched when this bundle was built");
  assert.equal(claim.evidence, null);
  assert.match(claim.detail, /api\/log\/proof\?sha256=/);
});

test("the signing trail is included for a document that went through signature", () => {
  const rec = record({ envelope: { title: "Lease", sequential: true, signers: [{ name: "A" }] } });
  const auditEvents = [{ seq: 1, action: "created" }, { seq: 2, action: "signed" }];
  const files = extract(composeBundle(input({ rec, auditEvents })).zip);
  assert.ok(files.has("audit-trail.json"));
  assert.equal(claimFor(files, "order of events").state, "2 events");
  assert.match(files.get("audit-trail.json")!, /"sequential": true/);
});

test("a document sealed without a signing flow carries no trail and claims none", () => {
  const files = extract(composeBundle(input()).zip);
  assert.equal(files.has("audit-trail.json"), false);
  assert.equal(claimFor(files, "order of events"), undefined);
});

test("a revocation snapshot that could not be fetched points at the live list", () => {
  const files = extract(composeBundle(input()).zip);
  assert.equal(files.has("revocations.json"), false);
  const claim = claimFor(files, "unrevoked");
  assert.equal(claim.evidence, null);
  assert.match(claim.detail, /revocations\.json/);
});

test("a verified domain is reported as demonstrated; its absence as self-asserted", () => {
  const verified = summaryOf(extract(composeBundle(input({ rec: record({ verifiedDomain: "acme.example" }) })).zip));
  assert.equal(verified.issuer.verifiedDomain, "acme.example");
  assert.match(verified.issuer.identityBasis, /demonstrated to the CA/);

  const plain = summaryOf(extract(composeBundle(input()).zip));
  assert.equal(plain.issuer.verifiedDomain, null);
  assert.match(plain.issuer.identityBasis, /self-asserted/);
});

test("the summary carries the digest, the seal time and where the standard lives", () => {
  const s = summaryOf(extract(composeBundle(input()).zip));
  assert.equal(s.document.sha256, SHA);
  assert.equal(s.document.sealedAt, SEALED_AT.toISOString());
  assert.match(s.standard, /SPEC\.md$/);
  assert.match(s.certificatePolicy, /CPS\.md$/);
});

test("the README lists every claim the summary makes", () => {
  const rec = record({ otsProof: Buffer.from("o").toString("base64"), anchorState: "confirmed", btcBlock: 900001 });
  const files = extract(composeBundle(input({ rec, pdfBytes: new Uint8Array([1]) })).zip);
  const readme = files.get("README.md")!;
  for (const claim of summaryOf(files).claims) {
    assert.ok(readme.includes(claim.claim), `README omits the claim "${claim.claim}"`);
  }
});

test("the filename identifies the document it evidences", () => {
  assert.equal(composeBundle(input()).filename, `letsseal-evidence-${SHA.slice(0, 12)}.zip`);
});

test("exporting the same seal twice produces identical archives", () => {
  const first = composeBundle(input({ pdfBytes: new Uint8Array([1, 2, 3]) })).zip;
  const second = composeBundle(input({ pdfBytes: new Uint8Array([1, 2, 3]) })).zip;
  assert.deepEqual(first, second);
});
