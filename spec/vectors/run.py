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
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import verify as V

logging.getLogger("pyhanko").setLevel(logging.CRITICAL)


def verdict_for(vec: dict) -> dict:
    """Verify one vector with the reference verifier, pinning the suite's own root."""
    V.set_pinned_root(str(HERE / "root.crt"))
    subject = HERE / vec["id"] / vec["subject"]
    data = subject.read_bytes()

    if data[:5] == b"%PDF-":
        s = V.verify_seal(data)
    else:
        sig = next((f for f in vec["files"] if f.endswith(".sig")), None)
        if sig is None:
            return {"sealed": False}
        s = V.verify_detached(str(subject), str(HERE / vec["id"] / sig))

    s["authentic"] = bool(
        s.get("sealed") and s.get("intact") and s.get("valid")
        and s.get("trusted") and s.get("entire_file"))
    return s


def main() -> int:
    manifest = json.loads((HERE / "manifest.json").read_text())
    failures = 0
    drift = 0

    for vec in manifest["vectors"]:
        got = verdict_for(vec)
        bad = [(k, want, got.get(k)) for k, want in vec["require"].items() if got.get(k) != want]
        if bad:
            failures += 1
            print(f"FAIL  {vec['id']}")
            for k, want, actual in bad:
                print(f"        {k}: required {want}, verifier reported {actual}")
        else:
            print(f"ok    {vec['id']:32s} authentic={got.get('authentic')}")

        for k, want in vec.get("observed", {}).items():
            if k in got and got.get(k) != want:
                drift += 1
                print(f"      note: {vec['id']} {k} was {want}, now {got.get(k)}")

    print()
    print(f"{len(manifest['vectors']) - failures}/{len(manifest['vectors'])} vectors pass"
          + (f", {drift} observational difference(s)" if drift else ""))
    if failures:
        print("A required verdict does not match. Either the verifier regressed, or the "
              "vector was regenerated without its expectations being rechecked.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
