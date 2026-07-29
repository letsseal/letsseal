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


def leaf(name: str, cn: str, issuer_key: Path, issuer_crt: Path) -> Path:
    """Issue a document-profile leaf and bundle it as a PKCS#12 the sealer loads."""
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
    chain.write_bytes(issuer_crt.read_bytes())
    openssl("pkcs12", "-export", "-out", str(p12), "-inkey", str(key), "-in", str(crt),
            "-certfile", str(chain), "-passout", f"pass:{P12_PASS}")
    return p12


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
         teaches: str, catches: str) -> None:
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
    VECTORS.append({
        "id": vid,
        "files": sorted(files),
        "subject": subject,
        "sha256": hashlib.sha256(files[subject]).hexdigest(),
        "require": require,
        "observed": observed,
        "teaches": teaches,
        "catches": catches,
    })


def main() -> int:
    for stale in HERE.glob("0*-*"):
        if stale.is_dir():
            shutil.rmtree(stale)
    KEYS.mkdir(exist_ok=True)
    (KEYS / ".gitignore").write_text("*\n")

    root_key, root_crt = self_signed_root("root", "SEAL Vectors Root CA")
    other_key, other_crt = self_signed_root("other-root", "Unrelated Root CA")
    signer = leaf("signer", "Vector Issuer Ltd", root_key, root_crt)
    outsider = leaf("outsider", "Outsider Ltd", other_key, other_crt)

    (HERE / "root.crt").write_bytes(root_crt.read_bytes())
    (HERE / "other-root.crt").write_bytes(other_crt.read_bytes())

    src = source_pdf("SEAL Conformance Vector",
                     "Conformance vector for the SEAL standard. This document exists to be "
                     "sealed, altered, and checked. See spec/vectors/README.md.")

    valid = seal_pdf(src, str(signer), P12_PASS, reason="SEAL conformance vector", tsa_url=None).pdf
    emit("001-pades-valid", {"document.pdf": valid},
         {"sealed": True, "intact": True, "valid": True, "trusted": True,
          "entire_file": True, "authentic": True},
         {"coverage": "ENTIRE_FILE", "reason": None},
         "The happy path: a PAdES seal that validates, chains to the pinned root and covers the whole file.",
         "A verifier that cannot reach a positive verdict at all.")

    emit("002-pades-altered", {"document.pdf": flip_a_content_byte(valid)},
         {"sealed": True, "intact": False, "authentic": False},
         {"valid": True, "trusted": False, "entire_file": True, "coverage": "ENTIRE_FILE",
          "reason": "altered"},
         "One byte of page content differs from what was signed.",
         "A verifier that reports the presence of a signature as authenticity without checking the digest.")

    outsider_sealed = seal_pdf(src, str(outsider), P12_PASS,
                               reason="SEAL conformance vector", tsa_url=None).pdf
    emit("003-pades-untrusted-root", {"document.pdf": outsider_sealed},
         {"sealed": True, "intact": True, "valid": True, "trusted": False,
          "entire_file": True, "authentic": False},
         {"coverage": "ENTIRE_FILE", "reason": "unrecognised issuer"},
         "A cryptographically valid signature from a certificate outside the pinned root.",
         "The forgery vector. An implementation reporting this as authentic accepts a seal from anybody, "
         "which is the single most dangerous defect a SEAL verifier can have.")

    emit("004-pades-incremental-update", {"document.pdf": append_incremental_update(valid)},
         {"sealed": True, "intact": True, "valid": True, "entire_file": False,
          "authentic": False},
         {"trusted": True, "coverage": "ENTIRE_REVISION",
          "reason": "coverage is not the entire file"},
         "Content appended after signing, so the signature covers an earlier revision only.",
         "A verifier that checks the signature but never checks coverage, and so calls a document "
         "authentic when text was added after it was signed.")

    payload = b"artifact bytes for the SEAL detached conformance vector\n"
    body, sig = detached_sig(payload, signer)
    emit("005-detached-valid", {"artifact.bin": body, "artifact.bin.sig": sig},
         {"sealed": True, "intact": True, "valid": True, "trusted": True,
          "authentic": True},
         {"entire_file": True, "coverage": "detached CMS", "reason": None},
         "A detached CAdES/CMS seal over a non-PDF artifact, checkable with stock openssl.",
         "A verifier that handles PDFs only, and so cannot check the form every other file type uses.")

    emit("006-detached-altered", {"artifact.bin": payload.replace(b"artifact", b"Artifact"), "artifact.bin.sig": sig},
         {"sealed": True, "intact": False, "authentic": False},
         {"valid": False, "trusted": False, "entire_file": False,
          "coverage": "detached CMS", "reason": "altered"},
         "The same detached signature paired with an artifact that has changed by one byte.",
         "A verifier that checks a signature is well formed without binding it to the bytes in hand.")

    manifest = {
        "standard": "SEAL",
        "specification": "https://letsseal.org/SPEC.md",
        "conformance": "https://github.com/letsseal/letsseal/blob/main/CONFORMANCE.md",
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
            "authentic": "intact AND valid AND trusted AND entire_file, per SPEC.md section 8",
            "reason": "for a negative verdict, what a verifier should tell a person",
        },
        "freeFields": ("A field absent from `require` is deliberately unconstrained. Implementations "
                       "differ reasonably on what to report once an earlier check has failed, and the "
                       "standard constrains the verdict rather than the bookkeeping behind it."),
        "vectors": VECTORS,
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"wrote {len(VECTORS)} vectors to {HERE}")
    for v in VECTORS:
        print(f"  {v['id']:34s} authentic={str(v['require']['authentic']):5s}  {v['sha256'][:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
