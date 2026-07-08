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
import os
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse
from starlette.concurrency import run_in_threadpool

from seal import seal_pdf, DEFAULT_TSA_URL
import anchor

from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.keys import load_cert_from_pemder

CA_DIR = os.environ.get("DOCSIGNER_CA_DIR", "../ca/out")
P12_PASS = os.environ.get("DOCSIGNER_P12_PASS", "changeit")

app = FastAPI(title="docsigner signing service", version="0.1.0")


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


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/seal")
async def seal(
    org_slug: str = Form(...),
    reason: str = Form("Document execution"),
    timestamp: bool = Form(True),
    file: UploadFile = File(...),
):
    """Seal an uploaded completed PDF with the org's signing cert."""
    pdf_bytes = await file.read()
    tsa = DEFAULT_TSA_URL if timestamp else None
    p12 = _org_p12(org_slug)
    try:
        res = await run_in_threadpool(seal_pdf, pdf_bytes, p12, P12_PASS,
                                      reason=reason, tsa_url=tsa)
    except Exception as e:
        raise HTTPException(500, f"sealing failed: {type(e).__name__}: {e}")
    headers = {
        "X-Docsigner-Sha256": res.sha256,
        "X-Docsigner-Cert-CN": res.cert_cn,
        "Content-Disposition": 'attachment; filename="sealed.pdf"',
    }
    return Response(content=res.pdf, media_type="application/pdf", headers=headers)


@app.post("/verify")
async def verify(file: UploadFile = File(...)):
    """Verify an uploaded PDF against our CA — powers the public portal."""
    pdf_bytes = await file.read()
    sha = hashlib.sha256(pdf_bytes).hexdigest()
    try:
        result = await run_in_threadpool(_verify_bytes, pdf_bytes)
        result["sha256"] = sha
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"sealed": False, "sha256": sha,
                             "reason": f"{type(e).__name__}: {e}"}, status_code=200)


@app.post("/anchor")
async def anchor_pdf(file: UploadFile = File(...)):
    """Timestamp sha256(pdf) on Bitcoin via OpenTimestamps. Returns the proof."""
    pdf_bytes = await file.read()
    try:
        result = await run_in_threadpool(anchor.stamp, pdf_bytes)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(500, f"anchor failed: {type(e).__name__}: {e}")


@app.post("/anchor/upgrade")
async def anchor_upgrade(payload: dict):
    """Given an existing .ots proof (base64), try to upgrade it to a confirmed
    Bitcoin attestation. Returns the (possibly updated) proof + status."""
    ots_b64 = payload.get("ots_b64")
    if not ots_b64:
        raise HTTPException(400, "ots_b64 required")
    try:
        result = await run_in_threadpool(anchor.upgrade, ots_b64)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(500, f"upgrade failed: {type(e).__name__}: {e}")


def _verify_bytes(pdf_bytes: bytes) -> dict:
    reader = PdfFileReader(BytesIO(pdf_bytes))
    sigs = reader.embedded_signatures
    if not sigs:
        return {"sealed": False, "reason": "no signature found"}
    status = validate_pdf_signature(sigs[0], _validation_context())
    return {
        "sealed": True,
        "intact": status.intact,
        "valid": status.valid,
        "trusted": status.trusted,
        "signer": status.signing_cert.subject.human_friendly,
        "signed_at": str(getattr(status, "signer_reported_dt", None)),
    }
