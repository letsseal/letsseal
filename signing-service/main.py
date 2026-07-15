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


_CN_FOLD = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "‐": "-", "‑": "-", "‒": "-", "–": "-",
    "—": "-", "―": "-", "−": "-",
    "…": "...", " ": " ", " ": " ", " ": " ",
})


def _validate_legal_name(legal: str) -> str:
    """Validate a caller-supplied legal name before it reaches the CA's subject
    DN. Folds typographic punctuation to ASCII, rejects DN-injection
    metacharacters (`/`, newlines, backslash, NUL), and guarantees the result is
    latin-1-encodable so it can safely ride in the signer-CN response header."""
    legal = legal.strip().translate(_CN_FOLD)
    if not legal:
        raise HTTPException(400, "legal_name required")
    if _DN_BAD.search(legal):
        raise HTTPException(400, "legal_name contains invalid characters")
    try:
        legal.encode("latin-1")
    except UnicodeEncodeError:
        raise HTTPException(400, "legal_name contains characters not yet supported in signing certificates")
    return legal


_DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$")


def _validate_domain(domain: str) -> str:
    domain = domain.strip().lower().rstrip(".")
    if not _DOMAIN_RE.match(domain):
        raise HTTPException(400, "invalid domain")
    return domain


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
The Let's Seal signing service is the keyed core of Let's Seal — the open standard
for sealing anything, self-hostable and free. *The "Let's Encrypt for documents."*

Open standards, end to end:

* **PAdES / X.509** for the cryptographic seal (via pyHanko + an on-prem CA)
* **OpenTimestamps** for a free Bitcoin anchor proving a file existed by a date
* **SHA-256** everywhere; hash-only endpoints so a file never has to leave the caller

**Trust is self-anchored.** A proof stands on the published root, open standards,
and the public blockchain — authenticity anyone can verify, backed by a published
root.

