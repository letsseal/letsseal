"""
c2pa_seal.py — C2PA (Content Credentials) seals for images.

Three delivery forms of the one SEAL now exist:
  • PAdES  (seal.py)      — signature embedded inside a PDF.
  • CAdES  (detached.py)  — a `.sig` sidecar beside any file (digest-only).
  • C2PA   (this)         — a signed provenance manifest embedded INTO an image.

C2PA writes a JUMBF box into the picture, so the seal travels with the image and
is read by any C2PA-aware tool (Adobe, the Content Credentials verifier, etc.).
The manifest is signed by the org's certificate chaining to the SAME published
root, so one root of trust covers documents and media alike. Our org certs use
the `document` profile (EC P-256, KU digitalSignature, EKU emailProtection) which
is a valid C2PA end-entity signing cert, and emailProtection is in c2pa's default
EKU set — so nothing new to issue.

Unlike the detached anchor, C2PA must rewrite the image (it embeds the manifest),
so the image bytes reach the signer. Time still comes from the Bitcoin/OTS anchor
on the signed image's hash — we do NOT embed an RFC-3161 timestamp, so there is
no external TSA dependency on the signing path.

Signing uses c2pa's callback signer: c2pa hands us the claim bytes and we sign
them with the org key (loaded from the p12 via `cryptography`). The key stays
behind a function, and this is the same seam a future remote/HSM signer would use.
"""
from __future__ import annotations

import io

_EXT_MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "tif": "image/tiff", "tiff": "image/tiff", "gif": "image/gif", "avif": "image/avif",
    "heic": "image/heic", "heif": "image/heif", "dng": "image/x-adobe-dng",
    "mp4": "video/mp4", "m4v": "video/mp4", "mov": "video/quicktime",
    "mp3": "audio/mpeg", "flac": "audio/flac", "m4a": "audio/mp4",
}

_SUPPORTED_MIME = set(_EXT_MIME.values())


def mime_for(filename: str | None, data: bytes | None = None) -> str | None:
    """Best-effort media MIME from extension, falling back to magic bytes. Returns
    None if it isn't a media format c2pa can embed into (per _EXT_MIME)."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[1].lower()
        if ext in _EXT_MIME:
            return _EXT_MIME[ext]
    if data:
        if data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        if data[:2] in (b"II", b"MM") and data[2:4] in (b"\x2a\x00", b"\x00\x2a"):
            return "image/tiff"
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"
        if data[:4] == b"fLaC":
            return "audio/flac"
        if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
            return "audio/mpeg"
        if data[4:8] == b"ftyp":
            brand = data[8:12]
            if brand in (b"avif", b"avis"):
                return "image/avif"
            if brand in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"):
                return "image/heic"
            if brand == b"qt  ":
                return "video/quicktime"
            if brand in (b"M4A ", b"M4B "):
                return "audio/mp4"
            return "video/mp4"
    return None


def is_supported_mime(mime: str) -> bool:
    return mime in _SUPPORTED_MIME


def _load_signer(p12_path: str, p12_password: str):
    """Load the org key + build the C2PA sign_cert chain (leaf + intermediates,
    excluding the self-signed root — the root is the verifier's trust anchor, not
    something to embed) from the org's PKCS#12. Returns (private_key, chain_pem, cn)
    where cn is the leaf certificate's Common Name (the issuing business)."""
    from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
    from cryptography.x509.oid import NameOID
    with open(p12_path, "rb") as f:
        key, cert, extras = pkcs12.load_key_and_certificates(f.read(), p12_password.encode("utf-8"))
    if key is None or cert is None:
        raise ValueError(f"could not load key/cert from {p12_path}")
    chain = [cert] + [c for c in (extras or []) if c.subject != c.issuer]
    chain_pem = b"".join(c.public_bytes(Encoding.PEM) for c in chain).decode("ascii")
    try:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except Exception:
        cn = ""
    return key, chain_pem, cn


def _manifest(mime: str, title: str | None) -> dict:
    """A minimal, honest manifest. C2PA requires a well-formed `c2pa.actions`
    assertion, so we record the single standard origin action `c2pa.created` (the
    asset's provenance begins with this seal) — deliberately WITHOUT a
    `digitalSourceType`, which would overclaim HOW the image was made (camera vs
    software). The seal's real meaning — which issuer vouches for this exact,
    unaltered image — is carried by the signature and the hash binding."""
    return {
        "claim_generator_info": [{"name": "Let's Seal", "version": "1.0.0"}],
        "title": title or "media",
        "format": mime,
        "assertions": [
            {"label": "c2pa.actions", "data": {"actions": [{"action": "c2pa.created"}]}},
        ],
    }


def sign_c2pa(image_bytes: bytes, mime: str, p12_path: str, p12_password: str,
              title: str | None = None) -> tuple[bytes, str]:
    """Embed a C2PA manifest signed by the org cert into `image_bytes`; return
    (signed_image_bytes, signer_cn). No timestamp embedded (time comes from the
    Bitcoin/OTS anchor on the signed image's hash)."""
    from c2pa import Builder, Signer, Context, C2paSigningAlg
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec

    key, chain_pem, cn = _load_signer(p12_path, p12_password)

    def _sign(data: bytes) -> bytes:
        return key.sign(data, ec.ECDSA(hashes.SHA256()))

    out = io.BytesIO()
    with Signer.from_callback(_sign, C2paSigningAlg.ES256, chain_pem, None) as signer, \
            Context() as ctx, Builder(_manifest(mime, title), ctx) as builder:
        builder.sign(signer, mime, io.BytesIO(image_bytes), out)
    return out.getvalue(), cn


def verify_c2pa(image_bytes: bytes, mime: str, ca_root_path: str) -> dict:
    """Validate an image's embedded C2PA manifest, chaining to our pinned root.

    Returns the shared verdict shape:
      sealed  — an embedded manifest is present
      valid   — the manifest is cryptographically valid and the image is intact
      trusted — the signing cert chains to the Let's Seal root
      signer  — the issuer named by the signing cert
    A `Valid` state means intact + valid signature but an unrecognised cert;
    `Trusted` means it also chains to our root. A missing manifest → unsealed;
    any other reader error → sealed but invalid (e.g. altered after sealing)."""
    import json
    from c2pa import Reader, Context

    with open(ca_root_path) as f:
        root_pem = f.read()
    cfg = {"trust": {"user_anchors": root_pem}, "verify": {"verify_trust": True}}

    try:
        with Context.from_dict(cfg) as ctx:
            with Reader(mime, io.BytesIO(image_bytes), context=ctx) as reader:
                store = json.loads(reader.json())
    except Exception as e:
        msg = str(e).lower()
        if "manifestnotfound" in msg or "no jumbf" in msg or "no claim" in msg:
            return {"sealed": False, "c2pa": True, "valid": False, "trusted": False, "signer": ""}
        return {"sealed": True, "c2pa": True, "valid": False, "trusted": False,
                "signer": "", "reason": "manifest invalid or image altered after sealing"}

    state = store.get("validation_state")
    am = store.get("active_manifest")
    signer = ""
    if am and am in store.get("manifests", {}):
        signer = store["manifests"][am].get("signature_info", {}).get("issuer", "") or ""
    return {
        "sealed": bool(am),
        "c2pa": True,
        "valid": state in ("Valid", "Trusted"),
        "trusted": state == "Trusted",
        "validation_state": state,
        "signer": signer,
    }
