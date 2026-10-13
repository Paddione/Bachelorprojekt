#!/usr/bin/env bash
# FA-34: Mit kaputtem Backend liefert der Embed-Pfad KEINE Vektoren —
#        fail-closed, kein externer Fallback (T016562: Voyage entfernt).
# Vorgehen wie bisher: Endpoints von llm-gateway-embed auf eine tote IP
# patchen, per port-forward + curl pruefen, per Trap wiederherstellen.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"
PORT="${PORT:-18081}"

_restore_endpoints() {
  if [[ -f /tmp/llm-gateway-embed.bak ]]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-embed.bak >/dev/null 2>&1 || true
    rm -f /tmp/llm-gateway-embed.bak
  fi
}
trap _restore_endpoints EXIT

# T1: gateway ohne Backend -> kein Embedding
kubectl -n "$NS" get endpoints llm-gateway-embed -o yaml > /tmp/llm-gateway-embed.bak 2>/dev/null || true
kubectl -n "$NS" patch endpoints llm-gateway-embed --type=json \
  -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]' >/dev/null 2>&1 || true
sleep 2

kubectl -n "$NS" port-forward "svc/llm-gateway-embed" "${PORT}:8081" >/dev/null 2>&1 &
PF=$!
sleep 3
RESP=$(curl -fsS -m 15 -X POST "http://localhost:${PORT}/v1/embeddings" \
  -H 'Content-Type: application/json' \
  -d '{"model":"bge-m3","input":"hello"}' 2>/dev/null || echo "CURL_FAIL")
kill "$PF" 2>/dev/null

if [[ "$RESP" == "CURL_FAIL" ]]; then
  _log_result "FA-34" "T1" "embed path fails closed when backend is down (no external fallback)" "pass" "0"
else
  HAS_EMBED=$(echo "$RESP" | jq 'has("data")' 2>/dev/null || echo "false")
  if [[ "$HAS_EMBED" == "true" ]]; then
    _log_result "FA-34" "T1" "embed path fails closed when backend is down (no external fallback)" "fail" "0" "got embedding data despite dead backend"
  else
    _log_result "FA-34" "T1" "embed path fails closed when backend is down (no external fallback)" "pass" "0"
  fi
fi