⚠️ **Runs localhost/private only — it holds signing keys.** The public, rate-limited
surface lives in the app tier in front of it.
"""

TAGS = [
    {"name": "sealing", "description": "Apply and verify PAdES seals on PDFs."},
    {"name": "anchoring", "description": "Timestamp a file or digest on Bitcoin via OpenTimestamps."},
    {"name": "ca", "description": "CA-as-code: issue org and per-client signing certificates."},
    {"name": "identity", "description": "Seal under a third-party-verified identity (Sign in with Google/GitHub/OIDC)."},
    {"name": "util", "description": "Health and rendering helpers."},
]

_PROD = os.environ.get("LETSSEAL_ENV", "").lower() in ("production", "prod")

app = FastAPI(
    title="Let's Seal signing service",
    version="0.1.0",
    description=API_DESCRIPTION,
    openapi_tags=TAGS,
    license_info={"name": "Apache-2.0", "url": "https://opensource.org/licenses/Apache-2.0"},
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


class OrgReissueRequest(BaseModel):
    slug: str = Field(..., description="URL-safe business slug (a-z, 0-9, -).", examples=["acme"])
    legal_name: str = Field(..., description="Legal entity name for the cert subject.", examples=["Acme Ltd"])
    domain: str | None = Field(None, description="Verified domain to bind as a dNSName SAN. Omit/null to unbind (unverified).", examples=["acme.co.uk"])


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


def _org_code_p12(org_slug: str) -> str:
    path = os.path.join(CA_DIR, "orgs", org_slug, "signing-code.p12")
    if not os.path.isfile(path):
        raise HTTPException(404, f"No code-signing cert issued for org '{org_slug}' "
                                 f"(run: setup-ca.sh org-code {org_slug} \"<name>\")")
    return path


def _log_p12() -> str:
    path = os.path.join(CA_DIR, "certs", "_log", "signing.p12")
    if not os.path.isfile(path):
        raise HTTPException(503, "transparency log signing key not provisioned "
                                 "(run: setup-ca.sh cert _log \"Lets Seal Transparency Log\" data)")
    return path


def _identity_issuer_p12() -> str:
    path = os.path.join(CA_DIR, "certs", "_identity", "issuer.p12")
    if not os.path.isfile(path):
        raise HTTPException(503, "identity issuer not provisioned "
                                 "(run: setup-ca.sh identity-init)")
    return path


def _validation_context() -> ValidationContext:
    root = load_cert_from_pemder(os.path.join(CA_DIR, "root-ca.crt"))
    inter = load_cert_from_pemder(os.path.join(CA_DIR, "intermediate.crt"))
    return ValidationContext(trust_roots=[root], other_certs=[inter],
                             allow_fetching=False, revocation_mode="soft-fail")


def _ca_intermediate_pem() -> str:
    """Our own intermediate cert(s). The digest-based verify endpoints complete a
    leaf's chain to the pinned root with this, so a caller only ever has to upload
    the signer's leaf `.pem` — never the intermediate. (Third-party verifiers like
    cosign still need the separate chain file, which the seal response provides.)"""
    try:
        with open(os.path.join(CA_DIR, "intermediate.crt")) as f:
            return f.read()
    except OSError:
        return ""


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


@app.post("/org/reissue", operation_id="reissueOrgCert", tags=["ca"],
          summary="Re-issue a business signing cert, binding a verified-domain SAN",
          response_model=OrgResponse, dependencies=[Depends(require_auth)])
async def reissue_org_cert(payload: OrgReissueRequest):
    """Re-issue an org's document signing cert, binding a verified domain as a
    dNSName SAN (Phase 3). The org's identity then lives in the certificate itself
    — an off-platform verifier reads `DNS:<domain>` from the raw cert, not just our
    proof page. Pass `domain=null` to unbind (drops the DNS SAN). The org key is
    preserved across re-issues, so its identity is stable."""
    slug = str(payload.slug)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", slug):
        raise HTTPException(400, "invalid slug")
    legal = _validate_legal_name(str(payload.legal_name))
    args = ["bash", CA_SCRIPT, "reissue-org", slug, legal]
    if payload.domain:
        args.append(_validate_domain(str(payload.domain)))

    def run():
        return subprocess.run(args, capture_output=True, text=True, timeout=60, env={**os.environ})

    r = await run_in_threadpool(run)
    p12 = os.path.join(CA_DIR, "orgs", slug, "signing.p12")
    if not os.path.isfile(p12):
        logger.error("org cert reissue failed for %s: %s", slug, r.stderr or r.stdout)
        raise HTTPException(500, "cert reissue failed")
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


class SealDetachedRequest(BaseModel):
    sha256: str = Field(..., description="Lowercase hex SHA-256 of the file to seal.")
    org_slug: str = Field(..., description="Issuing business slug (must have a signing cert).")


@app.post("/seal/detached", operation_id="sealDetached", tags=["sealing"],
          summary="Detached CAdES/CMS seal over a file digest",
          dependencies=[Depends(require_auth)])
async def seal_detached(payload: SealDetachedRequest):
    """Seal ANY file: a detached CMS signature over its SHA-256, chaining to the
    root. Digest-only — the file never leaves the caller. Pair with `/anchor/hash`
    for the Bitcoin timestamp; together they are the full SEAL for a non-PDF."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    sha = str(payload.sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise HTTPException(400, "sha256 (64 hex) required")
    slug = str(payload.org_slug)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", slug):
        raise HTTPException(400, "invalid org_slug")
    p12 = _org_p12(slug)
    from detached import sign_detached_digest, _detached_signer
    import base64 as _b64
    try:
        sig_b64 = await run_in_threadpool(sign_detached_digest, sha, p12, P12_PASS)
    except Exception:
        logger.exception("detached seal failed for org %s", slug)
        raise HTTPException(500, "detached seal failed")
    cert_cn = _detached_signer(_b64.b64decode(sig_b64))
    return JSONResponse({"sha256": sha, "sig_b64": sig_b64, "cert_cn": cert_cn})


