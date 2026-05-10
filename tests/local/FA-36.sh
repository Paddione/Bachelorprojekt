#!/usr/bin/env bash
# FA-36: /v1/rerank returns sorted results; correct top-1 on a fixture set.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

# T1: rerank places 'berlin' first for 'capital of germany'
RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS -X POST http://localhost:4000/v1/rerank \
    -H 'Content-Type: application/json' \
    -d '{"model":"workspace-rerank","query":"capital of germany","documents":["paris","berlin","hamburg","munich"]}' \
  2>/dev/null || echo "")
TOP=$(echo "$RESPONSE" | jq -r '.results[0].index' 2>/dev/null || echo "")
# 'berlin' is index 1 in the documents array
if [[ "$TOP" == "1" ]]; then
  _log_result "FA-36" "T1" "rerank places 'berlin' first for 'capital of germany'" "pass" "0"
else
  _log_result "FA-36" "T1" "rerank places 'berlin' first for 'capital of germany'" "fail" "0" "top index=${TOP}"
fi
