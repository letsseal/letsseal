#!/usr/bin/env python3
"""
Generate the SEAL conformance vectors.

These exist so that somebody writing a second implementation can find out whether
they got it right. Without them an implementer has no feedback at all, so they
either do not start or ship something subtly wrong, and a standard with one
implementation is a file format rather than a standard.

Every vector is a real artifact produced by the same signing path the product
uses, paired with the exact verdict a conforming verifier reports for it. The
negative vectors matter more than the positive one: it is easy to write a
verifier that says AUTHENTIC for a well-formed signature, and the whole point of
SPEC.md section 8 is the cases where it must refuse.

The vectors are issued by a THROWAWAY CA generated here, never by the published
Let's Seal root. Two reasons. Publishing artifacts under the real root would ask
the world to trust a test fixture, and an implementer needs to pin a root they
can also point their own verifier at. Private keys stay in .keys/ and are
git-ignored; only certificates and sealed artifacts are published.

Run:  ../../signing-service/.venv/bin/python generate.py
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEYS = HERE / ".keys"
SIGNING = HERE.parent.parent / "signing-service"
sys.path.insert(0, str(SIGNING))

from fpdf import FPDF
from seal import seal_pdf
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils import generic

P12_PASS = "seal-conformance-vectors"

NOT_BEFORE = "20260101000000Z"
NOT_AFTER = "20360101000000Z"

LEAF_EXT = (
    "basicConstraints=critical,CA:FALSE\n"
    "keyUsage=critical,digitalSignature,nonRepudiation\n"
    "extendedKeyUsage=1.3.6.1.5.5.7.3.4\n"
)

SEALED_AT = "2026-03-01T00:00:00Z"
REVOKED_AT = "2026-06-01T00:00:00Z"
LATE_SEALED_AT = "2026-09-01T00:00:00Z"
LIST_UPDATED_AT = "2026-06-01T00:00:00Z"


def run(*args: str, stdin: bytes | None = None) -> bytes:
    return subprocess.run(args, check=True, capture_output=True, input=stdin).stdout


def openssl(*args: str, stdin: bytes | None = None) -> bytes:
    return run("openssl", *args, stdin=stdin)


def ec_key(path: Path) -> None:
    openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(path))


def self_signed_root(name: str, cn: str) -> tuple[Path, Path]:
    key, crt = KEYS / f"{name}.key", KEYS / f"{name}.crt"
    ec_key(key)
    openssl("req", "-x509", "-new", "-nodes", "-key", str(key), "-sha256",
            "-not_before", NOT_BEFORE, "-not_after", NOT_AFTER,
            "-out", str(crt), "-subj", f"/CN={cn}/O=SEAL Conformance Vectors/C=GB",
            "-addext", "basicConstraints=critical,CA:TRUE",
            "-addext", "keyUsage=critical,keyCertSign,cRLSign")
    return key, crt


def load_or_mint_root(name: str, cn: str) -> tuple[Path, Path]:
    """Reuse this group's CA if its key is still in `.keys/`, and mint one otherwise.

    Reusing it is the point. A group regenerated against the same CA keeps its trust
    anchor, so re-running the generator to correct one vector invalidates neither the
    others in the group nor the anchor an implementer pinned. A group's CA is therefore
    part of what the group is, and is loaded rather than overwritten on every run.
    """
    key, crt = KEYS / f"{name}.key", KEYS / f"{name}.crt"
    if key.exists() and crt.exists():
        return key, crt
    return self_signed_root(name, cn)


def intermediate(name: str, cn: str, issuer_key: Path, issuer_crt: Path) -> tuple[Path, Path]:
    """Issue a signing CA under the root, so a vector can revoke a certificate that
    issued another one and a verifier has a chain to match against (C-39)."""
    key, csr, crt = (KEYS / f"{name}.{ext}" for ext in ("key", "csr", "crt"))
    ec_key(key)
    openssl("req", "-new", "-key", str(key), "-out", str(csr),
            "-subj", f"/CN={cn}/O=SEAL Conformance Vectors/C=GB")
    ext_file = KEYS / f"{name}.ext"
    ext_file.write_text("basicConstraints=critical,CA:TRUE,pathlen:0\n"
                        "keyUsage=critical,keyCertSign,cRLSign\n")
    openssl("x509", "-req", "-in", str(csr), "-CA", str(issuer_crt), "-CAkey", str(issuer_key),
            "-set_serial", "0x" + os.urandom(15).hex(), "-sha256",
            "-not_before", NOT_BEFORE, "-not_after", NOT_AFTER,
            "-out", str(crt), "-extfile", str(ext_file))
    return key, crt


def leaf(name: str, cn: str, issuer_key: Path, issuer_crt: Path,
         chain_crts: list[Path] | None = None) -> Path:
    """Issue a document-profile leaf and bundle it as a PKCS#12 the sealer loads.

    `chain_crts` is what travels with the signature. It defaults to the issuer, which
    is the root for a directly-issued leaf; a leaf under an intermediate carries the
    intermediate, so a verifier can build the path and match revocation over all of it.
    """
    key, csr, crt, p12 = (KEYS / f"{name}.{ext}" for ext in ("key", "csr", "crt", "p12"))
    ec_key(key)
    openssl("req", "-new", "-key", str(key), "-out", str(csr),
            "-subj", f"/CN={cn}/O=SEAL Conformance Vectors/C=GB")
    ext_file = KEYS / f"{name}.ext"
    ext_file.write_text(LEAF_EXT)
    openssl("x509", "-req", "-in", str(csr), "-CA", str(issuer_crt), "-CAkey", str(issuer_key),
            "-set_serial", "0x" + os.urandom(15).hex(), "-sha256",
            "-not_before", NOT_BEFORE, "-not_after", NOT_AFTER,
            "-out", str(crt), "-extfile", str(ext_file))
    chain = KEYS / f"{name}.chain.pem"
    chain.write_bytes(b"".join(p.read_bytes() for p in (chain_crts or [issuer_crt])))
    openssl("pkcs12", "-export", "-out", str(p12), "-inkey", str(key), "-in", str(crt),
            "-certfile", str(chain), "-passout", f"pass:{P12_PASS}")
    return p12


def serial_of(crt: Path) -> str:
    """The certificate serial as lowercase hex, the form CPS §7.2 lists it in."""
    out = openssl("x509", "-in", str(crt), "-noout", "-serial").decode()
    return out.strip().split("=", 1)[1].lower()


def subject_of(crt: Path) -> str:
    out = openssl("x509", "-in", str(crt), "-noout", "-subject").decode()
    return out.strip().split("=", 1)[1].strip()


def revocation_list(entries: list[tuple[Path, str, str, str]]) -> bytes:
    """A published revocation list in the shape `ca/setup-ca.sh` writes and
    `signing-service/revocation.py` serves: serial in lowercase hex, subject, reason,
    UTC revocation time and a note, ordered by revocation time (C-39, CPS §7.2)."""
    revoked = [{
        "serial": serial_of(crt),
        "subject": subject_of(crt),
        "reason": reason,
        "revoked_at": revoked_at,
        "note": note,
    } for crt, reason, revoked_at, note in entries]
    revoked.sort(key=lambda e: e["revoked_at"])
    doc = {"version": 1, "updated_at": LIST_UPDATED_AT, "revoked": revoked}
    return (json.dumps(doc, indent=2) + "\n").encode()


def unix(ts: str) -> int:
    return int(datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())


def source_pdf(title: str, body: str) -> bytes:
    pdf = FPDF()
    pdf.set_compression(False)
    pdf.add_page()
    pdf.set_font("helvetica", size=16)
    pdf.cell(text=title)
    pdf.ln(14)
    pdf.set_font("helvetica", size=10)
    pdf.multi_cell(0, 6, body)
    return bytes(pdf.output())


def flip_a_content_byte(pdf: bytes) -> bytes:
    """Change one byte of page content, leaving the file structurally a PDF.

    The point of the vector is a document that still parses and still carries a
    signature, so a verifier has to actually check the digest rather than reject
    it as malformed and appear to pass by accident.
    """
    marker = b"Conformance vector for the SEAL standard"
    at = pdf.index(marker)
    out = bytearray(pdf)
    out[at] = ord("c")
    return bytes(out)


def append_incremental_update(pdf: bytes) -> bytes:
    """Add a genuine incremental update after signing, so the signature no longer
    covers the whole file. This is the case SPEC.md section 8 requires be reported
    as altered: the signature over the original revision still validates, and a
    verifier that stops there calls a modified document authentic."""
    w = IncrementalPdfFileWriter(BytesIO(pdf))
    w.root[generic.pdf_name("/SEALVectorAddition")] = generic.pdf_string(
        "content appended after the signature was applied")
    w.update_root()
    out = BytesIO()
    w.write(out)
    return out.getvalue()


def detached_sig(payload: bytes, p12: Path) -> tuple[bytes, bytes]:
    """A detached CAdES/CMS signature over a file, in the form stock openssl checks."""
    key = KEYS / (p12.stem + ".key")
    crt = KEYS / (p12.stem + ".crt")
    chain = KEYS / (p12.stem + ".chain.pem")
    sig = openssl("cms", "-sign", "-binary", "-outform", "DER", "-nodetach" if False else "-md", "sha256",
                  "-signer", str(crt), "-inkey", str(key), "-certfile", str(chain),
                  stdin=payload)
    return payload, sig


VECTORS: list[dict] = []


def emit(vid: str, files: dict[str, bytes], require: dict, observed: dict,
         teaches: str, catches: str, revocations: str | None = None,
         proven_time: str | None = None) -> None:
    """Record a vector.

    `require` is what a CONFORMING verifier must report, and nothing more. Fields
    outside it are left free on purpose: pyHanko declines to call an unintact
    signature trusted, while another implementation may reasonably report the chain
    as fine and the bytes as changed. Both are correct, and a suite that failed the
    second one would be testing an implementation rather than the standard.

    `observed` is what the reference verifier reports today. It is informational,
    and a harness that finds a difference there has found something worth reading
    rather than something broken.
    """
    d = HERE / vid
    d.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (d / name).write_bytes(data)
    subject = next(iter(files))
    entry = {
        "id": vid,
        "files": sorted(files),
        "subject": subject,
        "sha256": hashlib.sha256(files[subject]).hexdigest(),
    }
    if revocations is not None:
        entry["revocations"] = revocations
    if proven_time is not None:
        entry["provenTime"] = proven_time
        entry["provenTimeUnix"] = unix(proven_time)
    entry.update({
        "require": require,
        "observed": observed,
        "teaches": teaches,
        "catches": catches,
    })
    VECTORS.append(entry)


def seal_vectors(root_key: Path, root_crt: Path, signer: Path,
                 src: bytes, valid: bytes) -> None:
    """Vectors 001 to 007: the seal itself, SPEC.md sections 2 and 8."""
    other_key, other_crt = load_or_mint_root("other-root", "Unrelated Root CA")
    outsider = leaf("outsider", "Outsider Ltd", other_key, other_crt)
    (HERE / "other-root.crt").write_bytes(other_crt.read_bytes())

    emit("001-pades-valid", {"document.pdf": valid},
         {"sealed": True, "intact": True, "valid": True, "trusted": True,
          "entire_file": True, "authentic": True, "verdict": "authentic"},
         {"coverage": "ENTIRE_FILE", "reason": None},
         "The happy path: a PAdES seal that validates, chains to the pinned root and covers the whole file.",
         "A verifier that cannot reach a positive verdict at all.")

    emit("002-pades-altered", {"document.pdf": flip_a_content_byte(valid)},
         {"sealed": True, "intact": False, "authentic": False, "verdict": "altered"},
         {"valid": True, "trusted": False, "entire_file": True, "coverage": "ENTIRE_FILE",
          "reason": "altered"},
         "One byte of page content differs from what was signed.",
         "A verifier that reports the presence of a signature as authenticity without checking the digest.")

    outsider_sealed = seal_pdf(src, str(outsider), P12_PASS,
                               reason="SEAL conformance vector", tsa_url=None).pdf
    emit("003-pades-untrusted-root", {"document.pdf": outsider_sealed},
         {"sealed": True, "intact": True, "valid": True, "trusted": False,
          "entire_file": True, "authentic": False, "verdict": "unrecognised"},
         {"coverage": "ENTIRE_FILE", "reason": "unrecognised issuer"},
         "A cryptographically valid signature from a certificate outside the pinned root.",
         "The forgery vector. An implementation reporting this as authentic accepts a seal from anybody, "
         "which is the single most dangerous defect a SEAL verifier can have.")

    emit("004-pades-incremental-update", {"document.pdf": append_incremental_update(valid)},
         {"sealed": True, "intact": True, "valid": True, "entire_file": False,
          "authentic": False, "verdict": "altered"},
         {"trusted": True, "coverage": "ENTIRE_REVISION",
          "reason": "coverage is not the entire file"},
         "Content appended after signing, so the signature covers an earlier revision only.",
         "A verifier that checks the signature but never checks coverage, and so calls a document "
         "authentic when text was added after it was signed.")

    payload = b"artifact bytes for the SEAL detached conformance vector\n"
    body, sig = detached_sig(payload, signer)
    emit("005-detached-valid", {"artifact.bin": body, "artifact.bin.sig": sig},
         {"sealed": True, "intact": True, "valid": True, "trusted": True,
          "authentic": True, "verdict": "authentic"},
         {"entire_file": True, "coverage": "detached CMS", "reason": None},
         "A detached CAdES/CMS seal over a non-PDF artifact, checkable with stock openssl.",
         "A verifier that handles PDFs only, and so cannot check the form every other file type uses.")

    emit("006-detached-altered", {"artifact.bin": payload.replace(b"artifact", b"Artifact"), "artifact.bin.sig": sig},
         {"sealed": True, "intact": False, "authentic": False, "verdict": "altered"},
         {"valid": False, "trusted": False, "entire_file": False,
          "coverage": "detached CMS", "reason": "altered"},
         "The same detached signature paired with an artifact that has changed by one byte.",
         "A verifier that checks a signature is well formed without binding it to the bytes in hand.")

    emit("007-unsealed", {"document.pdf": src},
         {"sealed": False, "authentic": False, "verdict": "unsealed"},
         {"reason": "no signature present"},
         "A perfectly ordinary PDF that was never sealed.",
         "A verifier that reports an unsigned file as altered, or worse reaches for a "
         "verdict about a seal that does not exist.")


def revocation_vectors(root_key: Path, root_crt: Path, signer: Path,
                       src: bytes, valid: bytes) -> None:
    """Vectors 008 to 015: the revocation step, SPEC.md section 8.3 step 5.

    Every vector here but 013 carries the SAME sealed document as 001, and that is the
    lesson. The bytes are impeccable and the seal validates in all of them, and the
    verdict turns entirely on a list held somewhere else. A verifier that reads only the
    artifact cannot reach any of these answers.
    """
    sealed_facts = {"sealed": True, "intact": True, "valid": True, "trusted": True,
                    "entire_file": True}

    compromise = revocation_list([
        (KEYS / "signer.crt", "key_compromise", REVOKED_AT,
         "private key disclosed; reach is unconditional"),
    ])
    emit("008-revoked-key-compromise",
         {"document.pdf": valid, "revocations.json": compromise},
         {**sealed_facts, "revocation": "revoked", "verdict": "unrecognised",
          "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "key_compromise"},
         "A flawless seal whose signing certificate was later revoked for compromise. The "
         "seal is intact, valid, chains to the pinned root and covers the whole file, and "
         "the proven moment precedes the revocation, and it is still not authentic.",
         "A verifier that stops at the four seal facts and never consults the list, and so "
         "keeps honouring a certificate whose key is in somebody else's hands.",
         revocations="revocations.json", proven_time=SEALED_AT)

    retired = revocation_list([
        (KEYS / "signer.crt","superseded", REVOKED_AT,
         "rolled to a new key in good order"),
    ])
    emit("009-revoked-orderly-seal-earlier",
         {"document.pdf": valid, "revocations.json": retired},
         {**sealed_facts, "revocation": "checked-clear", "verdict": "authentic",
          "authentic": True},
         {"coverage": "ENTIRE_FILE", "reason": None},
         "The same certificate retired in good order, with the anchor proving the seal was "
         "made before the retirement. The seal stands.",
         "A verifier that treats every revocation as retroactive, which would destroy years "
         "of honest evidence each time an issuer rotated a key on schedule.",
         revocations="revocations.json", proven_time=SEALED_AT)

    emit("010-revoked-orderly-seal-later",
         {"document.pdf": valid, "revocations.json": retired},
         {**sealed_facts, "revocation": "revoked", "verdict": "unrecognised",
          "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "superseded"},
         "The same orderly retirement, and a proven moment AFTER the revocation date. The "
         "date rule leaves earlier seals standing and this one is not earlier.",
         "A verifier that reads the reason, sees an orderly retirement and clears the seal "
         "without comparing the dates, which would accept a seal made with a retired key.",
         revocations="revocations.json", proven_time=LATE_SEALED_AT)

    emit("011-revoked-orderly-no-proven-time",
         {"document.pdf": valid, "revocations.json": retired},
         {**sealed_facts, "revocation": "revoked", "verdict": "unrecognised",
          "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "superseded"},
         "The same orderly retirement with no proven moment at all. The claim that this seal "
         "predates the revocation is the whole defence, and here nothing supports it.",
         "A verifier that credits a seal with being early on the strength of an unproven "
         "date, which is exactly what an attacker with a retired key would ask it to do.",
         revocations="revocations.json")

    unknown = revocation_list([
        (KEYS / "signer.crt","gone_fishing", REVOKED_AT,
         "a reason code no verifier has seen before"),
    ])
    emit("012-revoked-unknown-reason",
         {"document.pdf": valid, "revocations.json": unknown},
         {**sealed_facts, "revocation": "revoked", "verdict": "unrecognised",
          "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "gone_fishing"},
         "A reason code outside the vocabulary, which is handled as a compromise: for a "
         "trust decision the safe direction is the strict one.",
         "A verifier that ignores what it does not recognise, which turns any future reason "
         "code into a way to keep a revoked certificate working.",
         revocations="revocations.json", proven_time=SEALED_AT)

    inter_key, inter_crt = intermediate("intermediate", "Vector Issuing CA", root_key, root_crt)
    under_inter = leaf("under-intermediate", "Downstream Issuer Ltd", inter_key, inter_crt,
                       chain_crts=[inter_crt])
    inter_sealed = seal_pdf(src, str(under_inter), P12_PASS,
                            reason="SEAL conformance vector", tsa_url=None).pdf
    inter_compromise = revocation_list([
        (inter_crt, "ca_compromise", REVOKED_AT, "issuing CA key compromised"),
    ])
    emit("013-revoked-intermediate",
         {"document.pdf": inter_sealed, "revocations.json": inter_compromise},
         {**sealed_facts, "revocation": "revoked", "verdict": "unrecognised",
          "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "ca_compromise"},
         "The signing certificate is not on the list. The intermediate that issued it is, so "
         "the match has to run over every certificate in the chain rather than the signer alone.",
         "A verifier that matches the leaf serial only, and so keeps trusting every "
         "certificate a compromised issuing CA ever signed.",
         revocations="revocations.json", proven_time=SEALED_AT)

    emit("014-revocation-unreachable",
         {"document.pdf": valid},
         {**sealed_facts, "revocation": "unchecked", "verdict": "authentic",
          "authentic": True},
         {"coverage": "ENTIRE_FILE", "reason": None},
         "The list could not be fetched. Offline verification stays conformant, and the "
         "verifier says which of the two it did: `authentic, revocation unchecked`.",
         "A verifier that reports a clear check it never performed, or one that fails the "
         "seal because a network call failed, which would make every proof depend on the "
         "issuer still being reachable.",
         revocations="https://revocations.invalid/revocations.json", proven_time=SEALED_AT)

    decoy_key, decoy_crt = load_or_mint_root("decoy", "Unrelated Revoked CA")
    clear = revocation_list([
        (decoy_crt, "key_compromise", REVOKED_AT,
         "an unrelated certificate, present so the list is not empty"),
    ])
    emit("015-revocation-clear",
         {"document.pdf": valid, "revocations.json": clear},
         {**sealed_facts, "revocation": "checked-clear", "verdict": "authentic",
          "authentic": True},
         {"coverage": "ENTIRE_FILE", "reason": None},
         "The list was read and reaches nothing in this chain. `checked-clear` is a different "
         "statement from `unchecked`, and a verifier that can only say one of them is missing "
         "the distinction the report exists to draw.",
         "A verifier that collapses `checked-clear` and `unchecked` into one word, leaving a "
         "reader unable to tell a completed check from a skipped one.",
         revocations="revocations.json", proven_time=SEALED_AT)


def write_manifest() -> None:
    """Write manifest.json: the contract a second implementation calibrates against."""
    manifest = {
        "standard": "SEAL",
        "specification": "https://letsseal.org/SPEC.md",
        "conformance": "https://github.com/letsseal/letsseal/blob/main/CONFORMANCE.md",
        "covers": ("SPEC.md sections 2 and 8, including section 8.3 step 5 and section 8.4; "
                   "CONFORMANCE C-1 to C-24, C-38 to C-43, C-61 to C-63 and C-68"),
        "pinnedRoot": "root.crt",
        "note": ("Every vector is issued by a throwaway CA generated with the suite, never by the "
                 "published Let's Seal root, so pinning root.crt commits a verifier to nothing "
                 "beyond these fixtures."),
        "howToRead": ("`require` is what a conforming verifier must report. `observed` is what the "
                      "reference verifier reports today and is informational: a difference there is "
                      "worth reading rather than a failure."),
        "verdictFields": {
            "sealed": "a signature is present",
            "valid": "the signature verifies over the bytes in hand",
            "trusted": "the signing certificate chains to the pinned root",
            "entire_file": "the signature covers the whole file",
            "intact": "the bytes are the bytes that were signed",
            "coverage": "the coverage as the verifier names it, where it reports one",
            "revocation": ("the revocation state, one of checked-clear, revoked or unchecked, "
                           "per SPEC.md section 8.3 step 5"),
            "verdict": ("the single verdict of SPEC.md section 8.4, one of unsealed, altered, "
                        "unrecognised or authentic, applied in that precedence"),
            "authentic": "the verdict is `authentic`: the four facts hold and no revocation reaches the seal",
            "reason": "for a negative verdict, what a verifier should tell a person",
        },
        "vectorInputs": {
            "revocations": ("the revocation list to consult for this vector. A filename is a list "
                            "shipped in the vector's own directory; a URL under the reserved "
                            "`.invalid` domain never resolves, and stands for a list out of reach. "
                            "A vector with no `revocations` gives the verifier no list at all."),
            "provenTime": ("the moment a confirmed anchor establishes for this artifact, and the "
                           "moment certificate validity is judged at (SPEC.md section 8.3 step 3). "
                           "A vector with no `provenTime` models a verifier holding no proven "
                           "moment, which is a different case from holding an early one."),
            "provenTimeUnix": "the same moment in unix seconds, for a harness that wants it that way",
        },
        "onProvenTime": (
            "The suite ships no anchor proof. A confirmed ledger attestation cannot be "
            "manufactured offline, and a fabricated one would undermine the only thing a "
            "conformance suite is for, so `provenTime` is handed to the verifier as an input "
            "instead. That is the one value here a verifier MUST NOT accept on trust in "
            "production: CONFORMANCE C-42 requires the moment be established by a confirmed "
            "anchor, precisely because the alternative is letting the party who holds a "
            "revoked key choose the date the check runs against. Vector 011 is that rule with "
            "the evidence removed, and it is refused."),
        "freeFields": ("A field absent from `require` is deliberately unconstrained. Implementations "
                       "differ reasonably on what to report once an earlier check has failed, and the "
                       "standard constrains the verdict rather than the bookkeeping behind it."),
        "vectors": VECTORS,
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> int:
    for stale in HERE.glob("0*-*"):
        if stale.is_dir():
            shutil.rmtree(stale)
    KEYS.mkdir(exist_ok=True)
    (KEYS / ".gitignore").write_text("*\n")

    root_key, root_crt = load_or_mint_root("root", "SEAL Vectors Root CA")
    signer = leaf("signer", "Vector Issuer Ltd", root_key, root_crt)
    (HERE / "root.crt").write_bytes(root_crt.read_bytes())

    src = source_pdf("SEAL Conformance Vector",
                     "Conformance vector for the SEAL standard. This document exists to be "
                     "sealed, altered, and checked. See spec/vectors/README.md.")
    valid = seal_pdf(src, str(signer), P12_PASS, reason="SEAL conformance vector",
                     tsa_url=None).pdf

    seal_vectors(root_key, root_crt, signer, src, valid)
    revocation_vectors(root_key, root_crt, signer, src, valid)
    write_manifest()

    print(f"wrote {len(VECTORS)} vectors to {HERE}")
    for v in VECTORS:
        verdict = v["require"].get("verdict", "?")
        print(f"  {v['id']:36s} {verdict:13s} {v['sha256'][:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