@app.post("/verify/detached", operation_id="verifyDetached", tags=["sealing"],
          summary="Verify a detached CAdES/CMS seal", dependencies=[Depends(require_auth)])
async def verify_detached_ep(request: Request, file: UploadFile = File(...), sig: UploadFile = File(...)):
    """Verify a detached seal: the file's bytes + its `.sig`, against our root.
    Powers the public portal for any non-PDF artifact."""
    file_bytes = await _read_capped(file, request)
    sig_bytes = await sig.read()
    if len(sig_bytes) > 1_000_000:
        raise HTTPException(413, "signature too large")
    sha = hashlib.sha256(file_bytes).hexdigest()
    from detached import verify_detached_bytes
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_detached_bytes, file_bytes, sig_bytes, root)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("detached verify failed")
        return JSONResponse({"sealed": True, "detached": True, "valid": False,
                             "trusted": False, "sha256": sha, "reason": "verification error"},
                            status_code=200)


@app.post("/seal/blob", operation_id="sealBlob", tags=["sealing"],
          summary="cosign-compatible signature over a file digest",
          dependencies=[Depends(require_auth)])
async def seal_blob(payload: SealDetachedRequest):
    """Seal an artifact for the supply-chain lane: a raw ECDSA-P256 signature over
    its SHA-256 plus the org's codeSigning leaf cert, in cosign's flat
    signature+certificate form. Digest-only — the artifact never leaves the caller.
    Verifies with `sealbot verify`, `openssl`, and stock `cosign verify-blob`."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    sha = str(payload.sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise HTTPException(400, "sha256 (64 hex) required")
    slug = str(payload.org_slug)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", slug):
        raise HTTPException(400, "invalid org_slug")
    p12 = _org_code_p12(slug)
    from blobsign import sign_blob_digest
    try:
        res = await run_in_threadpool(sign_blob_digest, sha, p12, P12_PASS)
    except Exception:
        logger.exception("blob seal failed for org %s", slug)
        raise HTTPException(500, "blob seal failed")
    return JSONResponse({"sha256": sha, **res})


@app.post("/verify/blob", operation_id="verifyBlob", tags=["sealing"],
          summary="Verify a cosign-format blob signature", dependencies=[Depends(require_auth)])
async def verify_blob_ep(request: Request, file: UploadFile = File(...),
                         sig: UploadFile = File(...), cert: UploadFile = File(...)):
    """Verify a supply-chain blob seal: the artifact's bytes + its base64 `.sig` +
    the signer's `.pem` (leaf, optionally with chain), against our root."""
    file_bytes = await _read_capped(file, request)
    sig_b64 = (await sig.read()).decode("ascii", "ignore").strip()
    cert_pem = (await cert.read()).decode("ascii", "ignore")
    if len(sig_b64) > 100_000 or len(cert_pem) > 1_000_000:
        raise HTTPException(413, "signature or cert too large")
    sha = hashlib.sha256(file_bytes).hexdigest()
    from blobsign import verify_blob_digest
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_blob_digest, sha, sig_b64, cert_pem, root,
                                          cert_pem + "\n" + _ca_intermediate_pem())
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("blob verify failed")
        return JSONResponse({"sealed": True, "blob": True, "valid": False,
                             "trusted": False, "sha256": sha, "reason": "verification error"},
                            status_code=200)


class SealIdentityRequest(BaseModel):
    sha256: str = Field(..., description="Lowercase hex SHA-256 of the artifact to seal.")
    provider: str = Field(..., description="OIDC provider id: google | microsoft | apple | github | <configured>.",
                          examples=["google", "github"])
    token: str = Field(..., description="The provider's proof: an OIDC ID token (JWT) for OIDC providers, "
                                        "or a GitHub OAuth access token for provider=github. Verified here "
                                        "against the provider before any cert is minted.")


