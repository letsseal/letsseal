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
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from urllib.parse import urlparse

OTS_BIN = os.path.join(os.path.dirname(__file__), ".venv", "bin", "ots")

_OTS_HOME = os.environ.get("LETSSEAL_OTS_HOME") or os.path.join(tempfile.gettempdir(), "letsseal-ots-cache")
os.makedirs(_OTS_HOME, exist_ok=True)


def _run(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        [OTS_BIN, *args], capture_output=True, text=True, timeout=timeout,
        env={**os.environ, "HOME": _OTS_HOME},
    )


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

_CALENDAR_HOSTS = {urlparse(c).netloc for c in _CALENDARS}


def _allowed_calendar(url: str) -> bool:
    try:
        u = urlparse(url)
    except Exception:
        return False
    return u.scheme == "https" and u.netloc in _CALENDAR_HOSTS


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


_EXPLORERS = [
    ("mempool.space", "https://mempool.space/api"),
    ("blockstream.info", "https://blockstream.info/api"),
    ("mempool.emzy.de", "https://mempool.emzy.de/api"),
]


def _rev_hex(h: str) -> str:
    return bytes.fromhex(h)[::-1].hex()


def _parse_attestation(info: str) -> tuple[int | None, str | None]:
    """Pull the Bitcoin block height and committed merkle root from `ots info`."""
    m = re.search(r"BitcoinBlockHeaderAttestation\((\d+)\)", info)
    if not m:
        return None, None
    r = re.search(r"Bitcoin block merkle root\s*([0-9a-f]{64})", info)
    return int(m.group(1)), (r.group(1).lower() if r else None)


def _http_get(url: str, timeout: int) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "letsseal-anchor/1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode()


def _explorer_merkleroots(height: int, timeout: int = 12) -> dict[str, str]:
    """Fetch block `height`'s merkle root from each public explorer that answers."""
    roots: dict[str, str] = {}
    for name, base in _EXPLORERS:
        try:
            block_hash = _http_get(f"{base}/block-height/{height}", timeout).strip()
            if not re.fullmatch(r"[0-9a-f]{64}", block_hash):
                continue
            meta = json.loads(_http_get(f"{base}/block/{block_hash}", timeout))
            root = str(meta.get("merkle_root", "")).lower()
            if re.fullmatch(r"[0-9a-f]{64}", root):
                roots[name] = root
        except Exception:
            continue
    return roots


def _verify_block(ots_path: str, file_hash: str | None, info: str, timeout: int = 30) -> int | None:
    """Independently confirm the Bitcoin attestation. Returns the block height
    only on a real match; never raises, fails safe to None (stays 'pending').

    Prefers a local Bitcoin node if one exists (`ots verify` reads the header
    straight from it — zero third-party trust, the gold standard). With no node,
    falls back to cross-checking the attested block's merkle root against >=2
    independent public explorers — the exact field a node would check, from
    sources that must agree. OTS attestations are always many confirmations deep,
    so the block is never near the volatile tip: no reorg risk.
    """
    height, committed = _parse_attestation(info)
    if height is None:
        return None

    if file_hash:
        try:
            r = _run(["verify", "-d", file_hash, ots_path], timeout=timeout)
            out = (r.stdout or "") + (r.stderr or "")
            if r.returncode == 0 and re.search(r"[Bb]itcoin block \d+", out):
                return height
        except Exception:
            pass

    if not committed:
        return None
    want = {committed, _rev_hex(committed)}
    roots = _explorer_merkleroots(height, timeout=min(timeout, 12))
    agree = [name for name, root in roots.items() if root in want or _rev_hex(root) in want]
    return height if len(agree) >= 2 else None


def upgrade(ots_b64: str) -> dict:
    """Ask the calendars whether the Bitcoin tx has confirmed; upgrade if so."""
    ots = base64.b64decode(ots_b64)
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.ots")
        with open(p, "wb") as f:
            f.write(ots)
        pending = re.findall(r"PendingAttestation\('([^']+)'\)", _run(["info", p]).stdout)
        bad = sorted({u for u in pending if not _allowed_calendar(u)})
        if bad:
            raise ValueError(f"refusing to upgrade: proof references non-allowlisted calendar(s): {bad}")
        _run(["upgrade", p])
        with open(p, "rb") as f:
            new_ots = f.read()
        info = _run(["info", p]).stdout
        status = parse_status(info)
        if status.get("state") == "confirmed":
            block = _verify_block(p, status.get("file_sha256"), info)
            if block is not None:
                status["bitcoin_block"] = block
            else:
                status = {"state": "pending", "calendars": [],
                          "file_sha256": status.get("file_sha256")}
        return {"ots_b64": base64.b64encode(new_ots).decode(), "status": status}
