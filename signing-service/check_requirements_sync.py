#!/usr/bin/env python3
"""
Assert requirements.txt and requirements.lock agree on every direct dependency.

Two files describe this service's dependencies and they serve different jobs:

  requirements.txt   the direct dependencies, as a human states them
  requirements.lock  every dependency including transitives, fully pinned

CI and deploy.sh both install from the LOCK, because the process that holds the
CA and signing keys should not pick up a different dependency tree on a restart.
That is correct, and it has a sharp edge: a bump applied only to
requirements.txt changes nothing that ever runs. Dependabot updates exactly that
file and cannot regenerate a `pip freeze` lock, so a dependency PR would go green
having tested the OLD pins, merge, and quietly do nothing while the two files
drifted apart.

This turns that silence into a failure. Run it from signing-service/:

    python3 check_requirements_sync.py

Exit 0 when they agree, 1 when they do not, with the command to fix it.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TXT = HERE / "requirements.txt"
LOCK = HERE / "requirements.lock"

PIN = re.compile(r"^\s*([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*==\s*([^\s;#]+)")


def parse(path: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        m = PIN.match(line)
        if m:
            pins[m.group(1).lower().replace("_", "-")] = m.group(2)
    return pins


def main() -> int:
    if not TXT.exists() or not LOCK.exists():
        print("both requirements.txt and requirements.lock must exist", file=sys.stderr)
        return 1

    direct = parse(TXT)
    locked = parse(LOCK)

    missing = sorted(n for n in direct if n not in locked)
    differing = sorted(
        (n, direct[n], locked[n]) for n in direct if n in locked and direct[n] != locked[n]
    )

    if not missing and not differing:
        print(f"requirements.txt and requirements.lock agree on all {len(direct)} direct dependencies.")
        return 0

    print("requirements.txt and requirements.lock DISAGREE.\n", file=sys.stderr)
    for name, want, got in differing:
        print(f"  {name}: requirements.txt asks for {want}, the lock pins {got}", file=sys.stderr)
    for name in missing:
        print(f"  {name}: in requirements.txt, absent from the lock", file=sys.stderr)

    print(
        "\nThe lock is what CI and deploy.sh actually install, so the version in\n"
        "requirements.txt is not the one that runs. Regenerate the lock in a clean\n"
        "environment and commit it alongside the change:\n\n"
        "    cd signing-service\n"
        "    rm -rf .venv && python3 -m venv .venv\n"
        "    ./.venv/bin/pip install -q -r requirements.txt\n"
        "    ./.venv/bin/pip freeze > requirements.lock\n",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
