#!/usr/bin/env python3
"""
SEAL reference verifier — Sealed Evidence, Anchored to a Ledger.

Verifies a sealed file against the PUBLISHED Let's Seal root and its OpenTimestamps
anchor, with no Let's Seal server involved. Reference for the SEAL standard:
https://letsseal.org/standard

  seal    an AdES signature valid, chaining to the pinned root, covering the whole
          file. PDFs carry it embedded (PAdES); any other file uses a detached
          sidecar (CAdES/CMS, `file.sig`).   ->  integrity + issuer
  anchor  `ots verify` confirms the file's SHA-256 on the Bitcoin ledger  ->  time

Requires: pyhanko (pip install pyhanko); for detached (.sig) seals, `openssl`; for
the anchor, the `ots` client (pip install opentimestamps-client).

Usage:  python verify.py sealed.pdf [sealed.pdf.ots]
        python verify.py file file.sig [file.ots]
"""
import sys
import os
import hashlib
import subprocess
import tempfile
from io import BytesIO

from asn1crypto import pem, x509
from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader

ROOT_CA_PEM = b"""-----BEGIN CERTIFICATE-----
MIIB4zCCAYmgAwIBAgIUATVQI6DoAl9fR1Pz/qKcw8P6TKAwCgYIKoZIzj0EAwIw
PzEbMBkGA1UEAwwSTGV0J3MgU2VhbCBSb290IENBMRMwEQYDVQQKDApMZXQncyBT
ZWFsMQswCQYDVQQGEwJHQjAeFw0yNjA3MDgxNTU5MjVaFw00NjA3MDMxNTU5MjVa
MD8xGzAZBgNVBAMMEkxldCdzIFNlYWwgUm9vdCBDQTETMBEGA1UECgwKTGV0J3Mg
U2VhbDELMAkGA1UEBhMCR0IwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATFa+q0
LI7qV4N6b5T7Xuzcy4v6IengyFN8ZWAGsNrF1mHptXIMEUCXUEr1GQpD1FTrfgQO
6HVgXPT2IP2jTJqfo2MwYTAdBgNVHQ4EFgQUEWlQwM1fR/iBgTKigc39MweT+W0w
HwYDVR0jBBgwFoAUEWlQwM1fR/iBgTKigc39MweT+W0wDwYDVR0TAQH/BAUwAwEB
/zAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwIDSAAwRQIhAN5l2xxn8QypEGK1
VZyHj7fpLRM+79zXT/ujRuUnKkq3AiB+mGJMM3EeeTS0tAhBkskqqv7wnAP9sUqv
KRxDgmn9IQ==
-----END CERTIFICATE-----"""

INTERMEDIATE_CA_PEM = b"""-----BEGIN CERTIFICATE-----
MIIB7jCCAZSgAwIBAgIUfNkJ39i0FgJYfTluWJ9r1yJ+6BowCgYIKoZIzj0EAwIw
PzEbMBkGA1UEAwwSTGV0J3MgU2VhbCBSb290IENBMRMwEQYDVQQKDApMZXQncyBT
ZWFsMQswCQYDVQQGEwJHQjAeFw0yNjA3MDgxNTU5MjVaFw0zNjA3MDUxNTU5MjVa
MEcxIzAhBgNVBAMMGkxldCdzIFNlYWwgSW50ZXJtZWRpYXRlIENBMRMwEQYDVQQK
DApMZXQncyBTZWFsMQswCQYDVQQGEwJHQjBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABHMYligVeveOEhi1rXr+n4vDxAJLOMWT+iH8SlBM63y1caVXfvzCvxCA2zLw
0aH7eQXOfcVVUcTaFZyxGSZR3J+jZjBkMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTZL6q5xRz/dBEcDQsvgu/9f+e6LzAfBgNV
HSMEGDAWgBQRaVDAzV9H+IGBMqKBzf0zB5P5bTAKBggqhkjOPQQDAgNIADBFAiEA
wfdmYl60OuFSjJvINcH72KQkKyEOgqVnLpikKJDghH4CIEpS0JP1usQFv4LUta54
wwkVfGqYbg43R+TscPWhSW80
-----END CERTIFICATE-----"""


def _load(pem_bytes):
    _, _, der = pem.unarmor(pem_bytes)
    return x509.Certificate.load(der)


def verify_seal(pdf_bytes):
    reader = PdfFileReader(BytesIO(pdf_bytes))
    sigs = reader.embedded_signatures
    if not sigs:
        return {"sealed": False}
    vc = ValidationContext(
        trust_roots=[_load(ROOT_CA_PEM)],
        other_certs=[_load(INTERMEDIATE_CA_PEM)],
        allow_fetching=False,
        revocation_mode="soft-fail",
    )
    status = validate_pdf_signature(sigs[0], vc)
    coverage = getattr(status.coverage, "name", str(status.coverage))
    return {
        "sealed": True,
        "valid": bool(status.valid),
        "trusted": bool(status.trusted),
        "entire_file": coverage == "ENTIRE_FILE",
        "coverage": coverage,
        "signer": status.signing_cert.subject.human_friendly,
    }


