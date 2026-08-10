#!/usr/bin/env python3
"""
Run the conformance vectors against a verifier.

Two jobs. For us, it is the check that the published vectors and the reference
verifier still agree, so neither can drift without the build noticing: a vector
suite that quietly disagrees with its own reference implementation is worse than
none, because implementers calibrate against it.

For anyone writing a second implementation, it is the worked example. Iterate
manifest.json, run each subject file through your verifier, and compare the
verdict against `require`. Everything outside `require` is yours to decide.

Run:  ../../signing-service/.venv/bin/python run.py
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import verify as V

logging.getLogger("pyhanko").setLevel(logging.CRITICAL)


def revocation_source(base: Path, vec: dict) -> str | None:
    """Where this vector says the revocation list lives.

    A bare filename names a list shipped in the vector's own directory. Anything with
    a scheme is passed through, which is how the unreachable-list vector points at a
    host that does not resolve.
    """
    src = vec.get("revocations")
    if not src:
        return None
    if "://" in src:
        return src
    return str(base / vec["id"] / src)


def verdict_for(base: Path, root: Path, vec: dict) -> dict:
    """Verify one vector with the reference verifier, pinning its own group's root."""
    V.set_pinned_root(str(root))
    subject = base / vec["id"] / vec["subject"]
    data = subject.read_bytes()

    proven = vec.get("provenTimeUnix")

    if data[:5] == b"%PDF-":
        moment = datetime.fromtimestamp(proven, tz=timezone.utc) if proven else None
        s = V.verify_seal(data, at_time=moment)
    else:
        sig = next((f for f in vec["files"] if f.endswith(".sig")), None)
        if sig is None:
            return {"sealed": False, "verdict": "unsealed", "authentic": False}
        s = V.verify_detached(str(subject), str(base / vec["id"] / sig), at_time=proven)

    state, entry = V.check_revocation(s.get("serials") or s.get("serial"),
                                      revocation_source(base, vec), sealed_at=proven)
    s["revocation"] = state
    if entry:
        s["revocationReason"] = entry.get("reason")

    s["verdict"] = seal_verdict(s)
    s["authentic"] = s["verdict"] == "authentic"
    return s


def seal_verdict(s: dict) -> str:
    """The one verdict of SPEC.md section 8.4, in its precedence.

    More than one can hold at once, so the order is the specification: no signature
    first, then the bytes and the coverage, then the two ways a verifier declines the
    certificate, and only then a pass. Revocation joins the chain check in the third
    row, because a revocation reaching this seal withdraws trust from it just as
    surely as chaining to a root the verifier does not pin.
    """
    if not s.get("sealed"):
        return "unsealed"
    if not (s.get("intact") and s.get("valid") and s.get("entire_file")):
        return "altered"
    if not s.get("trusted") or s.get("revocation") == "revoked":
        return "unrecognised"
    return "authentic"


def main() -> int:
    manifest = json.loads((HERE / "manifest.json").read_text())
    root = HERE / manifest.get("pinnedRoot", "root.crt")
    failures = 0
    drift = 0

    for vec in manifest["vectors"]:
        got = verdict_for(HERE, root, vec)
        bad = [(k, want, got.get(k)) for k, want in vec["require"].items() if got.get(k) != want]
        if bad:
            failures += 1
            print(f"FAIL  {vec['id']}")
            for k, want, actual in bad:
                print(f"        {k}: required {want}, verifier reported {actual}")
        else:
            print(f"ok    {vec['id']:36s} {str(got.get('verdict')):13s} "
                  f"revocation={got.get('revocation')}")

        for k, want in vec.get("observed", {}).items():
            if k in got and got.get(k) != want:
                drift += 1
                print(f"      note: {vec['id']} {k} was {want}, now {got.get(k)}")

    total = len(manifest["vectors"])
    print()
    print(f"{total - failures}/{total} vectors pass"
          + (f", {drift} observational difference(s)" if drift else ""))
    if failures:
        print("A required verdict does not match. Either the verifier regressed, or the "
              "vector was regenerated without its expectations being rechecked.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
