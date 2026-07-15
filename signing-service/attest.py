"""
attest.py — signed SBOM / provenance attestations for the supply-chain lane.

Where blobsign.py signs an artifact's bytes, this signs a STATEMENT ABOUT the
artifact: an in-toto v1 statement whose `subject` is the artifact's SHA-256 and
whose `predicate` is an SBOM (SPDX / CycloneDX), SLSA provenance, a vuln scan, or
any custom claim. The statement is wrapped in a DSSE envelope (the sigstore /
in-toto signing convention) and signed by the org's codeSigning leaf — the same
root of trust as every other Let's Seal seal, no sigstore server involved.

Two ways to verify what this produces:

  * stock cosign, key mode (proven against cosign v3):
      cosign verify-blob-attestation --bundle att.bundle --key signer.pub \\
        --type spdxjson --insecure-ignore-tlog --check-claims=true <artifact>
    `--insecure-ignore-tlog` just says "not sigstore's public Rekor" — correct
    here, Let's Seal's transparency is its own Merkle log + Bitcoin anchor.

  * sealbot / any DSSE tool, cert mode: verify the DSSE signature against the
    leaf's public key AND the leaf's chain to the published Let's Seal root — the
    full CA-anchored trust our own verifier uses.

Digest-only: the caller sends the artifact's SHA-256 (the statement subject) plus
the predicate; the artifact bytes never leave the caller.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from blobsign import _load, _cn, _san_identity

_HEX64 = re.compile(r"[0-9a-f]{64}")
_INTOTO_PT = "application/vnd.in-toto+json"
_STATEMENT_TYPE = "https://in-toto.io/Statement/v1"

_PREDICATE_TYPES = {
    "spdx": "https://spdx.dev/Document",
    "spdxjson": "https://spdx.dev/Document",
    "cyclonedx": "https://cyclonedx.org/bom",
    "slsaprovenance": "https://slsa.dev/provenance/v1",
    "slsaprovenance1": "https://slsa.dev/provenance/v1",
    "vuln": "https://cosign.sigstore.dev/attestation/vuln/v1",
    "link": "https://in-toto.io/Link/v1",
    "custom": "https://cosign.sigstore.dev/attestation/v1",
}

_BUNDLE_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle+json;version=0.3"


def predicate_type_uri(t: str) -> str:
    return _PREDICATE_TYPES.get(t.strip().lower(), t.strip())


def _pae(payload_type: str, body: bytes) -> bytes:
    """DSSE Pre-Authentication Encoding — the exact bytes that get signed."""
    pt = payload_type.encode("utf-8")
    return b"DSSEv1 " + str(len(pt)).encode() + b" " + pt + b" " + str(len(body)).encode() + b" " + body


def _statement(subject_sha256: str, subject_name: str, predicate_type: str, predicate) -> bytes:
    stmt = {
        "_type": _STATEMENT_TYPE,
        "subject": [{"name": subject_name or "artifact", "digest": {"sha256": subject_sha256}}],
        "predicateType": predicate_type,
        "predicate": predicate,
    }
    return json.dumps(stmt, separators=(",", ":")).encode("utf-8")


def sign_attestation(subject_sha256: str, predicate, predicate_type: str,
                     p12_path: str, p12_password: str, subject_name: str = "artifact") -> dict:
    """Sign an in-toto/DSSE attestation binding `predicate` to `subject_sha256`.

    `predicate` is the claim object (an SBOM doc, SLSA provenance, etc.).
    Returns the cosign-ready sigstore `bundle`, the raw `dsse` envelope, the
    signer's `pubkey_pem` (for `cosign --key`), and `cert_pem`/`chain_pem` (for
    cert-chain verification), plus the resolved `predicate_type` URI.
    """
    subject_sha256 = subject_sha256.strip().lower()
    if not _HEX64.fullmatch(subject_sha256):
        raise ValueError("expected a 64-character SHA-256 hex digest")
    if predicate is None:
        raise ValueError("predicate required")
    pt_uri = predicate_type_uri(predicate_type)

    key, cert, chain = _load(p12_path, p12_password)
    body = _statement(subject_sha256, subject_name, pt_uri, predicate)

    sig = key.sign(_pae(_INTOTO_PT, body), ec.ECDSA(hashes.SHA256()))

    pub = key.public_key()
    spki = pub.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    hint = base64.b64encode(hashlib.sha256(spki).digest()).decode()

    dsse = {
        "payloadType": _INTOTO_PT,
        "payload": base64.b64encode(body).decode(),
        "signatures": [{"sig": base64.b64encode(sig).decode()}],
    }
    bundle = {
        "mediaType": _BUNDLE_MEDIA_TYPE,
        "verificationMaterial": {"publicKey": {"hint": hint}},
        "dsseEnvelope": dsse,
    }
    return {
        "bundle": bundle,
        "dsse": dsse,
        "pubkey_pem": pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii"),
        "cert_pem": cert.public_bytes(Encoding.PEM).decode("ascii"),
        "chain_pem": b"".join(c.public_bytes(Encoding.PEM) for c in chain).decode("ascii"),
        "cert_cn": _cn(cert),
        "identity": _san_identity(cert),
        "predicate_type": pt_uri,
    }


def _extract_dsse(bundle_or_dsse: dict) -> dict:
    """Accept either a full sigstore bundle or a bare DSSE envelope."""
    if "dsseEnvelope" in bundle_or_dsse:
        return bundle_or_dsse["dsseEnvelope"]
    if "payload" in bundle_or_dsse and "signatures" in bundle_or_dsse:
        return bundle_or_dsse
    raise ValueError("no DSSE envelope found")


def verify_attestation(bundle_or_dsse: dict, cert_pem: str, ca_root_path: str,
                       chain_pem: str = "", expected_sha256: str = "") -> dict:
    """Verify a DSSE attestation: the signature over the statement (valid) and the
    leaf's chain to our pinned root (trusted), and surface the subject digest +
    predicate type. If `expected_sha256` is given, also confirm it is the
    statement's subject (claims check)."""
    import datetime
    from cryptography import x509
    from cryptography.exceptions import InvalidSignature

    dsse = _extract_dsse(bundle_or_dsse)
    body = base64.b64decode(dsse["payload"])
    payload_type = dsse.get("payloadType", _INTOTO_PT)
    sigs = dsse.get("signatures") or []
    if not sigs:
        raise ValueError("no signatures in DSSE envelope")
    sig = base64.b64decode(sigs[0]["sig"])

    leaf = x509.load_pem_x509_certificate(cert_pem.encode())

    valid = False
    try:
        leaf.public_key().verify(sig, _pae(payload_type, body), ec.ECDSA(hashes.SHA256()))
        valid = True
    except (InvalidSignature, Exception):
        valid = False

    subject_ok = None
    predicate_type = ""
    subjects: list = []
    try:
        stmt = json.loads(body)
        predicate_type = stmt.get("predicateType", "")
        subjects = [s.get("digest", {}).get("sha256", "") for s in stmt.get("subject", [])]
        if expected_sha256:
            subject_ok = expected_sha256.strip().lower() in subjects
    except Exception:
        pass

    trusted = False
    try:
        from blobsign import verify_blob_digest
        with open(ca_root_path, "rb") as f:
            root = x509.load_pem_x509_certificate(f.read())
        inter = []
        for block in re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", chain_pem or "", re.S):
            c = x509.load_pem_x509_certificate(block.encode())
            if c.subject != c.issuer:
                inter.append(c)
        now = datetime.datetime.now(datetime.timezone.utc)

        def issued_by(child, parent) -> bool:
            try:
                parent.public_key().verify(child.signature, child.tbs_certificate_bytes,
                                           ec.ECDSA(child.signature_hash_algorithm))
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

    return {
        "sealed": True,
        "attestation": True,
        "valid": bool(valid),
        "trusted": bool(trusted),
        "subject_ok": subject_ok,
        "predicate_type": predicate_type,
        "subjects": subjects,
        "signer": _cn(leaf),
    }
