"""
revocation.py: the answer to "this certificate should not be trusted any more".

Until this existed, a Let's Seal certificate could not be withdrawn. Org certs are
issued for five years, the verifier ran with revocation checking off
(`revocation_mode="soft-fail"`, `allow_fetching=False`), and no CRL or OCSP
responder was published anywhere. So if an org's signing key leaked, or an org was
suspended for impersonating someone, every seal it had ever issued kept verifying
as `trusted`, forever. Suspension only stopped NEW seals at the app tier; the
cryptography went on saying yes.

Why not a classic CRL or OCSP:

  * Our CA is self-anchored. Nothing consults an OS trust store or an AIA
    extension for it, so publishing a DER CRL at a URL nobody fetches would be
    ceremony rather than a control. What actually verifies a Let's Seal proof is
    this service and the published spec verifier, and both can read this directly.
  * OCSP needs a live responder, which makes verification depend on us being
    online. The whole promise is that a proof stands without us.

So: a small, signed, PUBLISHED list. It is fetched once, cached, and its integrity
comes from a signature by the log key rather than from the transport.

REVOCATION AND TIME. This is the part that is easy to get wrong in a way that
destroys honest evidence. A revocation must not silently invalidate documents that
were legitimately sealed years earlier, so the reason decides:

  * key_compromise    the key is in someone else's hands and we cannot know since
                      when, so EVERY seal under that certificate is untrusted,
                      whatever its date.
  * superseded,
    cessation,
    affiliation_changed
                      the key was retired in good order. Seals made BEFORE the
                      revocation date remain trusted; later ones do not. Let's Seal
                      is unusually well placed to apply this correctly, because a
                      Bitcoin anchor is independent evidence of when the document
                      existed (see `sealed_before`).

An unknown reason is treated as key_compromise. Failing towards "untrusted" is the
only safe direction for a trust product.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)

_UNCONDITIONAL = {"key_compromise", "ca_compromise", "unspecified"}

_TIME_BOUNDED = {"superseded", "cessation_of_operation", "affiliation_changed", "privilege_withdrawn"}

VALID_REASONS = sorted(_UNCONDITIONAL | _TIME_BOUNDED)


def _revocations_path() -> str:
    ca_dir = os.environ.get("LETSSEAL_CA_DIR", "../ca/out")
    return os.path.join(ca_dir, "revoked.json")


_cache: dict = {"mtime": 0.0, "entries": {}}
_lock = threading.Lock()


def _normalise_serial(serial: int | str) -> str:
    """Serials are compared as lowercase hex with no leading zeros, so the same
    certificate matches whether it arrived as an int (cryptography), a colon-
    separated openssl string, or hex from the JSON file."""
    if isinstance(serial, int):
        return format(serial, "x")
    s = str(serial).strip().lower().replace(":", "").replace(" ", "")
    if s.startswith("0x"):
        s = s[2:]
    s = s.lstrip("0")
    return s or "0"


def load() -> dict[str, dict]:
    """The revocation entries, keyed by normalised serial. Re-read when the file
    changes on disk, so revoking a certificate takes effect without a restart."""
    path = _revocations_path()
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        with _lock:
            _cache["mtime"] = 0.0
            _cache["entries"] = {}
        return {}

    with _lock:
        if mtime == _cache["mtime"]:
            return _cache["entries"]

    try:
        with open(path) as f:
            doc = json.load(f)
    except (OSError, ValueError):
        with _lock:
            return _cache["entries"]

    entries: dict[str, dict] = {}
    for e in doc.get("revoked", []):
        serial = _normalise_serial(e.get("serial", ""))
        if not serial:
            continue
        reason = str(e.get("reason", "unspecified")).strip().lower()
        entries[serial] = {
            "serial": serial,
            "reason": reason if reason in VALID_REASONS else "unspecified",
            "revoked_at": str(e.get("revoked_at", "")),
            "subject": str(e.get("subject", "")),
            "note": str(e.get("note", "")),
        }

    with _lock:
        _cache["mtime"] = mtime
        _cache["entries"] = entries
    return entries


def _parse_iso(ts: str) -> Optional[float]:
    if not ts:
        return None
    try:
        import datetime
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None


def check(serial: int | str, sealed_before: Optional[float] = None) -> Optional[dict]:
    """Is this certificate revoked in a way that should stop us trusting a seal?

    `sealed_before` is a Unix timestamp that the seal provably predates, which for
    Let's Seal means a confirmed Bitcoin anchor: independent evidence, not our own
    word, and the only kind worth honouring here. Pass None when there is no such
    proof, in which case any revocation counts against the seal.

    Returns the revocation entry when the seal must NOT be trusted, or None.
    """
    entry = load().get(_normalise_serial(serial))
    if entry is None:
        return None

    if entry["reason"] in _UNCONDITIONAL:
        return entry

    revoked_at = _parse_iso(entry["revoked_at"])
    if sealed_before is not None and revoked_at is not None and sealed_before < revoked_at:
        return None
    return entry


def check_chain(certs, sealed_before: Optional[float] = None) -> Optional[dict]:
    """Check every certificate in a chain, not just the leaf.

    Revoking an INTERMEDIATE has to invalidate everything under it, or a
    compromised issuing key stays usable simply because each leaf it minted is
    individually unlisted. Accepts anything exposing `.serial_number`, which
    covers both the `cryptography` and asn1crypto certificate objects used across
    this service. Returns the first blocking entry, or None.
    """
    for cert in certs:
        serial = getattr(cert, "serial_number", None)
        if serial is None:
            continue
        hit = check(serial, sealed_before)
        if hit is not None:
            return hit
    return None


def status(serial: int | str) -> Optional[dict]:
    """The raw entry for a serial, whatever the reason. For display: a proof page
    should be able to say a certificate was superseded even where the seal itself
    is still trusted."""
    return load().get(_normalise_serial(serial))


def published(sign=None) -> dict:
    """The full list as published, for the /revocations endpoint. Includes the
    generation time so a consumer can tell a stale mirror from a current one.

    `sign` is an optional callable taking the document and returning the members
    that authenticate it: `signature`, `logCert` and `logChain`. Passing it in keeps
    key material out of this module, which otherwise touches none. Signing failure
    is not fatal: the list still publishes, unsigned, because a CA that cannot reach
    its key should still be able to tell the world which certificates are withdrawn.
    A verifier consulting an unsigned list is exactly the pre-signature behaviour.
    """
    path = _revocations_path()
    try:
        with open(path) as f:
            doc = json.load(f)
    except (OSError, ValueError):
        doc = {"version": 1, "revoked": []}
    doc.setdefault("version", 1)
    doc.setdefault("revoked", [])
    if sign is not None:
        try:
            doc.update(sign(doc))
        except Exception:
            log.warning("revocation list published unsigned: signing failed", exc_info=True)
    doc["fetched_at"] = int(time.time())
    return doc
