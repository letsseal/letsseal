"""
detached.py — CAdES/CMS detached signatures for sealing ANY file.

PAdES (seal.py) embeds a signature *inside* a PDF. Most file formats have no such
slot, so for any other artifact we produce a *detached* signature that lives
beside the file: a CMS SignedData over the file's SHA-256, from an org's signing
certificate, chaining to the same published root. CAdES is the detached sibling
of PAdES — same AdES family, same X.509 — so the SEAL "seal" is one idea in two
delivery forms (embedded for PDFs, detached for everything else).

Digest-only: the client hashes locally and sends only the 32-byte digest, so the
file never leaves the caller (same privacy model as the OpenTimestamps anchor).

The result is a standard detached CMS/PKCS#7 signature with the signer's cert
chain embedded, so it is self-contained and verifies with stock tooling and no
Let's Seal server:

    openssl cms -verify -inform DER -in file.sig -content file -CAfile letsseal-root.crt

Together with `ots verify file.ots`, that is the whole independent verification of
a sealed non-PDF file: issuer (this) + time (the anchor).
"""
from __future__ import annotations

import base64
import os
import re
import subprocess
import tempfile

from pyhanko.sign import signers

_HEX64 = re.compile(r"[0-9a-f]{64}")


def sign_detached_digest(sha256_hex: str, p12_path: str, p12_password: str) -> str:
    """Detached CMS signature over a precomputed SHA-256; returns base64(DER).

    We sign the caller's digest, never the file bytes. The signer cert and its
    chain are embedded in the CMS, so the proof stands alone.
    """
    sha256_hex = sha256_hex.strip().lower()
    if not _HEX64.fullmatch(sha256_hex):
        raise ValueError("expected a 64-character SHA-256 hex digest")

    signer = signers.SimpleSigner.load_pkcs12(
        pfx_file=p12_path,
        passphrase=p12_password.encode("utf-8"),
    )
    if signer is None:
        raise ValueError(f"Could not load signing cert from {p12_path}")

    content_info = signer.sign(bytes.fromhex(sha256_hex), "sha256", use_pades=False)
    return base64.b64encode(content_info.dump()).decode()


def _detached_signer(sig_der: bytes) -> str:
    """Best-effort signer name from the embedded leaf cert."""
    try:
        from asn1crypto import cms
        sd = cms.ContentInfo.load(sig_der)["content"]
        certs = [c.chosen for c in sd["certificates"]]

        def is_ca(c):
            bc = c.basic_constraints_value
            return bool(bc and bc["ca"].native)

        leaf = next((c for c in certs if not is_ca(c)), certs[0])
        return leaf.subject.human_friendly
    except Exception:
        return ""


def verify_detached_bytes(file_bytes: bytes, sig_der: bytes, ca_root_path: str,
                          timeout: int = 30) -> dict:
    """Verify a detached CAdES/CMS seal over `file_bytes` with stock openssl. Two
    checks: the signature alone (valid) and the chain to the pinned root (trusted).
    The signer's chain is embedded in the sig, so the root file is enough."""
    with tempfile.TemporaryDirectory() as d:
        fp = os.path.join(d, "content")
        sp = os.path.join(d, "sig.der")
        with open(fp, "wb") as f:
            f.write(file_bytes)
        with open(sp, "wb") as f:
            f.write(sig_der)

        def _openssl(*extra):
            r = subprocess.run(
                ["openssl", "cms", "-verify", "-inform", "DER", "-in", sp,
                 "-content", fp, "-no_check_time", "-out", os.devnull, *extra],
                capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode == 0 and "verification successful" in (r.stdout + r.stderr).lower()

        valid = _openssl("-noverify")
        trusted = _openssl("-CAfile", ca_root_path)

    return {"sealed": True, "detached": True, "valid": bool(valid), "trusted": bool(trusted),
            "entire_file": bool(valid), "signer": _detached_signer(sig_der)}
