#!/usr/bin/env bash
# NFA-10: Cloud-fallback for chat-class requests completes within 5x the local p95.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

_restore_chat() {
  if [[ -f /tmp/llm-gateway-chat.bak ]]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-chat.bak >/dev/null 2>&1 || true
    rm -f /tmp/llm-gateway-chat.bak
  fi
}
trap _restore_chat EXIT

# Measure 5 local samples
LOCAL_TIMES=()
for i in 1 2 3 4 5; do
  T=$({ time kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -o /dev/null --max-time 30 -X POST http://localhost:4000/v1/chat/completions \
      -H 'Content-Type: application/json' \
      -d '{"model":"workspace-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
    2>/dev/null; } 2>&1 | awk '/real/{print $2}' | sed 's/m/\* 60 + /; s/s//' | bc 2>/dev/null || echo "30")
  LOCAL_TIMES+=("$T")
done

# p95 ≈ max of 5 samples
P95=$(printf '%s\n' "${LOCAL_TIMES[@]}" | sort -n | tail -1)

# Measure one fallback sample
kubectl -n "$NS" get endpoints llm-gateway-chat -o yaml > /tmp/llm-gateway-chat.bak 2>/dev/null || true
kubectl -n "$NS" patch endpoints llm-gateway-chat --type=json \
  -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]' >/dev/null 2>&1 || true
sleep 2

FALLBACK=$({ time kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS -o /dev/null --max-time 60 -X POST http://localhost:4000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"workspace-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
  2>/dev/null; } 2>&1 | awk '/real/{print $2}' | sed 's/m/\* 60 + /; s/s//' | bc 2>/dev/null || echo "999")

# T1: fallback latency ≤ 5× p95
THRESHOLD=$(echo "5 * $P95" | bc 2>/dev/null || echo "0")
if awk -v f="$FALLBACK" -v t="$THRESHOLD" 'BEGIN{ exit !(f+0 <= t+0) }'; then
  _log_result "NFA-10" "T1" "Fallback latency ≤ 5× local p95 (fallback=${FALLBACK}s, p95=${P95}s, threshold=${THRESHOLD}s)" "pass" "0"
else
  _log_result "NFA-10" "T1" "Fallback latency ≤ 5× local p95" "fail" "0" "fallback=${FALLBACK}s > threshold=${THRESHOLD}s (p95=${P95}s)"
fi
