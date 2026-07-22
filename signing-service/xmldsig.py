"""
xmldsig.py — W3C XML Signature (XML-DSig) seals for XML documents.

The format-native seal for XML (e-invoices/UBL/PEPPOL, SEPA, config, XML SBOMs):
an *enveloped* ``<ds:Signature>`` embedded in the document — the same idea as
PAdES inside a PDF or C2PA inside an image — signed by the org's certificate
chaining to the same published root. It verifies with any XML-DSig tool
(``xmlsec1 --verify``) or the reference verifier, against the pinned root.

Signing uses signxml with ECDSA-SHA256 (our EC P-256 org keys). The signer's
certificate chain is embedded in ``<KeyInfo>/<X509Data>``, so the signed XML is
self-contained. Time comes from the Bitcoin/OTS anchor on the signed document's
hash, as with the other seal forms.
"""
from __future__ import annotations

import base64

_DSIG_NS = "http://www.w3.org/2000/09/xmldsig#"


def _load_signer(p12_path: str, p12_password: str):
    """(private_key, [leaf+intermediate PEM strings], leaf_CN) from the org p12.
    The self-signed root is dropped — it's the verifier's anchor, not embedded."""
    from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
    from cryptography.x509.oid import NameOID
    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"could not load key/cert from {p12_path}")
    chain = [cert.public_bytes(Encoding.PEM).decode("ascii")]
    chain += [c.public_bytes(Encoding.PEM).decode("ascii") for c in (extras or []) if c.subject != c.issuer]
    try:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        cn = ""
    return key, chain, cn


def sign_xml(xml_bytes: bytes, p12_path: str, p12_password: str) -> tuple[bytes, str]:
    """Embed an enveloped XML-DSig signature into `xml_bytes`; return
    (signed_xml_bytes, signer_cn). Raises on malformed XML."""
    from lxml import etree
    from signxml import XMLSigner, SignatureMethod, SignatureConstructionMethod

    key, chain, cn = _load_signer(p12_path, p12_password)
    _p = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    root = etree.fromstring(xml_bytes, _p)
    signer = XMLSigner(
        method=SignatureConstructionMethod.enveloped,
        signature_algorithm=SignatureMethod.ECDSA_SHA256,
        digest_algorithm="sha256",
    )
    signed = signer.sign(root, key=key, cert=chain)
    out = etree.tostring(signed, xml_declaration=True, encoding="UTF-8")
    return out, cn


def _embedded_leaf(root):
    """The first embedded X509Certificate (the signer leaf), as a cryptography
    Certificate, or None."""
    from cryptography import x509
    el = root.find(f".//{{{_DSIG_NS}}}X509Certificate")
    if el is None or not el.text:
        return None
    try:
        return x509.load_der_x509_certificate(base64.b64decode("".join(el.text.split())))
    except Exception:
        return None


def _signer_cn(root) -> str:
    from cryptography.x509.oid import NameOID
    cert = _embedded_leaf(root)
    if cert is None:
        return ""
    try:
        return cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        return ""


def _signature_only_valid(xml_bytes: bytes, root) -> bool:
    """True if the signature is cryptographically valid against its own embedded
    signer cert (ignoring whether that cert chains to a trusted root)."""
    from cryptography.hazmat.primitives.serialization import Encoding
    from signxml import XMLVerifier
    cert = _embedded_leaf(root)
    if cert is None:
        return False
    try:
        XMLVerifier().verify(xml_bytes, x509_cert=cert.public_bytes(Encoding.PEM).decode("ascii"))
        return True
    except Exception:
        return False


def verify_xml(xml_bytes: bytes, ca_root_path: str) -> dict:
    """Verify an XML document's enveloped signature against our pinned root.

    Verdict shape:
      sealed  — an enveloped ``<ds:Signature>`` is present
      valid   — the signature + reference digests are cryptographically sound
      trusted — the signer cert chains to the Let's Seal root
    """
    from lxml import etree
    from signxml import XMLVerifier, InvalidDigest, InvalidSignature, InvalidCertificate, InvalidInput

    try:
        _p = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
        root = etree.fromstring(xml_bytes, _p)
    except Exception:
        return {"sealed": False, "xmldsig": True, "valid": False, "trusted": False,
                "signer": "", "reason": "not well-formed XML"}

    if root.find(f".//{{{_DSIG_NS}}}Signature") is None:
        return {"sealed": False, "xmldsig": True, "valid": False, "trusted": False, "signer": ""}

    signer = _signer_cn(root)
    try:
        XMLVerifier().verify(xml_bytes, ca_pem_file=ca_root_path)
        return {"sealed": True, "xmldsig": True, "valid": True, "trusted": True, "signer": signer}
    except InvalidCertificate:
        return {"sealed": True, "xmldsig": True, "valid": _signature_only_valid(xml_bytes, root),
                "trusted": False, "signer": signer, "reason": "not issued by Let's Seal"}
    except (InvalidDigest, InvalidSignature, InvalidInput):
        return {"sealed": True, "xmldsig": True, "valid": False, "trusted": False,
                "signer": signer, "reason": "altered or invalid signature"}
    except Exception:
        return {"sealed": True, "xmldsig": True, "valid": False, "trusted": False,
                "signer": signer, "reason": "verification error"}