@app.get("/identity/providers", operation_id="identityProviders", tags=["identity"],
         summary="List enabled OIDC identity providers", dependencies=[Depends(require_auth)])
async def identity_providers_ep():
    """The identity providers this service is configured for (those with an OAuth
    client id set). The web tier reads this to render only the sign-in buttons
    that will actually work."""
    from oidc import enabled_providers
    return JSONResponse({"providers": enabled_providers()})


@app.post("/seal/identity", operation_id="sealIdentity", tags=["identity"],
          summary="Seal a digest under a provider-verified identity",
          dependencies=[Depends(require_auth)])
async def seal_identity(payload: SealIdentityRequest):
    """Verify a Google/GitHub/OIDC proof, mint a short-lived leaf binding the
    provider-verified email, and sign the artifact's SHA-256 with it. Digest-only
    — the artifact never leaves the caller. Verifies with `sealbot verify` and
    stock `cosign verify-blob --certificate-identity <email>`.

    We never assert identity ourselves: the seal records that the *provider*
    verified the signer's control of that email at seal time."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    sha = str(payload.sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise HTTPException(400, "sha256 (64 hex) required")
    provider = str(payload.provider).strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,30}", provider):
        raise HTTPException(400, "invalid provider")
    p12 = _identity_issuer_p12()
    from oidc import verify_oidc, verify_github, IdentityError
    from identity import issue_and_sign

    def run():
        if provider == "github":
            who = verify_github(payload.token)
        else:
            who = verify_oidc(provider, payload.token)
        return who, issue_and_sign(sha, who["email"], who["issuer"], who["provider"],
                                   p12, P12_PASS, who.get("account_url", ""))

    try:
        who, res = await run_in_threadpool(run)
    except IdentityError as e:
        logger.warning("identity proof rejected (%s): %s", provider, e)
        raise HTTPException(401, "identity proof did not verify")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("identity seal failed (%s)", provider)
        raise HTTPException(500, "identity seal failed")
    return JSONResponse({"sha256": sha, **res})


@app.post("/verify/identity", operation_id="verifyIdentity", tags=["identity"],
          summary="Verify an identity seal", dependencies=[Depends(require_auth)])
async def verify_identity_ep(request: Request, file: UploadFile = File(...),
                             sig: UploadFile = File(...), cert: UploadFile = File(...)):
    """Verify an identity seal: the artifact's bytes + its base64 `.sig` + the
    signer's `.pem`, against our root — and surface WHO signed (the verified
    email) and WHO vouched (the OIDC issuer recorded at issuance)."""
    file_bytes = await _read_capped(file, request)
    sig_b64 = (await sig.read()).decode("ascii", "ignore").strip()
    cert_pem = (await cert.read()).decode("ascii", "ignore")
    if len(sig_b64) > 100_000 or len(cert_pem) > 1_000_000:
        raise HTTPException(413, "signature or cert too large")
    sha = hashlib.sha256(file_bytes).hexdigest()
    from identity import verify_identity_digest
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_identity_digest, sha, sig_b64, cert_pem, root,
                                          cert_pem + "\n" + _ca_intermediate_pem())
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("identity verify failed")
        return JSONResponse({"sealed": True, "identity_seal": True, "valid": False,
                             "trusted": False, "sha256": sha, "reason": "verification error"},
                            status_code=200)


class AttestRequest(BaseModel):
    sha256: str = Field(..., description="Lowercase hex SHA-256 of the artifact the attestation is about.")
    org_slug: str = Field(..., description="Issuing business slug (must have a code-signing cert).")
    predicate: dict = Field(..., description="The claim object: an SBOM (SPDX/CycloneDX), SLSA provenance, vuln scan, etc.")
    predicate_type: str = Field("custom", description="Short type (spdxjson|cyclonedx|slsaprovenance|vuln|custom) or a full predicateType URI.")
    subject_name: str = Field("artifact", description="Human name for the subject (informational; the digest is what's bound).")


@app.post("/attest", operation_id="attest", tags=["sealing"],
          summary="Sign a DSSE/in-toto attestation (SBOM / provenance) over a digest",
          dependencies=[Depends(require_auth)])
async def attest_ep(payload: AttestRequest):
    """Sign an in-toto/DSSE attestation binding a predicate (SBOM, SLSA provenance,
    vuln scan) to an artifact's SHA-256, with the org's codeSigning leaf. Digest-only
    — the artifact never leaves the caller. The returned `bundle` verifies with stock
    `cosign verify-blob-attestation --bundle att.bundle --key signer.pub --type <type>
    --insecure-ignore-tlog`, and with `sealbot` via the cert chain to our root."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    sha = str(payload.sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise HTTPException(400, "sha256 (64 hex) required")
    slug = str(payload.org_slug)
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", slug):
        raise HTTPException(400, "invalid org_slug")
    p12 = _org_code_p12(slug)
    from attest import sign_attestation
    try:
        res = await run_in_threadpool(sign_attestation, sha, payload.predicate,
                                      str(payload.predicate_type), p12, P12_PASS,
                                      str(payload.subject_name))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("attestation signing failed for org %s", slug)
        raise HTTPException(500, "attestation signing failed")
    return JSONResponse({"sha256": sha, **res})


