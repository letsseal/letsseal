"""
main.py — HTTP wrapper around the pyHanko sealing engine.

The Next.js app calls this internal service to (a) seal a completed PDF with an
org's certificate and (b) verify a PDF against our CA for the public
verification portal. Keep this service on a private network / localhost only —
it holds signing keys.

Run:  ./.venv/bin/uvicorn main:app --port 8081
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import subprocess
from io import BytesIO

from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from seal import seal_pdf, DEFAULT_TSA_URL
import anchor
import providers

from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.keys import load_cert_from_pemder

CA_DIR = os.environ.get("LETSSEAL_CA_DIR", "../ca/out")
P12_PASS = os.environ.get("LETSSEAL_P12_PASS", "")

SERVICE_TOKEN = os.environ.get("LETSSEAL_SERVICE_TOKEN", "")

MAX_UPLOAD_BYTES = 25_000_000

logger = logging.getLogger("letsseal.signing")

_DN_BAD = re.compile(r"[/\\\n\r\x00]")


def require_auth(authorization: Optional[str] = Header(None)) -> None:
    """Require a constant-time-matched `Authorization: Bearer <token>` header.

    Fail closed: if LETSSEAL_SERVICE_TOKEN is unset/empty every guarded endpoint
    returns 503 rather than allowing open access.
    """
    if not SERVICE_TOKEN:
        raise HTTPException(503, "service token not configured")
    expected = "Bearer " + SERVICE_TOKEN
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(401, "unauthorized")


def _validate_legal_name(legal: str) -> str:
    """Validate a caller-supplied legal name before it reaches the CA's subject
    DN. Rejects DN-injection metacharacters (`/`, newlines, backslash, NUL)."""
    legal = legal.strip()
    if not legal:
        raise HTTPException(400, "legal_name required")
    if _DN_BAD.search(legal):
        raise HTTPException(400, "legal_name contains invalid characters")
    return legal


async def _read_capped(file: UploadFile, request: Request) -> bytes:
    """Read an upload, rejecting bodies over MAX_UPLOAD_BYTES with HTTP 413
    BEFORE pulling the whole thing into memory."""
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "upload too large")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "upload too large")
    return data

API_DESCRIPTION = """\
The Let's Seal signing service is the keyed core of an open, self-hostable
alternative to pay-to-play document-authenticity trust lists — *the "Let's
Encrypt for documents."*

It **composes open standards** rather than inventing new ones:

* **PAdES / X.509** for the cryptographic seal (via pyHanko + an on-prem CA)
* **OpenTimestamps** for a free Bitcoin anchor proving a file existed by a date
* **SHA-256** everywhere; hash-only endpoints so a file never has to leave the caller

**Trust is self-anchored.** This CA is deliberately *not* in OS/Adobe trust
stores; a proof is verified via the certificate chain + the public portal + the
blockchain, not via automatic vendor trust. That is the point, not a limitation.

