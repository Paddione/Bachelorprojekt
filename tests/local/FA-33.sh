#!/usr/bin/env bash
# FA-33: bge-m3 Embeddings ueber llm-gateway-embed (T016562: Voyage entfernt).
# Manueller Live-Check per port-forward + curl (kein Pod mit curl noetig).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"
PORT="${PORT:-18081}"

kubectl -n "$NS" port-forward "svc/llm-gateway-embed" "${PORT}:8081" >/dev/null 2>&1 &
PF=$!
sleep 3

# T1: bge-m3 returns 1024-dim vector
RESPONSE=$(curl -fsS -m 30 -X POST "http://localhost:${PORT}/v1/embeddings" \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":"capital of germany"}' 2>/dev/null || echo "")
kill "$PF" 2>/dev/null
DIM=$(echo "$RESPONSE" | jq '.data[0].embedding | length' 2>/dev/null || echo "0")
if [[ "$DIM" == "1024" ]]; then
  _log_result "FA-33" "T1" "bge-m3 returns 1024-dim vector" "pass" "0"
else
  _log_result "FA-33" "T1" "bge-m3 returns 1024-dim vector" "fail" "0" "dim=${DIM}"
fi

# T2: bge-m3 path produces a valid embedding object
EMBEDDING=$(echo "$RESPONSE" | jq -r '.data[0].embedding' 2>/dev/null || echo "")
if [[ -n "$EMBEDDING" && "$EMBEDDING" != "null" ]]; then
  _log_result "FA-33" "T2" "bge-m3 path produces valid embedding object" "pass" "0"
else
  _log_result "FA-33" "T2" "bge-m3 path produces valid embedding object" "fail" "0" "no embedding in response"
fi
