"""Zero-dependency HTTP client for the Let's Seal signing service."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import uuid
from dataclasses import dataclass
from typing import Optional, Union
from urllib.error import HTTPError
from urllib.request import Request, urlopen

FileInput = Union[str, bytes, os.PathLike]
DEFAULT_BASE_URL = "http://127.0.0.1:8081"


class LetsSealError(Exception):
    """A non-2xx response from the signing service."""

    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"Let's Seal API error {status}: {body}")


@dataclass
class SealResult:
    pdf: bytes
    sha256: str
    cert_cn: str


@dataclass
class CertResult:
    id: str
    profile: str
    certificate: str
    chain: str


@dataclass
class AnchorStatus:
    state: str
    file_sha256: Optional[str] = None
    bitcoin_block: Optional[int] = None
    calendars: Optional[list] = None


@dataclass
class AnchorResult:
    ots_b64: str
    status: AnchorStatus


def sha256_hex(data: bytes) -> str:
    """Lowercase-hex SHA-256 of some bytes."""
    return hashlib.sha256(data).hexdigest()


def _read(f: FileInput) -> tuple[bytes, str]:
    """Return (bytes, filename) for a path or raw bytes."""
    if isinstance(f, (bytes, bytearray)):
        return bytes(f), "file"
    path = os.fspath(f)
    with open(path, "rb") as fh:
        return fh.read(), os.path.basename(path) or "file"


class LetsSeal:
    """Client for a Let's Seal signing service.

    Args:
        base_url: service base URL (default ``http://127.0.0.1:8081``).
        headers:  extra headers sent on every request (e.g. a hosted-tier token).
        timeout:  per-request timeout in seconds.
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL, *, headers: Optional[dict] = None, timeout: float = 60.0):
        self.base = base_url.rstrip("/")
        self.headers = headers or {}
        self.timeout = timeout


    def _request(self, method: str, path: str, *, data: Optional[bytes] = None, content_type: Optional[str] = None) -> tuple[bytes, dict]:
        req = Request(self.base + path, data=data, method=method)
        for k, v in self.headers.items():
            req.add_header(k, v)
        if content_type:
            req.add_header("Content-Type", content_type)
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                headers = {k.lower(): v for k, v in resp.headers.items()}
                return resp.read(), headers
        except HTTPError as e:
            raise LetsSealError(e.code, e.read().decode("utf-8", "replace")) from None

    def _post_json(self, path: str, payload: dict) -> dict:
        body, _ = self._request("POST", path, data=json.dumps(payload).encode(), content_type="application/json")
        return json.loads(body)

    def _post_multipart(self, path: str, fields: dict, file: Optional[FileInput] = None) -> tuple[bytes, dict]:
        boundary = "----letsseal" + uuid.uuid4().hex
        buf = bytearray()
        for name, value in fields.items():
            buf += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        if file is not None:
            content, filename = _read(file)
            mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            buf += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                    f"filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n").encode()
            buf += content + b"\r\n"
        buf += f"--{boundary}--\r\n".encode()
        return self._request("POST", path, data=bytes(buf), content_type=f"multipart/form-data; boundary={boundary}")

    @staticmethod
    def _anchor(r: dict) -> AnchorResult:
        s = r.get("status") or {}
        return AnchorResult(ots_b64=r["ots_b64"], status=AnchorStatus(
            state=s.get("state"), file_sha256=s.get("file_sha256"),
            bitcoin_block=s.get("bitcoin_block"), calendars=s.get("calendars")))


    def health(self) -> dict:
        """Liveness check."""
        body, _ = self._request("GET", "/health")
        return json.loads(body)

    def issue_org_cert(self, slug: str, legal_name: str) -> dict:
        """Issue a business signing certificate (CA-as-code)."""
        return self._post_json("/org", {"slug": slug, "legal_name": legal_name})

    def sign_csr(self, id: str, csr: str, profile: str = "document") -> CertResult:
        """Sign a client CSR under a profile. The private key never leaves the client."""
        r = self._post_json("/cert/sign", {"id": id, "csr": csr, "profile": profile})
        return CertResult(id=r["id"], profile=r["profile"], certificate=r["certificate"], chain=r["chain"])

    def seal(self, file: FileInput, *, org: str, reason: str = "Document execution", timestamp: bool = True) -> SealResult:
        """Seal a PDF with an org's certificate."""
        body, hdrs = self._post_multipart(
            "/seal", {"org_slug": org, "reason": reason, "timestamp": str(timestamp).lower()}, file)
        return SealResult(pdf=body, sha256=hdrs.get("x-letsseal-sha256", ""), cert_cn=hdrs.get("x-letsseal-cert-cn", ""))

    def verify(self, file: FileInput) -> dict:
        """Verify a sealed PDF against the CA. Returns the verification dict."""
        body, _ = self._post_multipart("/verify", {}, file)
        return json.loads(body)

    def anchor_file(self, file: FileInput) -> AnchorResult:
        """Anchor a file on Bitcoin (hashed server-side)."""
        body, _ = self._post_multipart("/anchor", {}, file)
        return self._anchor(json.loads(body))

    def anchor_hash(self, sha256: str) -> AnchorResult:
        """Anchor a bare SHA-256 digest — the file never leaves the caller."""
        return self._anchor(self._post_json("/anchor/hash", {"sha256": sha256}))

    def anchor_local(self, file: FileInput) -> AnchorResult:
        """Hash ``file`` locally and anchor only the digest — bytes never hit the network."""
        content, _ = _read(file)
        return self.anchor_hash(sha256_hex(content))

    def anchor_upgrade(self, ots_b64: str) -> AnchorResult:
        """Upgrade a pending ``.ots`` proof to a confirmed Bitcoin attestation."""
        return self._anchor(self._post_json("/anchor/upgrade", {"ots_b64": ots_b64}))

    def render_qr(self, data: str) -> bytes:
        """Render a proof QR code (PNG bytes)."""
        body, _ = self._request("POST", "/qr", data=json.dumps({"data": data}).encode(), content_type="application/json")
        return body
