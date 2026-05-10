#!/usr/bin/env bash
# FA-38: With Ollama unreachable, workspace-chat returns successfully via Anthropic.
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

# T1: workspace-chat falls back to Anthropic when Ollama Endpoints is down
kubectl -n "$NS" get endpoints llm-gateway-chat -o yaml > /tmp/llm-gateway-chat.bak 2>/dev/null || true
kubectl -n "$NS" patch endpoints llm-gateway-chat --type=json \
  -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]' >/dev/null 2>&1 || true
sleep 2

RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS --max-time 60 -X POST http://localhost:4000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"workspace-chat","messages":[{"role":"user","content":"Sag Hallo."}],"max_tokens":20}' \
  2>/dev/null || echo "")
CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null || echo "")
MODEL=$(echo "$RESPONSE" | jq -r '.model' 2>/dev/null || echo "")

if [[ -n "$CONTENT" ]] && (echo "$MODEL" | grep -qiE "anthropic|claude"); then
  _log_result "FA-38" "T1" "workspace-chat falls back to Anthropic when Ollama is down" "pass" "0"
elif [[ -n "$CONTENT" ]]; then
  _log_result "FA-38" "T1" "workspace-chat falls back to Anthropic when Ollama is down" "fail" "0" "got content but model=${MODEL}"
else
  _log_result "FA-38" "T1" "workspace-chat falls back to Anthropic when Ollama is down" "fail" "0" "no content returned"
fi
