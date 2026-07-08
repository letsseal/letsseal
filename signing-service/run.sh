#!/usr/bin/env bash
# Start the signing service. Keep it bound to localhost — it holds signing keys.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
[[ -d .venv ]] || python3 -m venv .venv
./.venv/bin/pip install -q -r requirements.txt
exec ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port "${PORT:-8081}"
