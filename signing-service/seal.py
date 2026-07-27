"""
seal.py — apply a cryptographic seal to a completed PDF using pyHanko.

This is the crown jewel: it embeds a PAdES (PDF Advanced Electronic Signature)
into the PDF using an organization's signing certificate, plus an RFC-3161
trusted timestamp. Change one byte of the resulting PDF afterwards and the
signature breaks — that is the authenticity guarantee.

The signing cert comes from ca/setup-ca.sh (your own CA). Swap the .p12 for a
paid AATL/eIDAS one later with zero code changes if you ever want Adobe's
automatic green check for external verifiers.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from io import BytesIO

from pyhanko.sign import signers, timestamps, fields
from pyhanko.sign.signers.pdf_signer import PdfSignatureMetadata, PdfSigner
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

logger = logging.getLogger(__name__)

DEFAULT_TSA_URL = "http://timestamp.digicert.com"


@dataclass
class SealResult:
    pdf: bytes
    sha256: str
    cert_cn: str
    field_name: str


def seal_pdf(
    pdf_bytes: bytes,
    p12_path: str,
    p12_password: str,
    *,
    reason: str = "Document execution",
    location: str = "Let's Seal",
    field_name: str = "letsseal-seal",
    tsa_url: str | None = DEFAULT_TSA_URL,
) -> SealResult:
    """Seal `pdf_bytes` with the org signing cert in `p12_path`."""
    signer = signers.SimpleSigner.load_pkcs12(
        pfx_file=p12_path,
        passphrase=p12_password.encode("utf-8"),
    )
    if signer is None:
        raise ValueError(f"Could not load signing cert from {p12_path}")

    cert_cn = _common_name(signer)

    def _sign(tsa: str | None) -> bytes:
        reader_writer = IncrementalPdfFileWriter(BytesIO(pdf_bytes))
        fields.append_signature_field(
            reader_writer,
            sig_field_spec=fields.SigFieldSpec(sig_field_name=field_name),
        )
        meta = PdfSignatureMetadata(
            field_name=field_name,
            reason=reason,
            location=location,
            subfilter=fields.SigSeedSubFilter.PADES,
            embed_validation_info=False,
            use_pades_lta=False,
        )
        pdf_signer = PdfSigner(
            meta, signer=signer,
            timestamper=timestamps.HTTPTimeStamper(url=tsa) if tsa else None,
        )
        out = BytesIO()
        pdf_signer.sign_pdf(reader_writer, output=out)
        return out.getvalue()

    if tsa_url:
        try:
            sealed = _sign(tsa_url)
        except Exception:
            logger.warning("TSA %s unavailable; sealing without a timestamp token",
                           tsa_url, exc_info=True)
            sealed = _sign(None)
    else:
        sealed = _sign(None)

    return SealResult(
        pdf=sealed,
        sha256=hashlib.sha256(sealed).hexdigest(),
        cert_cn=cert_cn,
        field_name=field_name,
    )


def _common_name(signer: signers.SimpleSigner) -> str:
    try:
        cn = signer.signing_cert.subject.native.get("common_name")
        return cn if isinstance(cn, str) and cn else "unknown"
    except Exception:
        return "unknown"