def _detached_signer(sig_path):
    """Best-effort signer name from a detached CMS (the embedded leaf cert)."""
    try:
        from asn1crypto import cms
        sd = cms.ContentInfo.load(open(sig_path, "rb").read())["content"]
        certs = [c.chosen for c in sd["certificates"]]

        def is_ca(c):
            bc = c.basic_constraints_value
            return bool(bc and bc["ca"].native)

        leaf = next((c for c in certs if not is_ca(c)), certs[0])
        return leaf.subject.human_friendly
    except Exception:
        return ""


def verify_detached(file_path, sig_path, timeout=30):
    """Verify a detached CAdES/CMS seal (file.sig) over `file_path` against the
    published root, with stock openssl. The signer's chain is embedded in the
    sig, so pinning the root is enough. Two checks mirror the PAdES path: the
    signature alone (valid) and the chain to the root (trusted)."""
    with tempfile.NamedTemporaryFile("wb", suffix=".pem", delete=False) as rf:
        rf.write(ROOT_CA_PEM)
        root = rf.name

    def _openssl(*extra):
        try:
            r = subprocess.run(
                ["openssl", "cms", "-verify", "-inform", "DER", "-in", sig_path,
                 "-content", file_path, "-no_check_time", "-binary", "-out", os.devnull, *extra],
                capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode == 0 and "verification successful" in (r.stdout + r.stderr).lower()
        except Exception:
            return None

    try:
        valid = _openssl("-noverify")
        trusted = _openssl("-CAfile", root)
    finally:
        os.unlink(root)

    if valid is None or trusted is None:
        return {"sealed": True, "detached": True, "valid": False, "trusted": False,
                "entire_file": False, "signer": "(openssl unavailable)"}
    return {"sealed": True, "detached": True, "valid": bool(valid), "trusted": bool(trusted),
            "entire_file": bool(valid), "signer": _detached_signer(sig_path)}


def verify_anchor(pdf_path, ots_path):
    try:
        r = subprocess.run(
            ["ots", "verify", "-f", pdf_path, ots_path],
            capture_output=True, text=True, timeout=90,
        )
        out = (r.stdout + r.stderr).lower()
        if "success" in out or "bitcoin block" in out:
            return "confirmed"
        if "pending" in out or "not been confirmed" in out or "incomplete" in out:
            return "pending"
        return "unknown"
    except FileNotFoundError:
        return "no-ots-client"
    except Exception:
        return "error"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    args = sys.argv[1:]
    file_path = args[0]
    sig_path = next((a for a in args[1:] if a.endswith(".sig")), None)
    ots_path = next((a for a in args[1:] if a.endswith(".ots")), None)
    file_bytes = open(file_path, "rb").read()
    is_pdf = file_bytes[:5] == b"%PDF-"
    if sig_path is None and not is_pdf and os.path.exists(file_path + ".sig"):
        sig_path = file_path + ".sig"
    if ots_path is None and os.path.exists(file_path + ".ots"):
        ots_path = file_path + ".ots"

    print(f"file     {file_path}")
    print(f"sha256   {hashlib.sha256(file_bytes).hexdigest()}")

    if is_pdf:
        s = verify_seal(file_bytes)
        if not s["sealed"]:
            print("\nRESULT   NOT A SEAL — no signature found.")
            sys.exit(1)
        kind = s["coverage"]
    elif sig_path:
        s = verify_detached(file_path, sig_path)
        kind = "detached CMS"
    else:
        print("\nRESULT   NOT A SEAL — no PAdES signature and no .sig sidecar.")
        sys.exit(1)

    authentic = s["valid"] and s["trusted"] and s["entire_file"]
    print(f"issuer   {s['signer']}")
    print(f"seal     valid={s['valid']}  trusted={s['trusted']}  entire_file={s['entire_file']}  ({kind})")

    if ots_path and os.path.exists(ots_path):
        anchor = verify_anchor(file_path, ots_path)
        print(f"anchor   {anchor}")
    else:
        anchor = None
        print(f"anchor   no .ots supplied")

    print()
    if authentic:
        tail = " Anchored to Bitcoin." if anchor == "confirmed" else ""
        print(f"RESULT   AUTHENTIC — sealed by Let's Seal and unaltered.{tail}")
        sys.exit(0)
    if s["valid"] and not s["trusted"]:
        print("RESULT   UNRECOGNISED — valid signature, but it does not chain to the Let's Seal root. Not authentic.")
        sys.exit(1)
    print("RESULT   ALTERED — the seal does not verify over the whole file.")
    sys.exit(1)


if __name__ == "__main__":
    main()
