#!/usr/bin/env python3
"""
SEAL reference verifier — Sealed Evidence, Anchored to a Ledger.

Verifies a sealed PDF against the PUBLISHED Let's Seal root and its OpenTimestamps
anchor, with no Let's Seal server involved. Reference for the SEAL standard:
https://letsseal.org/standard

  seal    the embedded PAdES signature is valid, chains to the pinned root, and
          covers the entire file            ->  integrity + issuer
  anchor  `ots verify` confirms the file's SHA-256 on the Bitcoin ledger  ->  time

Requires: pyhanko (pip install pyhanko); for the anchor, the `ots` client
(pip install opentimestamps-client).

Usage:  python verify.py sealed.pdf [sealed.pdf.ots]
"""
import sys
import os
import hashlib
import subprocess
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
    pdf_path = sys.argv[1]
    ots_path = sys.argv[2] if len(sys.argv) > 2 else pdf_path + ".ots"
    pdf_bytes = open(pdf_path, "rb").read()

    print(f"file     {pdf_path}")
    print(f"sha256   {hashlib.sha256(pdf_bytes).hexdigest()}")

    s = verify_seal(pdf_bytes)
    if not s["sealed"]:
        print("\nRESULT   NOT A SEAL — no signature found.")
        sys.exit(1)

    authentic = s["valid"] and s["trusted"] and s["entire_file"]
    print(f"issuer   {s['signer']}")
    print(f"seal     valid={s['valid']}  trusted={s['trusted']}  entire_file={s['entire_file']}  ({s['coverage']})")

    if os.path.exists(ots_path):
        anchor = verify_anchor(pdf_path, ots_path)
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