@app.post("/verify/attest", operation_id="verifyAttest", tags=["sealing"],
          summary="Verify a DSSE/in-toto attestation", dependencies=[Depends(require_auth)])
async def verify_attest_ep(request: Request, file: UploadFile = File(...),
                           bundle: UploadFile = File(...), cert: UploadFile = File(...)):
    """Verify a supply-chain attestation: the artifact's bytes + its DSSE `bundle`
    + the signer's `.pem`, against our root — and confirm the attestation's subject
    digest matches the uploaded artifact (claims check)."""
    import json as _json
    file_bytes = await _read_capped(file, request)
    bundle_raw = (await bundle.read()).decode("utf-8", "ignore")
    cert_pem = (await cert.read()).decode("ascii", "ignore")
    if len(bundle_raw) > 5_000_000 or len(cert_pem) > 1_000_000:
        raise HTTPException(413, "bundle or cert too large")
    sha = hashlib.sha256(file_bytes).hexdigest()
    from attest import verify_attestation
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        bundle_json = _json.loads(bundle_raw)
        result = await run_in_threadpool(verify_attestation, bundle_json, cert_pem, root,
                                          cert_pem + "\n" + _ca_intermediate_pem(), sha)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("attestation verify failed")
        return JSONResponse({"sealed": True, "attestation": True, "valid": False,
                             "trusted": False, "sha256": sha, "reason": "verification error"},
                            status_code=200)


class SignSthRequest(BaseModel):
    tree_size: int = Field(..., ge=0, description="Number of leaves the head covers.")
    root_hash: str = Field(..., description="Lowercase hex SHA-256 Merkle root.")
    ts: int = Field(..., ge=0, description="Timestamp (ms) the head is signed at.")


@app.post("/log/sth/sign", operation_id="signSth", tags=["log"],
          summary="Sign a transparency-log Signed Tree Head",
          dependencies=[Depends(require_auth)])
async def sign_sth_ep(payload: SignSthRequest):
    """Sign a Signed Tree Head with the system log key. Internal — the web app
    owns the log and computes the root; this authenticates it."""
    from translog import sign_sth
    p12 = _log_p12()
    try:
        res = await run_in_threadpool(sign_sth, payload.tree_size, str(payload.root_hash),
                                      int(payload.ts), p12, P12_PASS)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("STH signing failed")
        raise HTTPException(500, "STH signing failed")
    return JSONResponse(res)


