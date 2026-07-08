"""
anchor.py — OpenTimestamps anchoring for sealed documents.

Timestamps a document's SHA-256 on the Bitcoin blockchain via the public
OpenTimestamps calendar servers. This is a *decentralized, free* proof of
existence + date that anyone can verify without trusting docsigner:

  seal (own CA)  -> proves integrity + who sealed it
  anchor (OTS)   -> proves it existed by a certain date, on Bitcoin
  portal         -> ties them together

The calendars batch thousands of hashes (from everyone globally) into a single
Bitcoin transaction, so this costs us nothing. A fresh proof is "pending" until
that transaction confirms (~a few hours), after which `upgrade` fills in the
Bitcoin block attestation.

The `.ots` proof is self-contained: hand it + the PDF to anyone and they can
verify independently with `ots verify` against their own Bitcoin node.
"""
from __future__ import annotations

import base64
import os
import re
import subprocess
import tempfile

OTS_BIN = os.path.join(os.path.dirname(__file__), ".venv", "bin", "ots")


def _run(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run([OTS_BIN, *args], capture_output=True, text=True, timeout=timeout)


def parse_status(info: str) -> dict:
    """Turn `ots info` output into a compact status."""
    file_hash = None
    mh = re.search(r"File sha256 hash:\s*([0-9a-f]{64})", info)
    if mh:
        file_hash = mh.group(1)
    m = re.search(r"BitcoinBlockHeaderAttestation\((\d+)\)", info)
    if m:
        return {"state": "confirmed", "bitcoin_block": int(m.group(1)), "file_sha256": file_hash}
    cals = sorted(set(re.findall(r"PendingAttestation\('([^']+)'\)", info)))
    return {"state": "pending", "calendars": cals, "file_sha256": file_hash}


def stamp(pdf_bytes: bytes) -> dict:
    """Submit sha256(pdf) to the OTS calendars; returns the .ots proof + status."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc")
        with open(p, "wb") as f:
            f.write(pdf_bytes)
        r = _run(["stamp", p])
        ots_path = p + ".ots"
        if not os.path.exists(ots_path):
            raise RuntimeError(f"ots stamp failed: {r.stderr or r.stdout}")
        with open(ots_path, "rb") as f:
            ots = f.read()
        info = _run(["info", ots_path]).stdout
        return {"ots_b64": base64.b64encode(ots).decode(), "status": parse_status(info)}


def upgrade(ots_b64: str) -> dict:
    """Ask the calendars whether the Bitcoin tx has confirmed; upgrade if so."""
    ots = base64.b64decode(ots_b64)
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.ots")
        with open(p, "wb") as f:
            f.write(ots)
        _run(["upgrade", p])
        with open(p, "rb") as f:
            new_ots = f.read()
        info = _run(["info", p]).stdout
        return {"ots_b64": base64.b64encode(new_ots).decode(), "status": parse_status(info)}
