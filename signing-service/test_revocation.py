"""
End-to-end proof that a withdrawn certificate stops being trusted.

Org certificates are issued for five years and the verifier runs with revocation
checking off, because a self-anchored CA publishes no CRL or OCSP responder. A CA
therefore needs its own way to retract a certificate: without one, a leaked
signing key or an org suspended for impersonation would go on producing seals
that verify as trusted for the rest of that five years.

The distinction being asserted matters as much as the revocation itself:

  valid   stays TRUE after revocation. That signature really was made by that
          key over those bytes, and saying otherwise would be a lie.
  trusted goes FALSE. We no longer vouch for the key that made it.

Run:  LETSSEAL_P12_PASS=<pass> LETSSEAL_CA_DIR=../ca/out ./.venv/bin/python test_revocation.py
Needs a CA built with ca/setup-ca.sh and an `acme` org, exactly like test_seal.py.
"""
from __future__ import annotations

import os
import subprocess
import sys
from io import BytesIO

from fpdf import FPDF

from seal import seal_pdf
import revocation

from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.keys import load_cert_from_pemder

CA_DIR = os.environ.get("LETSSEAL_CA_DIR", "../ca/out")
ORG_CRT = os.path.join(CA_DIR, "orgs", "acme", "signing.crt")
ORG_P12 = os.path.join(CA_DIR, "orgs", "acme", "signing.p12")
CA_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ca", "setup-ca.sh")

P12_PASS = os.environ.get("LETSSEAL_P12_PASS", "")
if not P12_PASS:
    sys.exit("LETSSEAL_P12_PASS must be set to the passphrase ca/setup-ca.sh was run with.")


def make_pdf() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=14)
    pdf.cell(text="Let's Seal - revocation test")
    return bytes(pdf.output())


def verdict(sealed_pdf: bytes) -> tuple[bool, bool, dict | None]:
    """(valid, trusted, revocation-entry) for a sealed PDF, applying the same
    rule the service applies in _verify_bytes."""
    reader = PdfFileReader(BytesIO(sealed_pdf))
    status = validate_pdf_signature(
        reader.embedded_signatures[0],
        ValidationContext(
            trust_roots=[load_cert_from_pemder(os.path.join(CA_DIR, "root-ca.crt"))],
            other_certs=[load_cert_from_pemder(os.path.join(CA_DIR, "intermediate.crt"))],
            allow_fetching=False,
            revocation_mode="soft-fail",
        ),
    )
    revoked = revocation.check_chain([status.signing_cert])
    return bool(status.valid), bool(status.trusted) and revoked is None, revoked


def ca(*args: str) -> None:
    subprocess.run(["bash", CA_SCRIPT, *args], check=True, capture_output=True,
                   text=True, env={**os.environ})


def main() -> None:
    print("==> sealing a document with the acme certificate")
    sealed = seal_pdf(make_pdf(), ORG_P12, P12_PASS, reason="revocation test", tsa_url=None)

    valid, trusted, entry = verdict(sealed.pdf)
    print(f"    before revocation: valid={valid} trusted={trusted} revoked={entry}")
    assert valid, "a fresh seal must be cryptographically valid"
    assert trusted, "a fresh seal from our own CA must be trusted"
    assert entry is None

    print("==> revoking that certificate for key compromise")
    ca("revoke", ORG_CRT, "key_compromise", "revocation test")
    try:
        valid, trusted, entry = verdict(sealed.pdf)
        print(f"    after  revocation: valid={valid} trusted={trusted} reason={entry and entry['reason']}")
        assert valid, "revocation must not change whether the signature verifies"
        assert not trusted, "REGRESSION: a revoked certificate must not be trusted"
        assert entry and entry["reason"] == "key_compromise"

        print("==> confirming the list is re-read live, with no restart")
        assert revocation.status(entry["serial"]) is not None
    finally:
        ca("unrevoke", ORG_CRT)

    valid, trusted, entry = verdict(sealed.pdf)
    print(f"    after  un-revoke:  valid={valid} trusted={trusted} revoked={entry}")
    assert trusted and entry is None, "un-revoking must restore trust"

    print("\nALL CHECKS PASSED - a withdrawn certificate stops being trusted, live.")


if __name__ == "__main__":
    main()
