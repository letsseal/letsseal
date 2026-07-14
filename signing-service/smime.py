"""
smime.py — S/MIME signatures for sealing email messages.

S/MIME is the CMS/PKCS#7 signature the mail world already speaks. It is the same
crypto family as our detached CAdES seal (detached.py) — a CMS SignedData from an
org's signing cert chaining to the same published root — but delivered in the
`multipart/signed` envelope a mail client expects, so the whole message travels as
one self-contained, standards-conformant signed email.

We sign the message content clear (a `DetachedSignature` — the body stays readable
in the first MIME part) with `Text` canonicalisation, which is what mail transfer
and stock verifiers assume. The signer's cert chain is embedded, so the result
verifies with no Let's Seal server:

    openssl smime -verify -in message.eml -CAfile letsseal-root.crt

Trust caveat, stated plainly: our root is our own. `openssl smime -verify` (above)
confirms the chain against the pinned root, and so does the Let's Seal portal. A
desktop mail client (Outlook, Apple Mail) will show the signature as *present and
intact* but *untrusted* until our root is imported into its trust store — exactly
the same own-root model as every other Let's Seal form. The signature is real; the
green "trusted" badge in a third-party mail client is a trust-store question, not a
crypto one.

Time comes from a separate anchor on the signed bytes, same as the other forms.
"""
from __future__ import annotations

import email
import subprocess
import tempfile
import os

from cryptography.hazmat.primitives.serialization import pkcs7, pkcs12, Encoding
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import NameOID


def _leaf_cn(certs) -> str:
    """CN of the signing leaf (the one non-CA cert) from a cert list."""
    def is_ca(c):
        try:
            bc = c.extensions.get_extension_for_class(
                __import__("cryptography").x509.BasicConstraints).value
            return bool(bc.ca)
        except Exception:
            return False

    leaf = next((c for c in certs if not is_ca(c)), certs[0] if certs else None)
    if leaf is None:
        return ""
    try:
        return leaf.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        return leaf.subject.rfc4514_string()


def sign_smime(message_bytes: bytes, p12_path: str, p12_password: str) -> tuple[bytes, str]:
    """Sign a mail message, returning (multipart/signed .eml bytes, signer CN).

    The body is signed clear-text (readable) with the signer's chain embedded, so
    the result is a complete S/MIME signed email that verifies against our root.
    """
    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"Could not load signing cert from {p12_path}")

    builder = pkcs7.PKCS7SignatureBuilder().set_data(message_bytes).add_signer(cert, key, hashes.SHA256())
    for c in extras or []:
        if c.subject != c.issuer:
            builder = builder.add_certificate(c)

    signed = builder.sign(Encoding.SMIME, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Text])
    cn = _leaf_cn([cert] + [c for c in (extras or [])])
    return signed, cn


def _signer_from_eml(eml_bytes: bytes) -> str:
    """Best-effort signer CN from the pkcs7 signature part of a signed .eml."""
    try:
        msg = email.message_from_bytes(eml_bytes)
        for part in msg.walk():
            ct = part.get_content_type()
            if ct in ("application/x-pkcs7-signature", "application/pkcs7-signature"):
                der = part.get_payload(decode=True)
                certs = pkcs7.load_der_pkcs7_certificates(der)
                return _leaf_cn(certs)
    except Exception:
        pass
    return ""


def verify_smime(eml_bytes: bytes, ca_root_path: str, timeout: int = 30) -> dict:
    """Verify a `multipart/signed` S/MIME message with stock openssl. Two checks:
    the signature alone (valid) and the chain to the pinned root (trusted)."""
    with tempfile.TemporaryDirectory() as d:
        fp = os.path.join(d, "message.eml")
        with open(fp, "wb") as f:
            f.write(eml_bytes)

        def _openssl(*extra):
            r = subprocess.run(
                ["openssl", "smime", "-verify", "-in", fp, "-no_check_time",
                 "-out", os.devnull, *extra],
                capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode == 0 and "verification successful" in (r.stdout + r.stderr).lower()

        valid = _openssl("-noverify")
        trusted = _openssl("-CAfile", ca_root_path)

    return {"sealed": True, "smime": True, "valid": bool(valid), "trusted": bool(trusted),
            "entire_file": bool(valid), "signer": _signer_from_eml(eml_bytes)}
