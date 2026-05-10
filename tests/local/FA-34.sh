#!/usr/bin/env bash
# FA-34: With TEI down and model=bge-m3 + purpose=index, the router returns 5xx —
#        it must NEVER silently fall back to Voyage.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

_restore_endpoints() {
  if [[ -f /tmp/llm-gateway-embed.bak ]]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-embed.bak >/dev/null 2>&1 || true
    rm -f /tmp/llm-gateway-embed.bak
  fi
}
trap _restore_endpoints EXIT

# T1: bge-m3 + purpose=index fails closed when TEI Endpoints is empty
kubectl -n "$NS" get endpoints llm-gateway-embed -o yaml > /tmp/llm-gateway-embed.bak 2>/dev/null || true
kubectl -n "$NS" patch endpoints llm-gateway-embed --type=json \
  -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]' >/dev/null 2>&1 || true
sleep 2

STATUS=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -s -o /tmp/r.json -w '%{http_code}' \
    -H 'Content-Type: application/json' -H 'X-LLM-Purpose: index' \
    -d '{"model":"bge-m3","input":"hello"}' \
    http://localhost:4000/v1/embeddings 2>/dev/null || echo "000")
RESP=$(kubectl -n "$NS" exec deploy/llm-router -- cat /tmp/r.json 2>/dev/null || echo '{}')

if [[ "$STATUS" -ge 500 ]]; then
  HAS_EMBED=$(echo "$RESP" | jq 'has("data")' 2>/dev/null || echo "false")
  if [[ "$HAS_EMBED" == "true" ]]; then
    _log_result "FA-34" "T1" "bge-m3 fails closed when TEI is down (no Voyage fallback)" "fail" "0" "router silently fell back to Voyage"
  else
    _log_result "FA-34" "T1" "bge-m3 fails closed when TEI is down (no Voyage fallback)" "pass" "0"
  fi
else
  _log_result "FA-34" "T1" "bge-m3 fails closed when TEI is down (no Voyage fallback)" "fail" "0" "expected 5xx got ${STATUS}"
fi
