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
import hashlib
import json
import os
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, pkcs12
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



def _load_log_key(p12_path: str, p12_password: str):
    with open(p12_path, "rb") as f:
        key, cert, _extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"Could not load log key from {p12_path}")
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("log key must be EC (P-256)")
    return key, cert


def log_key_id(p12_path: str, p12_password: str) -> dict:
    """The log's key ID = SHA-256 of its DER SPKI, as cosign derives it. Returned
    as base64 (bundle logId.keyId) and hex (SET logID / trusted_root)."""
    _key, cert = _load_log_key(p12_path, p12_password)
    spki = cert.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    kid = hashlib.sha256(spki).digest()
    return {"key_id_b64": base64.b64encode(kid).decode(), "key_id_hex": kid.hex(),
            "spki_b64": base64.b64encode(spki).decode()}


def sign_checkpoint(origin: str, tree_size: int, root_hex: str, p12_path: str, p12_password: str) -> dict:
    """Sign a Rekor-v1 checkpoint (transparency-dev signed note) over the tree head.
    `origin` line 0 is "<host> - <numeric treeID>" (the tree-ID suffix selects the
    v1 verification path in cosign). The signature-line name is the bare host, the
    key hint is SHA-256(SPKI)[:4], and the signature is DER-ECDSA over the note body."""
    root_hex = root_hex.strip().lower()
    if not _HEX64.fullmatch(root_hex):
        raise ValueError("root_hash must be 64 hex chars (SHA-256)")
    if tree_size < 0:
        raise ValueError("tree_size must be >= 0")
    key, cert = _load_log_key(p12_path, p12_password)
    spki = cert.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    hint = hashlib.sha256(spki).digest()[:4]
    host = origin.split(" - ")[0]
    root_b64 = base64.b64encode(bytes.fromhex(root_hex)).decode()
    body = f"{origin}\n{tree_size}\n{root_b64}\n".encode("utf-8")
    sig = key.sign(body, ec.ECDSA(hashes.SHA256()))
    sig_line = "— " + host + " " + base64.b64encode(hint + sig).decode() + "\n"
    return {"envelope": body.decode("utf-8") + "\n" + sig_line}


def sign_set(body_b64: str, integrated_time: int, log_index: int, p12_path: str, p12_password: str) -> dict:
    """Sign a Rekor SignedEntryTimestamp: DER-ECDSA over the RFC-8785-canonical
    JSON {body, integratedTime, logIndex, logID}, where body = base64 of the
    entry's canonicalizedBody and logID = hex(SHA-256(SPKI)). Supplies cosign's
    trusted integrated timestamp for the entry."""
    key, cert = _load_log_key(p12_path, p12_password)
    spki = cert.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    log_id_hex = hashlib.sha256(spki).digest().hex()
    payload = {"body": body_b64, "integratedTime": int(integrated_time),
               "logIndex": int(log_index), "logID": log_id_hex}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    sig = key.sign(canonical, ec.ECDSA(hashes.SHA256()))
    return {"set_b64": base64.b64encode(sig).decode(), "log_id_hex": log_id_hex}



_REVOCATIONS_TAG = b"letsseal.revocations.v1\n"

_REV_DOC_MEMBERS = ("version", "updated_at", "revoked")
_REV_ENTRY_MEMBERS = ("serial", "subject", "reason", "revoked_at", "note")

_rev_sig_cache: dict[str, dict] = {}


def revocations_bytes(doc: dict) -> bytes:
    """The exact byte string a revocation-list signature covers.

    `letsseal.revocations.v1\\n` followed by canonical JSON of `version`,
    `updated_at` and `revoked`, in that order, with each entry carrying `serial`,
    `subject`, `reason`, `revoked_at` and `note` in that order and nothing else.

    Excluded on purpose: `fetched_at`, which is stamped per request and would make
    every response a different document, and the signature fields themselves. The
    entry order is part of what is signed, so reordering the list breaks the
    signature; CONFORMANCE C-39 requires that order be by revocation time.
    """
    entries = []
    for e in doc.get("revoked") or []:
        entries.append({k: str(e.get(k, "")) for k in _REV_ENTRY_MEMBERS})
    body = {
        "version": int(doc.get("version", 1)),
        "updated_at": str(doc.get("updated_at", "")),
        "revoked": entries,
    }
    assert tuple(body) == _REV_DOC_MEMBERS
    canonical = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    return _REVOCATIONS_TAG + canonical.encode("utf-8")


def sign_revocations(doc: dict, p12_path: str, p12_password: str) -> dict:
    """Sign a revocation list with the log key. Returns the members to publish
    alongside it: `signature` (base64 DER ECDSA P-256 over SHA-256), `logCert` and
    `logChain` (PEM), so the list is self-contained and checkable offline.

    Cached on the preimage digest. ECDSA is randomised, so re-signing unchanged
    content would hand every caller a different signature for the same list and
    make the document look like it kept changing when it had not.
    """
    preimage = revocations_bytes(doc)
    try:
        st = os.stat(p12_path)
        key_id = f"{p12_path}:{st.st_mtime_ns}:{st.st_size}"
    except OSError:
        key_id = p12_path
    digest = f"{key_id}:{hashlib.sha256(preimage).hexdigest()}"
    hit = _rev_sig_cache.get(digest)
    if hit is not None:
        return dict(hit)

    key, cert = _load_log_key(p12_path, p12_password)
    with open(p12_path, "rb") as f:
        _k, _c, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    sig = key.sign(preimage, ec.ECDSA(hashes.SHA256()))
    out = {
        "signature": base64.b64encode(sig).decode(),
        "logCert": cert.public_bytes(Encoding.PEM).decode(),
        "logChain": "".join(c.public_bytes(Encoding.PEM).decode() for c in (extras or [])),
    }
    for k in [k for k in _rev_sig_cache if k.startswith(f"{key_id}:")]:
        del _rev_sig_cache[k]
    _rev_sig_cache[digest] = dict(out)
    return out
