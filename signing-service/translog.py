"""
translog.py — signs Signed Tree Heads (STHs) for the Let's Seal transparency log.

The web app owns the append-only log (the LogEntry table) and computes the Merkle
root; this module — which lives with the keys — signs `(tree_size, root_hash,
timestamp)` with a dedicated **log key** so the root is authenticated, not merely
asserted. The log cert chains to the same published root as every other seal, so a
verifier needs nothing new to check an STH.

Canonical STH bytes (what the ECDSA signature covers), newline-delimited and
stable so any implementation can reconstruct them:

    letsseal.sth.v1\\n<tree_size>\\n<root_hash_hex>\\n<timestamp_ms>\\n
"""
from __future__ import annotations

import base64
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, pkcs12
from cryptography.x509.oid import NameOID

_HEX64 = re.compile(r"[0-9a-f]{64}")


def sth_bytes(tree_size: int, root_hex: str, ts_ms: int) -> bytes:
    return f"letsseal.sth.v1\n{tree_size}\n{root_hex}\n{ts_ms}\n".encode("ascii")


def _cn(cert) -> str:
    try:
        return cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        return cert.subject.rfc4514_string()


def log_cert(p12_path: str, p12_password: str) -> dict:
    """The public log cert + chain (no key material) — published so anyone can
    verify STH signatures. Static; the web app caches it."""
    with open(p12_path, "rb") as f:
        _key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if cert is None:
        raise ValueError(f"Could not load log cert from {p12_path}")
    return {
        "cert_pem": cert.public_bytes(Encoding.PEM).decode("ascii"),
        "chain_pem": b"".join(c.public_bytes(Encoding.PEM) for c in (extras or [])).decode("ascii"),
        "cert_cn": _cn(cert),
    }


def sign_sth(tree_size: int, root_hex: str, ts_ms: int, p12_path: str, p12_password: str) -> dict:
    """Sign a Signed Tree Head. Returns {signature (b64 DER ECDSA), cert_pem,
    chain_pem, cert_cn, ts}."""
    root_hex = root_hex.strip().lower()
    if not _HEX64.fullmatch(root_hex):
        raise ValueError("root_hash must be 64 hex chars (SHA-256)")
    if tree_size < 0:
        raise ValueError("tree_size must be >= 0")

    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"Could not load log signing cert from {p12_path}")
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("STH signing requires an EC (P-256) key")

    sig = key.sign(sth_bytes(tree_size, root_hex, ts_ms), ec.ECDSA(hashes.SHA256()))
    chain = [c for c in (extras or [])]
    return {
        "signature": base64.b64encode(sig).decode(),
        "cert_pem": cert.public_bytes(Encoding.PEM).decode("ascii"),
        "chain_pem": b"".join(c.public_bytes(Encoding.PEM) for c in chain).decode("ascii"),
        "cert_cn": _cn(cert),
        "ts": ts_ms,
    }
