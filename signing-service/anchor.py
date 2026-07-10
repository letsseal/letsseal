"""
anchor.py — OpenTimestamps anchoring for sealed documents.

Timestamps a document's SHA-256 on the Bitcoin blockchain via the public
OpenTimestamps calendar servers. This is a *decentralized, free* proof of
existence + date that anyone can verify without trusting Let's Seal:

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


_CALENDARS = [
    "https://alice.btc.calendar.opentimestamps.org",
    "https://bob.btc.calendar.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
    "https://btc.calendar.catallaxy.com",
]


def stamp_digest(hex_digest: str, timeout: int = 20) -> dict:
    """Timestamp a *bare* SHA-256 digest on Bitcoin — no file needed.

    This is the privacy-preserving 'anchor anything' primitive: the caller
    hashes their file locally and sends only the 32-byte digest. The resulting
    .ots proof still validates with `ots verify <original-file>`, because the
    digest we stamp IS that file's SHA-256. Replicates the official client's
    single-file stamp path (nonce + calendar submission) via the library.
    """
    from opentimestamps.core.timestamp import Timestamp, DetachedTimestampFile
    from opentimestamps.core.op import OpSHA256, OpAppend
    from opentimestamps.core.serialize import BytesSerializationContext
    from opentimestamps.calendar import RemoteCalendar

    hex_digest = hex_digest.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", hex_digest):
        raise ValueError("expected a 64-character SHA-256 hex digest")

    dt = DetachedTimestampFile(OpSHA256(), Timestamp(bytes.fromhex(hex_digest)))
    root = dt.timestamp.ops.add(OpAppend(os.urandom(16))).ops.add(OpSHA256())
    cals: list[str] = []
    for url in _CALENDARS:
        try:
            root.merge(RemoteCalendar(url).submit(root.msg, timeout=timeout))
            cals.append(url)
        except Exception:
            continue
    if not cals:
        raise RuntimeError("no OpenTimestamps calendar accepted the timestamp")

    ctx = BytesSerializationContext()
    dt.serialize(ctx)
    return {
        "ots_b64": base64.b64encode(ctx.getbytes()).decode(),
        "status": {"state": "pending", "calendars": cals, "file_sha256": hex_digest},
    }


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


def _verify_block(ots_path: str, file_hash: str | None, timeout: int = 30) -> int | None:
    """Confirm a Bitcoin attestation by actually running `ots verify` (against
    the default block explorer), not by trusting the attestation string in
    `ots info`. Returns the block height only when verification truly succeeds.

    Fails safe: any failure — non-zero rc, unparseable output, timeout, or an
    unreachable explorer/node (offline) — returns None so the caller stays
    'pending' rather than falsely confirming. Never raises.
    """
    if not file_hash:
        return None
    try:
        r = _run(["verify", "-d", file_hash, ots_path], timeout=timeout)
    except Exception:
        return None
    out = (r.stdout or "") + (r.stderr or "")
    m = re.search(r"[Bb]itcoin block (\d+)", out)
    if r.returncode == 0 and m:
        return int(m.group(1))
    return None


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
        status = parse_status(info)
        if status.get("state") == "confirmed":
            block = _verify_block(p, status.get("file_sha256"))
            if block is not None:
                status["bitcoin_block"] = block
            else:
                status = {"state": "pending", "calendars": [],
                          "file_sha256": status.get("file_sha256")}
        return {"ots_b64": base64.b64encode(new_ots).decode(), "status": status}
