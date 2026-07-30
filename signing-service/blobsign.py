"""
blobsign.py — cosign-compatible detached signatures for arbitrary artifacts.

The supply-chain delivery form of the SEAL: a raw ECDSA-P256-over-SHA256 signature
plus the signer's `codeSigning` leaf certificate (chaining to the published root),
in the shape the sigstore/cosign ecosystem already verifies — but produced entirely
on Let's Seal infrastructure, with no sigstore server involved.

This is the same idea as the detached CAdES seal (detached.py), in a second
encoding: detached.py emits a CMS/PKCS#7 container (great with `openssl cms`),
while this emits cosign's flat `signature (base64) + certificate (PEM)` pair, so a
build artifact / container blob / SBOM can be verified with the tool supply-chain
teams already run:

    cosign verify-blob \\
      --certificate artifact.pem \\
      --certificate-chain artifact.chain.pem \\
      --signature artifact.sig \\
      --certificate-identity-regexp '.*' \\
      --certificate-oidc-issuer-regexp '.*' \\
      --insecure-ignore-tlog --insecure-ignore-sct \\
      artifact

The two `--insecure-ignore-*` flags are cosign's way of saying "not sigstore's
public CT/Rekor logs" — correct here, because Let's Seal's transparency is its own
Merkle log + Bitcoin anchor, not sigstore's. Once the Merkle log ships we also emit
a cosign bundle + trusted-root so those flags fall away.

Digest-only: the caller may hash locally and send only the 32-byte SHA-256. cosign
hashes the blob and compares, and ECDSA over a prehashed digest is identical to
signing the blob directly, so the artifact itself never leaves the caller.
"""
from __future__ import annotations

import base64
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils as asym_utils
from cryptography.hazmat.primitives.serialization import Encoding, pkcs12
from cryptography.x509.oid import NameOID

_HEX64 = re.compile(r"[0-9a-f]{64}")


def _load(p12_path: str, p12_password: str):
    """Return (private_key, leaf_cert, [ca_chain]) from an org p12. The chain is the
    full CA path from the p12 (intermediate + root), ordered intermediate-first —
    so the emitted <file>.chain.pem is a complete trust chain and stock cosign
    verifies with just `--certificate-chain <file>.chain.pem` (no external root to
    concatenate). The root is public; shipping it is convenience, and our own
    verifier still pins the root from disk regardless of what the chain carries."""
    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"Could not load signing cert from {p12_path}")
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("blob signing requires an EC (P-256) signing key")
    extras = list(extras or [])
    inter = [c for c in extras if c.subject != c.issuer]
    roots = [c for c in extras if c.subject == c.issuer]
    chain = inter + roots
    return key, cert, chain


def _cn(cert) -> str:
    try:
        return cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        return cert.subject.rfc4514_string()


def _san_identity(cert) -> str:
    """The cert's SAN identity string (cosign's --certificate-identity) — URI or
    email — else ""."""
    from cryptography import x509
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        for typ in (x509.UniformResourceIdentifier, x509.RFC822Name):
            vals = san.get_values_for_type(typ)
            if vals:
                return vals[0]
    except Exception:
        pass
    return ""


def sign_blob_digest(sha256_hex: str, p12_path: str, p12_password: str) -> dict:
    """cosign-format detached signature over a precomputed SHA-256.

    Returns {sig_b64, cert_pem, chain_pem, cert_cn}. `sig_b64` is the base64 of the
    ASN.1/DER ECDSA signature (cosign's `--signature` form); `cert_pem` is the leaf
    (cosign's `--certificate`); `chain_pem` is intermediate(s)+root (cosign's
    `--certificate-chain`).
    """
    sha256_hex = sha256_hex.strip().lower()
    if not _HEX64.fullmatch(sha256_hex):
        raise ValueError("expected a 64-character SHA-256 hex digest")
    key, cert, chain = _load(p12_path, p12_password)

    digest = bytes.fromhex(sha256_hex)
    sig = key.sign(digest, ec.ECDSA(asym_utils.Prehashed(hashes.SHA256())))

    leaf_pem = cert.public_bytes(Encoding.PEM)
    chain_pem = b"".join(c.public_bytes(Encoding.PEM) for c in chain)
    return {
        "sig_b64": base64.b64encode(sig).decode(),
        "cert_pem": leaf_pem.decode("ascii"),
        "chain_pem": chain_pem.decode("ascii"),
        "cert_cn": _cn(cert),
        "identity": _san_identity(cert),
    }


def verify_blob_digest(sha256_hex: str, sig_b64: str, cert_pem: str, ca_root_path: str,
                       chain_pem: str = "") -> dict:
    """Verify a cosign-format blob signature: the ECDSA signature alone (valid) and
    the leaf's chain to the pinned root (trusted). `sha256_hex` is the artifact's
    SHA-256 (cosign hashes the blob; we verify against that digest)."""
    import datetime
    from cryptography import x509
    from cryptography.exceptions import InvalidSignature

    import revocation

    sha256_hex = sha256_hex.strip().lower()
    if not _HEX64.fullmatch(sha256_hex):
        raise ValueError("expected a 64-character SHA-256 hex digest")

    leaf = x509.load_pem_x509_certificate(cert_pem.encode())
    sig = base64.b64decode(sig_b64)
    digest = bytes.fromhex(sha256_hex)

    valid = False
    try:
        leaf.public_key().verify(sig, digest, ec.ECDSA(asym_utils.Prehashed(hashes.SHA256())))
        valid = True
    except (InvalidSignature, Exception):
        valid = False

    trusted = False
    signer = _cn(leaf)
    inter: list = []
    try:
        with open(ca_root_path, "rb") as f:
            root = x509.load_pem_x509_certificate(f.read())
        rest = chain_pem or ""
        for block in re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", rest, re.S):
            c = x509.load_pem_x509_certificate(block.encode())
            if c.subject != c.issuer:
                inter.append(c)
        now = datetime.datetime.now(datetime.timezone.utc)

        def issued_by(child, parent) -> bool:
            try:
                parent.public_key().verify(
                    child.signature, child.tbs_certificate_bytes,
                    ec.ECDSA(child.signature_hash_algorithm),
                )
                return child.issuer == parent.subject
            except Exception:
                return False

        def in_window(c) -> bool:
            return c.not_valid_before_utc <= now <= c.not_valid_after_utc

        chain_ok = in_window(leaf)
        current = leaf
        remaining = list(inter)
        while chain_ok and not issued_by(current, root):
            nxt = next((c for c in remaining if issued_by(current, c) and in_window(c)), None)
            if nxt is None:
                chain_ok = False
                break
            remaining.remove(nxt)
            current = nxt
        trusted = bool(valid and chain_ok and issued_by(current, root) and in_window(root))
    except Exception:
        trusted = False

    revoked = revocation.check_chain([leaf, *inter]) if trusted else None
    if revoked:
        trusted = False

    out = {"sealed": True, "blob": True, "valid": bool(valid), "trusted": bool(trusted),
           "entire_file": bool(valid), "signer": signer}
    if revoked:
        out["revoked"] = revoked
        out["reason"] = f"signing certificate revoked ({revoked['reason']})"
    return out