@app.get("/log/cert", operation_id="logCert", tags=["log"],
         summary="The transparency-log public cert + chain",
         dependencies=[Depends(require_auth)])
async def log_cert_ep():
    """The log signing cert + chain (public, no key). Published so STH signatures
    are self-verifiable."""
    from translog import log_cert
    p12 = _log_p12()
    try:
        return JSONResponse(await run_in_threadpool(log_cert, p12, P12_PASS))
    except Exception:
        logger.exception("log cert fetch failed")
        raise HTTPException(500, "log cert fetch failed")


@app.post("/seal/c2pa", operation_id="sealC2pa", tags=["sealing"],
          summary="Seal an image with an embedded C2PA manifest", response_class=Response,
          dependencies=[Depends(require_auth)],
          responses={200: {"content": {"image/*": {"schema": {"type": "string", "format": "binary"}}},
                           "description": "The signed image (Content Credentials embedded). "
                                          "`X-Letsseal-Sha256`, `X-Letsseal-Cert-CN` and "
                                          "`X-Letsseal-Format` headers carry the digest, signer and MIME."}})
async def seal_c2pa(
    request: Request,
    org_slug: str = Form(...),
    title: str = Form(None),
    file: UploadFile = File(...),
):
    """Embed a C2PA (Content Credentials) manifest signed by the org cert into an
    image, chaining to the same root. The image is rewritten (the manifest lives
    inside it), so the bytes are uploaded; time comes from a separate anchor."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", org_slug):
        raise HTTPException(400, "invalid org_slug")
    data = await _read_capped(file, request)
    from c2pa_seal import mime_for, sign_c2pa
    mime = mime_for(file.filename, data)
    if not mime:
        raise HTTPException(400, "unsupported media format (images: jpeg/png/webp/tiff/gif/avif/heic; "
                                 "video: mp4/mov; audio: mp3/flac/m4a)")
    p12 = _org_p12(org_slug)
    try:
        signed, cn = await run_in_threadpool(sign_c2pa, data, mime, p12, P12_PASS, title)
    except Exception:
        logger.exception("c2pa seal failed for org %s", org_slug)
        raise HTTPException(500, "c2pa seal failed")
    sha = hashlib.sha256(signed).hexdigest()
    return Response(content=signed, media_type=mime, headers={
        "X-Letsseal-Sha256": sha, "X-Letsseal-Cert-CN": cn, "X-Letsseal-Format": mime,
    })


@app.post("/verify/c2pa", operation_id="verifyC2pa", tags=["sealing"],
          summary="Verify an image's embedded C2PA manifest", dependencies=[Depends(require_auth)])
async def verify_c2pa_ep(request: Request, file: UploadFile = File(...)):
    """Verify an image's embedded Content Credentials against our root."""
    data = await _read_capped(file, request)
    sha = hashlib.sha256(data).hexdigest()
    from c2pa_seal import mime_for, verify_c2pa
    mime = mime_for(file.filename, data)
    if not mime:
        return JSONResponse({"sealed": False, "c2pa": True, "valid": False, "trusted": False,
                             "sha256": sha, "reason": "not a supported image format"})
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_c2pa, data, mime, root)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("c2pa verify failed")
        return JSONResponse({"sealed": True, "c2pa": True, "valid": False, "trusted": False,
                             "sha256": sha, "reason": "verification error"})


@app.post("/seal/xml", operation_id="sealXml", tags=["sealing"],
          summary="Seal an XML document with an enveloped XML-DSig signature",
          response_class=Response, dependencies=[Depends(require_auth)],
          responses={200: {"content": {"application/xml": {"schema": {"type": "string", "format": "binary"}}},
                           "description": "The signed XML (enveloped signature embedded). "
                                          "`X-Letsseal-Sha256` and `X-Letsseal-Cert-CN` headers "
                                          "carry the signed-document digest and signer."}})
