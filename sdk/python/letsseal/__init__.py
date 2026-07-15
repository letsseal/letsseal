"""letsseal — the hand-crafted Python client for the Let's Seal signing service.

Seal anything — PDFs (PAdES), images and media (C2PA), XML (XML-DSig), email
(S/MIME), any file (detached CMS), and software artifacts (cosign blobs,
SBOM/SLSA attestations) — verify, and anchor on Bitcoin for free.

Zero-dependency (standard library only). Trust is self-anchored: a proof verifies
against the published root, the public transparency log, and the Bitcoin ledger —
everything a verifier needs travels with the proof. ``trusted=True`` means it
chains to *this* root.

    from letsseal import LetsSeal
    ls = LetsSeal("http://127.0.0.1:8081")
    res = ls.seal("contract.pdf", org="acme")
    open("contract.sealed.pdf", "wb").write(res.pdf)
    print(ls.verify(res.pdf))
"""
from .client import (
    LetsSeal,
    LetsSealError,
    SealResult,
    SealedFile,
    CertResult,
    AnchorResult,
    AnchorStatus,
    sha256_hex,
)

__all__ = [
    "LetsSeal",
    "LetsSealError",
    "SealResult",
    "SealedFile",
    "CertResult",
    "AnchorResult",
    "AnchorStatus",
    "sha256_hex",
]
__version__ = "0.1.0"
