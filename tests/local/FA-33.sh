#!/usr/bin/env bash
# FA-33: voyage-multilingual-2 model passes through the router and returns
#        Voyage vectors regardless of TEI state.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

# T1: voyage-multilingual-2 returns 1024-dim vector
RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS -X POST http://localhost:4000/v1/embeddings \
    -H 'Content-Type: application/json' \
    -d '{"model":"voyage-multilingual-2","input":"capital of germany"}' 2>/dev/null || echo "")
DIM=$(echo "$RESPONSE" | jq '.data[0].embedding | length' 2>/dev/null || echo "0")
if [[ "$DIM" == "1024" ]]; then
  _log_result "FA-33" "T1" "voyage-multilingual-2 returns 1024-dim vector" "pass" "0"
else
  _log_result "FA-33" "T1" "voyage-multilingual-2 returns 1024-dim vector" "fail" "0" "dim=${DIM}"
fi

# T2: voyage path produces a valid embedding object
EMBEDDING=$(echo "$RESPONSE" | jq -r '.data[0].embedding' 2>/dev/null || echo "")
if [[ -n "$EMBEDDING" && "$EMBEDDING" != "null" ]]; then
  _log_result "FA-33" "T2" "voyage path produces valid embedding object" "pass" "0"
else
  _log_result "FA-33" "T2" "voyage path produces valid embedding object" "fail" "0" "no embedding in response"
fi
