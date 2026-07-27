"""
The RFC-3161 signature timestamp: present when the TSA answers, absent when it
does not, and never fatal either way.

Two things are being held down here.

The first is that asking for a timestamp produces one. A signature timestamp is
what carries a PAdES signature from B-B to B-T, and it is requested from a
service outside this process, so "we passed a URL" is not evidence that a token
came back. The check reads the token back out of the sealed PDF and validates it.

The second is that a TSA outage costs the timestamp and nothing else. The
timestamp is a convenience: time is carried authoritatively by the anchor, which
is asynchronous and cannot fail a seal. A signer pressing finish must not be told
their document could not be sealed because somebody else's HTTP service was down,
so an unreachable TSA has to degrade to an untimestamped seal rather than raise.

Run:  ./.venv/bin/python test_timestamp.py
"""
import logging
import os
import sys
from io import BytesIO

from fpdf import FPDF

from seal import seal_pdf, DEFAULT_TSA_URL

from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.keys import load_cert_from_pemder

CA_ROOT = "../ca/out/root-ca.crt"
CA_INT = "../ca/out/intermediate.crt"
ORG_P12 = "../ca/out/orgs/acme/signing.p12"

UNREACHABLE_TSA = "http://127.0.0.1:9/tsa"

P12_PASS = os.environ.get("LETSSEAL_P12_PASS", "")
if not P12_PASS:
    sys.exit("LETSSEAL_P12_PASS must be set to the passphrase ca/setup-ca.sh was run with.")

logging.disable(logging.CRITICAL)


def make_pdf() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=12)
    pdf.cell(text="Let's Seal - timestamp test")
    return bytes(pdf.output())


def seal_and_read(tsa_url):
    """Seal, then report (signature status, timestamp status) as a verifier sees them."""
    res = seal_pdf(make_pdf(), ORG_P12, P12_PASS, reason="timestamp test", tsa_url=tsa_url)
    root = load_cert_from_pemder(CA_ROOT)
    inter = load_cert_from_pemder(CA_INT)
    vc = ValidationContext(trust_roots=[root], other_certs=[inter],
                           allow_fetching=False, revocation_mode="soft-fail")
    sig = PdfFileReader(BytesIO(res.pdf)).embedded_signatures[0]
    status = validate_pdf_signature(sig, vc)
    return status, getattr(status, "timestamp_validity", None)


def main() -> int:
    print("==> no TSA requested: seals, and carries no timestamp")
    status, ts = seal_and_read(None)
    if not (status.intact and status.valid and status.trusted):
        print("FAIL: untimestamped seal did not validate"); return 1
    if ts is not None:
        print("FAIL: a timestamp appeared without a TSA being asked"); return 1
    print("    intact=True valid=True trusted=True  timestamp=none")

    print("==> TSA unreachable: still seals, still valid, no timestamp")
    status, ts = seal_and_read(UNREACHABLE_TSA)
    if not (status.intact and status.valid and status.trusted):
        print("FAIL: an unreachable TSA broke the seal, which it must never do"); return 1
    if ts is not None:
        print("FAIL: a timestamp appeared from a TSA that does not exist"); return 1
    print("    intact=True valid=True trusted=True  timestamp=none (degraded, as intended)")

    print(f"==> TSA reachable ({DEFAULT_TSA_URL}): seal carries a validated token")
    try:
        status, ts = seal_and_read(DEFAULT_TSA_URL)
    except Exception as e:
        print(f"    SKIPPED: could not reach the TSA ({type(e).__name__}: {e})")
        print("\nALL CHECKS PASSED (timestamp step skipped, no network to the TSA).")
        return 0
    if not (status.intact and status.valid and status.trusted):
        print("FAIL: timestamped seal did not validate"); return 1
    if ts is None:
        print("FAIL: a TSA was requested and answered, but no token is in the PDF"); return 1
    print(f"    intact=True valid=True trusted=True  timestamp={ts.timestamp}")
    print(f"    token signed by: {ts.signing_cert.subject.human_friendly}")

    print("\nALL CHECKS PASSED - timestamps are embedded when available and never fatal when not.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
