"""
identity.py — mint a short-lived identity certificate from a provider-verified
email, then sign an artifact digest with it.

This is the certificate half of the OIDC identity lane (oidc.py is the proof
half). Given an already-verified identity (see oidc.verify_oidc / verify_github),
we:

  1. generate a fresh ephemeral P-256 keypair (never stored, never leaves here),
  2. issue a SHORT-LIVED (~15 min) leaf signed by the dedicated identity
     intermediate, with the provider-verified email as the Subject Alternative
     Name and the OIDC issuer recorded in a certificate extension, and
  3. sign the caller's SHA-256 digest with the ephemeral key.

This mirrors Fulcio's model — an ephemeral key certified against an OIDC
identity for a few minutes — but pointed at the identity provider directly, on
Let's Seal's own CA, with no sigstore server. The seal that results says "this
digest was signed by someone Google/GitHub verified as alice@corp.com", and
because the leaf carries a real SAN + codeSigning EKU it also verifies with stock
`cosign verify-blob --certificate-identity alice@corp.com`.

The issuing key lives on the box (that is the cost of on-demand issuance); the
blast radius is contained by (a) a dedicated path-limited intermediate that
cannot forge document/org certs, (b) the ~15-min lifetime, and (c) logging every
issuance to the transparency log so mis-issuance is publicly detectable.
"""
from __future__ import annotations

import base64
import datetime
import re

from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID, ObjectIdentifier
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils as asym_utils
from cryptography.hazmat.primitives.serialization import Encoding, pkcs12

_HEX64 = re.compile(r"[0-9a-f]{64}")
_OID_ISSUER = ObjectIdentifier("1.3.6.1.4.1.57264.1.8")
_LEAF_MINUTES = 15
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _load_issuer(p12_path: str, p12_password: str):
    """Return (issuer_key, issuer_cert, root_cert) from the identity issuer p12.
    The p12 holds the identity intermediate key+cert with the root as the extra
    cert (see ca/setup-ca.sh identity-init)."""
    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"could not load identity issuer from {p12_path}")
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise ValueError("identity issuer must be an EC (P-256) key")
    roots = [c for c in (extras or []) if c.subject == c.issuer]
    root = roots[0] if roots else None
    return key, cert, root


def _sans(email: str, account_url: str) -> list:
    sans: list = [x509.RFC822Name(email)]
    if account_url:
        sans.append(x509.UniformResourceIdentifier(account_url))
    return sans


def issue_and_sign(sha256_hex: str, email: str, issuer_url: str, provider: str,
                   p12_path: str, p12_password: str, account_url: str = "") -> dict:
    """Mint a short-lived identity leaf for `email` and sign `sha256_hex` with its
    ephemeral key. Returns the cosign-shaped {sig_b64, cert_pem, chain_pem, ...}
    plus the bound identity so the caller can log + display it."""
    sha256_hex = sha256_hex.strip().lower()
    if not _HEX64.fullmatch(sha256_hex):
        raise ValueError("expected a 64-character SHA-256 hex digest")
    email = email.strip().lower()
    if not _EMAIL.fullmatch(email):
        raise ValueError("verified identity is not a valid email")

    issuer_key, issuer_cert, root = _load_issuer(p12_path, p12_password)

    leaf_key = ec.generate_private_key(ec.SECP256R1())

    now = datetime.datetime.now(datetime.timezone.utc)
    not_before = now - datetime.timedelta(minutes=1)
    not_after = now + datetime.timedelta(minutes=_LEAF_MINUTES)

    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, email),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, f"Verified via {provider}"),
        ]))
        .issuer_name(issuer_cert.subject)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before)
        .not_valid_after(not_after)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(digital_signature=True, content_commitment=True,
                          key_encipherment=False, data_encipherment=False,
                          key_agreement=False, key_cert_sign=False, crl_sign=False,
                          encipher_only=False, decipher_only=False),
            critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION,
                                   ExtendedKeyUsageOID.CODE_SIGNING]),
            critical=False)
        .add_extension(x509.SubjectAlternativeName(_sans(email, account_url)), critical=False)
        .add_extension(
            x509.UnrecognizedExtension(_OID_ISSUER, issuer_url.encode("utf-8")),
            critical=False)
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(leaf_key.public_key()), critical=False)
    )
    leaf = builder.sign(private_key=issuer_key, algorithm=hashes.SHA256())

    digest = bytes.fromhex(sha256_hex)
    sig = leaf_key.sign(digest, ec.ECDSA(asym_utils.Prehashed(hashes.SHA256())))

    chain_certs = [issuer_cert] + ([root] if root is not None else [])
    chain_pem = b"".join(c.public_bytes(Encoding.PEM) for c in chain_certs)
    return {
        "sig_b64": base64.b64encode(sig).decode(),
        "cert_pem": leaf.public_bytes(Encoding.PEM).decode("ascii"),
        "chain_pem": chain_pem.decode("ascii"),
        "cert_cn": email,
        "identity": email,
        "issuer": issuer_url,
        "provider": provider,
        "not_after": not_after.isoformat(),
    }


def _identity_from_cert(cert) -> dict:
    """Pull the bound identity (SAN email/URL) + OIDC issuer back out of a leaf."""
    email, account_url, issuer = "", "", ""
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        emails = san.get_values_for_type(x509.RFC822Name)
        uris = san.get_values_for_type(x509.UniformResourceIdentifier)
        email = emails[0] if emails else ""
        account_url = uris[0] if uris else ""
    except Exception:
        pass
    try:
        ext = cert.extensions.get_extension_for_oid(_OID_ISSUER).value
        issuer = ext.value.decode("utf-8", "ignore")
    except Exception:
        pass
    return {"identity": email, "account_url": account_url, "issuer": issuer}


def verify_identity_digest(sha256_hex: str, sig_b64: str, cert_pem: str,
                           ca_root_path: str, chain_pem: str = "") -> dict:
    """Verify an identity seal: the ECDSA signature over the digest (valid) and the
    leaf's chain to our pinned root (trusted), and surface the bound identity +
    issuer so the portal can say who signed and who vouched for them.

    Reuses the blob chain-walk (same crypto), then augments it with the identity
    fields. `trusted` here means chained to our root; the *identity* trust comes
    from the OIDC issuer that our CA recorded at issuance."""
    from blobsign import verify_blob_digest
    result = verify_blob_digest(sha256_hex, sig_b64, cert_pem, ca_root_path, chain_pem)
    try:
        leaf = x509.load_pem_x509_certificate(cert_pem.encode())
        ident = _identity_from_cert(leaf)
    except Exception:
        ident = {"identity": "", "account_url": "", "issuer": ""}
    result.pop("blob", None)
    result["identity_seal"] = True
    result["signer"] = ident["identity"] or result.get("signer", "")
    result["identity"] = ident["identity"]
    result["oidc_issuer"] = ident["issuer"]
    if ident["account_url"]:
        result["account_url"] = ident["account_url"]
    return result
