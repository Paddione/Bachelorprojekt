#!/usr/bin/env bash
# FA-32: LLM router returns 1024-dim bge-m3 vectors when TEI is up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

# T1: llm-router pod is Ready
READY=$(kubectl -n "$NS" get deploy/llm-router -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "")
if [[ "$READY" == "1" ]]; then
  _log_result "FA-32" "T1" "llm-router pod is Ready" "pass" "0"
else
  _log_result "FA-32" "T1" "llm-router pod is Ready" "fail" "0" "readyReplicas=${READY:-0}"
fi

# T2: bge-m3 embedding round-trip returns 1024-dim vector
RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS -X POST http://localhost:4000/v1/embeddings \
    -H 'Content-Type: application/json' \
    -d '{"model":"bge-m3","input":"hallo welt"}' 2>/dev/null || echo "")
DIM=$(echo "$RESPONSE" | jq '.data[0].embedding | length' 2>/dev/null || echo "0")
if [[ "$DIM" == "1024" ]]; then
  _log_result "FA-32" "T2" "bge-m3 embedding round-trip returns 1024-dim vector" "pass" "0"
else
  _log_result "FA-32" "T2" "bge-m3 embedding round-trip returns 1024-dim vector" "fail" "0" "dim=${DIM}"
fi
