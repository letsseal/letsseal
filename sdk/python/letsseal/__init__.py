"""letsseal — the hand-crafted Python client for the Let's Seal signing service:
PAdES sealing, verification, and free Bitcoin anchoring.

Zero-dependency (standard library only). Let's Seal composes open standards
(PAdES/X.509 + OpenTimestamps); it does not invent the anchoring, and trust is
*self-anchored* — a proof is verified via the chain + the public portal + the
blockchain, not via OS/Adobe trust stores.

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
    CertResult,
    AnchorResult,
    AnchorStatus,
    sha256_hex,
)

__all__ = [
    "LetsSeal",
    "LetsSealError",
    "SealResult",
    "CertResult",
    "AnchorResult",
    "AnchorStatus",
    "sha256_hex",
]
__version__ = "0.1.0"
