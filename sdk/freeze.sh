#!/usr/bin/env bash
# Re-freeze the OpenAPI contract from a running signing service.
# The frozen openapi.json is the single source of truth every SDK is built from.
set -euo pipefail
API="${LETSSEAL_API:-http://127.0.0.1:8081}"
here="$(cd "$(dirname "$0")" && pwd)"

curl -fsS "$API/openapi.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin), open('$here/openapi.json','w'), indent=2, ensure_ascii=False); open('$here/openapi.json','a').write('\n')"

echo "frozen $here/openapi.json"
