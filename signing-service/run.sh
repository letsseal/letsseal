#!/usr/bin/env bash
# Start the signing service. Keep it bound to localhost — it holds signing keys.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
# Load local secrets (LETSSEAL_SERVICE_TOKEN, LETSSEAL_P12_PASS) if present.
[[ -f .env ]] && set -a && . ./.env && set +a
[[ -d .venv ]] || python3 -m venv .venv

# Install from the LOCK, not requirements.txt.
#
# requirements.txt pins 8 direct dependencies and nothing transitive, so
# installing from it means the process that holds the CA and signing keys can
# pick up a different dependency tree on any restart, with no review and no
# record of what changed. requirements.lock is the full, frozen set. Regenerate
# it deliberately (see the header inside that file) rather than letting a restart
# do it silently.
#
# Set LETSSEAL_ALLOW_UNPINNED=1 to fall back to requirements.txt when you are
# knowingly working on the dependency set itself.
if [[ "${LETSSEAL_ALLOW_UNPINNED:-}" == "1" ]]; then
  echo "WARNING: installing from requirements.txt (unpinned transitives)." >&2
  ./.venv/bin/pip install -q -r requirements.txt
else
  ./.venv/bin/pip install -q -r requirements.lock
fi

exec ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port "${PORT:-8081}"
