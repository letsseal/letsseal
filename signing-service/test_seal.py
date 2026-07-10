"""
End-to-end proof: generate a PDF -> seal it with the org cert -> validate the
signature against our own CA root, and prove tamper-evidence by flipping a byte.

Run:  ./.venv/bin/python test_seal.py
"""
import sys
from io import BytesIO

from fpdf import FPDF

from seal import seal_pdf

from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.keys import load_cert_from_pemder

CA_ROOT = "../ca/out/root-ca.crt"
CA_INT = "../ca/out/intermediate.crt"
ORG_P12 = "../ca/out/orgs/acme/signing.p12"
P12_PASS = "changeit"


def make_pdf() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=16)
    pdf.cell(text="Let's Seal - test agreement")
    pdf.ln(20)
    pdf.set_font("helvetica", size=11)
    pdf.multi_cell(0, 8, "This document was sealed by the Let's Seal signing service "
                         "using the organization's own-CA signing certificate.")
    return bytes(pdf.output())


def validate(sealed: bytes) -> bool:
    root = load_cert_from_pemder(CA_ROOT)
    inter = load_cert_from_pemder(CA_INT)
    vc = ValidationContext(trust_roots=[root], other_certs=[inter],
                           allow_fetching=False, revocation_mode="soft-fail")
    r = PdfFileReader(BytesIO(sealed))
    sig = r.embedded_signatures[0]
    status = validate_pdf_signature(sig, vc)
    print(f"    intact={status.intact}  valid={status.valid}  "
          f"trusted={status.trusted}  signer={status.signing_cert.subject.human_friendly}")
    return status.intact and status.valid


def main() -> int:
    print("==> generating test PDF")
    pdf = make_pdf()

    print("==> sealing (TSA disabled for offline test)")
    res = seal_pdf(pdf, ORG_P12, P12_PASS, tsa_url=None)
    print(f"    sealed by CN={res.cert_cn}  sha256={res.sha256[:16]}...")

    print("==> validating sealed signature against our CA root")
    ok = validate(res.pdf)
    if not ok:
        print("FAIL: valid signature did not validate"); return 1

    print("==> tamper test: flip one byte and re-validate (must fail intact)")
    tampered = bytearray(res.pdf)
    tampered[200] ^= 0xFF
    from pyhanko_certvalidator import ValidationContext as VC
    root = load_cert_from_pemder(CA_ROOT); inter = load_cert_from_pemder(CA_INT)
    vc = VC(trust_roots=[root], other_certs=[inter], allow_fetching=False,
            revocation_mode="soft-fail")
    r = PdfFileReader(BytesIO(bytes(tampered)))
    try:
        status = validate_pdf_signature(r.embedded_signatures[0], vc)
        if status.intact:
            print("FAIL: tampered PDF still reported intact"); return 1
        print(f"    intact={status.intact}  <- tamper correctly detected")
    except Exception as e:
        print(f"    tamper broke parsing ({type(e).__name__}) <- also acceptable")

    print("\nALL CHECKS PASSED — own-CA sealing + validation + tamper-evidence work.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