⚠️ **Runs localhost/private only — it holds signing keys.** The public, rate-limited
surface lives in the app tier in front of it.
"""

TAGS = [
    {"name": "sealing", "description": "Apply and verify PAdES seals on PDFs."},
    {"name": "anchoring", "description": "Timestamp a file or digest on Bitcoin via OpenTimestamps."},
    {"name": "ca", "description": "CA-as-code: issue org and per-client signing certificates."},
    {"name": "util", "description": "Health and rendering helpers."},
]

_PROD = os.environ.get("LETSSEAL_ENV", "").lower() in ("production", "prod")

app = FastAPI(
    title="Let's Seal signing service",
    version="0.1.0",
    description=API_DESCRIPTION,
    openapi_tags=TAGS,
    license_info={"name": "MIT", "url": "https://opensource.org/licenses/MIT"},
    contact={"name": "Let's Seal", "url": "https://letsseal.org"},
    servers=[{"url": "http://127.0.0.1:8081", "description": "Local keyed service"}],
    docs_url=None if _PROD else "/docs",
    redoc_url=None if _PROD else "/redoc",
    openapi_url=None if _PROD else "/openapi.json",
)



class HealthResponse(BaseModel):
    ok: bool = True


class OrgRequest(BaseModel):
    slug: str = Field(..., description="URL-safe business slug (a-z, 0-9, -).", examples=["acme"])
    legal_name: str = Field(..., description="Legal entity name to embed in the cert subject.", examples=["Acme Ltd"])


class OrgResponse(BaseModel):
    ok: bool
    slug: str


class QrRequest(BaseModel):
    data: str = Field(..., description="Payload to encode (typically a proof URL).")


class CertSignRequest(BaseModel):
    id: str = Field(..., description="URL-safe id for the cert (a-z, 0-9, -).", examples=["ci-prod"])
    csr: str = Field(..., description="PEM-encoded PKCS#10 CSR. The client keeps the private key.")
    profile: str = Field("document", description="Signing profile.", examples=["document", "code", "data"])


class CertSignResponse(BaseModel):
    ok: bool
    id: str
    profile: str
    certificate: str = Field(..., description="PEM signing certificate.")
    chain: str = Field(..., description="PEM chain (intermediate + root).")


class VerifyResponse(BaseModel):
    sealed: bool = Field(..., description="Whether a PAdES signature was found at all.")
    sha256: Optional[str] = None
    intact: Optional[bool] = Field(None, description="The WHOLE document is unaltered since sealing (covered bytes untouched AND nothing appended after the signature).")
    covered_intact: Optional[bool] = Field(None, description="Raw: only the bytes within the signature's range are unmodified (does NOT account for content appended after signing).")
    whole_document: Optional[bool] = Field(None, description="The signature covers the entire file (no incremental updates after it).")
    coverage: Optional[str] = Field(None, description="Signature coverage level: ENTIRE_FILE (good) | ENTIRE_REVISION | CONTENTS_ONLY | ...")
    valid: Optional[bool] = Field(None, description="Signature is cryptographically valid.")
    trusted: Optional[bool] = Field(None, description="Chains to this CA's trust root.")
    authentic: Optional[bool] = Field(None, description="AUTHORITATIVE pass/fail verdict: valid AND intact AND trusted. A valid signature from an unrecognized (self-signed) cert is NOT authentic. Render verdicts from this, not sealed/intact alone.")
    signer: Optional[str] = Field(None, description="Human-friendly signer subject.")
    signed_at: Optional[str] = None
    reason: Optional[str] = Field(None, description="Why verification could not proceed (when unsealed).")


class AnchorStatus(BaseModel):
    state: str = Field(..., description="`pending` (in the calendar, confirming) or `confirmed`.")
    file_sha256: Optional[str] = None
    bitcoin_block: Optional[int] = Field(None, description="Block height once confirmed.")
    calendars: Optional[List[str]] = Field(None, description="Calendars that accepted the timestamp.")


class AnchorResponse(BaseModel):
    ots_b64: str = Field(..., description="Base64 of the `.ots` proof; verifies with stock `ots verify`.")
    status: AnchorStatus


class AnchorHashRequest(BaseModel):
    sha256: str = Field(..., description="Lowercase 64-hex SHA-256 digest to anchor.")
    provider: Optional[str] = Field(None, description="Anchor provider id (default `bitcoin`).")


class AnchorUpgradeRequest(BaseModel):
    ots_b64: str = Field(..., description="Base64 of an existing `.ots` proof to upgrade.")
    provider: Optional[str] = Field(None, description="Anchor provider id (default `bitcoin`).")


def _org_p12(org_slug: str) -> str:
    path = os.path.join(CA_DIR, "orgs", org_slug, "signing.p12")
    if not os.path.isfile(path):
        raise HTTPException(404, f"No signing cert issued for org '{org_slug}'")
    return path


def _validation_context() -> ValidationContext:
    root = load_cert_from_pemder(os.path.join(CA_DIR, "root-ca.crt"))
    inter = load_cert_from_pemder(os.path.join(CA_DIR, "intermediate.crt"))
    return ValidationContext(trust_roots=[root], other_certs=[inter],
                             allow_fetching=False, revocation_mode="soft-fail")


CA_SCRIPT = os.path.join(os.path.dirname(__file__), "..", "ca", "setup-ca.sh")


@app.get("/health", operation_id="health", tags=["util"],
         summary="Liveness check", response_model=HealthResponse)
def health():
    return {"ok": True}


@app.post("/org", operation_id="issueOrgCert", tags=["ca"],
          summary="Issue a business signing certificate", response_model=OrgResponse,
          dependencies=[Depends(require_auth)])
async def create_org_cert(payload: OrgRequest):
    """Issue a signing certificate for a new business (runs the CA script)."""
    slug = str(payload.slug)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", slug):
        raise HTTPException(400, "invalid slug")
    legal = _validate_legal_name(str(payload.legal_name))

    def run():
        return subprocess.run(
            ["bash", CA_SCRIPT, "org", slug, legal],
            capture_output=True, text=True, timeout=60, env={**os.environ},
        )

    r = await run_in_threadpool(run)
    p12 = os.path.join(CA_DIR, "orgs", slug, "signing.p12")
    if not os.path.isfile(p12):
        logger.error("org cert issuance failed for %s: %s", slug, r.stderr or r.stdout)
        raise HTTPException(500, "cert issuance failed")
    return {"ok": True, "slug": slug}


@app.post("/qr", operation_id="renderQr", tags=["util"], summary="Render a proof QR (PNG)",
          response_class=Response,
          dependencies=[Depends(require_auth)],
          responses={200: {"content": {"image/png": {"schema": {"type": "string", "format": "binary"}}},
                           "description": "PNG image."}})
async def qr(payload: QrRequest):
    """Render a QR code (PNG) for a proof URL — used to stamp sealed PDFs."""
    import io
    import qrcode
    data = str(payload.data).strip()
    if not data:
        raise HTTPException(400, "data required")

    def render():
        q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
        q.add_data(data)
        q.make(fit=True)
        img = q.make_image(fill_color="black", back_color="white").convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    png = await run_in_threadpool(render)
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@app.post("/cert/sign", operation_id="signCsr", tags=["ca"],
          summary="Sign a client CSR under a profile", response_model=CertSignResponse,
          dependencies=[Depends(require_auth)])
async def sign_cert(payload: CertSignRequest):
    """CA-as-code: sign a client-supplied CSR under a signing profile.

    The client generates and keeps the private key; we only sign the CSR. Trust
    is self-anchored (our CA isn't in OS/vendor trust stores) — verify via the
    chain + the portal, not automatic OS trust. Profiles: document | code | data.
    """
    import tempfile
    cid = str(payload.id)
    csr_pem = str(payload.csr)
    profile = str(payload.profile)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", cid):
        raise HTTPException(400, "invalid id (a-z, 0-9, -)")
    if "BEGIN CERTIFICATE REQUEST" not in csr_pem:
        raise HTTPException(400, "csr (PEM) required")
    if profile not in ("document", "code", "data"):
        raise HTTPException(400, "profile must be document | code | data")

    def run():
        fd, csr_path = tempfile.mkstemp(suffix=".csr")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(csr_pem)
            return subprocess.run(["bash", CA_SCRIPT, "sign-csr", cid, csr_path, profile, cid],
                                  capture_output=True, text=True, timeout=60, env={**os.environ})
        finally:
            os.unlink(csr_path)

    r = await run_in_threadpool(run)
    crt = os.path.join(CA_DIR, "certs", cid, "signing.crt")
    if not os.path.isfile(crt):
        logger.error("csr signing failed for %s: %s", cid, r.stderr or r.stdout)
        raise HTTPException(500, "signing failed")
    with open(crt) as f:
        cert_pem = f.read()
    with open(os.path.join(CA_DIR, "chain.pem")) as f:
        chain_pem = f.read()
    return {"ok": True, "id": cid, "profile": profile, "certificate": cert_pem, "chain": chain_pem}


@app.post("/seal", operation_id="seal", tags=["sealing"], summary="Seal a PDF",
          response_class=Response,
          dependencies=[Depends(require_auth)],
          responses={200: {"content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}},
                           "description": "The sealed PDF. `X-Letsseal-Sha256` and "
                                          "`X-Letsseal-Cert-CN` headers carry the digest and signer."}})
async def seal(
    request: Request,
    org_slug: str = Form(...),
    reason: str = Form("Document execution"),
    timestamp: bool = Form(True),
    file: UploadFile = File(...),
):
    """Seal an uploaded completed PDF with the org's signing cert."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", org_slug):
        raise HTTPException(400, "invalid org_slug")
    pdf_bytes = await _read_capped(file, request)
    tsa = DEFAULT_TSA_URL if timestamp else None
    p12 = _org_p12(org_slug)
    try:
        res = await run_in_threadpool(seal_pdf, pdf_bytes, p12, P12_PASS,
                                      reason=reason, tsa_url=tsa)
    except Exception:
        logger.exception("sealing failed for org %s", org_slug)
        raise HTTPException(500, "sealing failed")
    headers = {
        "X-Letsseal-Sha256": res.sha256,
        "X-Letsseal-Cert-CN": res.cert_cn,
        "Content-Disposition": 'attachment; filename="sealed.pdf"',
    }
    return Response(content=res.pdf, media_type="application/pdf", headers=headers)


@app.post("/verify", operation_id="verify", tags=["sealing"],
          summary="Verify a sealed PDF", response_model=VerifyResponse,
          dependencies=[Depends(require_auth)])
async def verify(request: Request, file: UploadFile = File(...)):
    """Verify an uploaded PDF against our CA — powers the public portal."""
    pdf_bytes = await _read_capped(file, request)
    sha = hashlib.sha256(pdf_bytes).hexdigest()
    try:
        result = await run_in_threadpool(_verify_bytes, pdf_bytes)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("verify failed")
        return JSONResponse({"sealed": False, "sha256": sha,
                             "reason": "verification error"}, status_code=200)


@app.post("/anchor", operation_id="anchorFile", tags=["anchoring"],
          summary="Anchor a file on Bitcoin", response_model=AnchorResponse,
          dependencies=[Depends(require_auth)])
async def anchor_pdf(request: Request, file: UploadFile = File(...), provider: str = Form(None)):
    """Anchor sha256(pdf) on a decentralized ledger. Returns the proof."""
    pdf_bytes = await _read_capped(file, request)
    try:
        prov = providers.get_provider(provider)
        result = await run_in_threadpool(prov.stamp, pdf_bytes)
        return JSONResponse(result)
    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("anchor failed")
        raise HTTPException(500, "anchor failed")


@app.post("/anchor/hash", operation_id="anchorHash", tags=["anchoring"],
          summary="Anchor a bare digest on Bitcoin", response_model=AnchorResponse,
          dependencies=[Depends(require_auth)])
async def anchor_hash(payload: AnchorHashRequest):
    """Anchor a bare SHA-256 digest on a decentralized ledger (no file upload)."""
    sha = str(payload.sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise HTTPException(400, "sha256 (64 hex chars) required")
    try:
        prov = providers.get_provider(payload.provider)
        result = await run_in_threadpool(prov.stamp_digest, sha)
        return JSONResponse(result)
    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("anchor (hash) failed")
        raise HTTPException(500, "anchor failed")


@app.post("/anchor/upgrade", operation_id="anchorUpgrade", tags=["anchoring"],
          summary="Upgrade a pending anchor", response_model=AnchorResponse,
          dependencies=[Depends(require_auth)])
async def anchor_upgrade(payload: AnchorUpgradeRequest):
    """Given an existing .ots proof (base64), try to upgrade it to a confirmed
    Bitcoin attestation. Returns the (possibly updated) proof + status."""
    ots_b64 = payload.ots_b64
    if not ots_b64:
        raise HTTPException(400, "ots_b64 required")
    try:
        prov = providers.get_provider(payload.provider)
        result = await run_in_threadpool(prov.upgrade, ots_b64)
        return JSONResponse(result)
    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("anchor upgrade failed")
        raise HTTPException(500, "upgrade failed")


def _verify_bytes(pdf_bytes: bytes) -> dict:
    reader = PdfFileReader(BytesIO(pdf_bytes))
    sigs = reader.embedded_signatures
    if not sigs:
        return {"sealed": False, "reason": "no signature found"}
    status = validate_pdf_signature(sigs[0], _validation_context())
    coverage = getattr(status.coverage, "name", str(status.coverage))
    whole_document = coverage == "ENTIRE_FILE"
    covered_intact = bool(status.intact)
    intact = covered_intact and whole_document
    return {
        "sealed": True,
        "intact": intact,
        "covered_intact": covered_intact,
        "whole_document": whole_document,
        "coverage": coverage,
        "valid": status.valid,
        "trusted": status.trusted,
        "authentic": bool(status.valid) and intact and bool(status.trusted),
        "signer": status.signing_cert.subject.human_friendly,
        "signed_at": str(getattr(status, "signer_reported_dt", None)),
    }