async def seal_xml(request: Request, org_slug: str = Form(...), file: UploadFile = File(...)):
    """Embed an enveloped W3C XML Signature signed by the org cert into an XML
    document, chaining to the same root. The document is rewritten (the signature
    lives inside it); time comes from a separate anchor on the signed bytes."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", org_slug):
        raise HTTPException(400, "invalid org_slug")
    data = await _read_capped(file, request)
    from xmldsig import sign_xml
    p12 = _org_p12(org_slug)
    try:
        signed, cn = await run_in_threadpool(sign_xml, data, p12, P12_PASS)
    except Exception:
        logger.exception("xml seal failed for org %s", org_slug)
        raise HTTPException(400, "could not sign (is this well-formed XML?)")
    sha = hashlib.sha256(signed).hexdigest()
    return Response(content=signed, media_type="application/xml", headers={
        "X-Letsseal-Sha256": sha, "X-Letsseal-Cert-CN": cn,
    })


@app.post("/verify/xml", operation_id="verifyXml", tags=["sealing"],
          summary="Verify an XML document's enveloped XML-DSig signature",
          dependencies=[Depends(require_auth)])
async def verify_xml_ep(request: Request, file: UploadFile = File(...)):
    """Verify an XML document's enveloped signature against our root."""
    data = await _read_capped(file, request)
    sha = hashlib.sha256(data).hexdigest()
    from xmldsig import verify_xml
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_xml, data, root)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("xml verify failed")
        return JSONResponse({"sealed": True, "xmldsig": True, "valid": False, "trusted": False,
                             "sha256": sha, "reason": "verification error"})


@app.post("/seal/smime", operation_id="sealSmime", tags=["sealing"],
          summary="Seal an email message with an S/MIME signature",
          response_class=Response, dependencies=[Depends(require_auth)],
          responses={200: {"content": {"message/rfc822": {"schema": {"type": "string", "format": "binary"}}},
                           "description": "The signed message as a `multipart/signed` .eml. "
                                          "`X-Letsseal-Sha256` and `X-Letsseal-Cert-CN` headers "
                                          "carry the signed-message digest and signer."}})
async def seal_smime(request: Request, org_slug: str = Form(...), file: UploadFile = File(...)):
    """Wrap a mail message in a standards-conformant S/MIME `multipart/signed`
    envelope signed by the org cert, chaining to the same root. Same CMS crypto as
    the detached seal, delivered in the form mail clients speak."""
    if not P12_PASS:
        raise HTTPException(503, "signing not configured")
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,62}$", org_slug):
        raise HTTPException(400, "invalid org_slug")
    data = await _read_capped(file, request)
    from smime import sign_smime
    p12 = _org_p12(org_slug)
    try:
        signed, cn = await run_in_threadpool(sign_smime, data, p12, P12_PASS)
    except Exception:
        logger.exception("smime seal failed for org %s", org_slug)
        raise HTTPException(400, "could not sign message")
    sha = hashlib.sha256(signed).hexdigest()
    return Response(content=signed, media_type="message/rfc822", headers={
        "X-Letsseal-Sha256": sha, "X-Letsseal-Cert-CN": cn,
    })


@app.post("/verify/smime", operation_id="verifySmime", tags=["sealing"],
          summary="Verify an S/MIME signed email message",
          dependencies=[Depends(require_auth)])
async def verify_smime_ep(request: Request, file: UploadFile = File(...)):
    """Verify an S/MIME `multipart/signed` message against our root."""
    data = await _read_capped(file, request)
    sha = hashlib.sha256(data).hexdigest()
    from smime import verify_smime
    root = os.path.join(CA_DIR, "root-ca.crt")
    try:
        result = await run_in_threadpool(verify_smime, data, root)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception:
        logger.exception("smime verify failed")
        return JSONResponse({"sealed": True, "smime": True, "valid": False, "trusted": False,
                             "sha256": sha, "reason": "verification error"})


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
