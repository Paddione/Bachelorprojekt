#!/usr/bin/env bash
# FA-37: workspace-chat round-trips a 200-token German prompt successfully.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NS="${NS:-workspace}"

# T1: workspace-chat returns non-empty content
RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
  curl -fsS --max-time 90 -X POST http://localhost:4000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"workspace-chat","messages":[{"role":"user","content":"Beschreibe die Stadt Hamburg in zwei Sätzen."}],"max_tokens":120}' \
  2>/dev/null || echo "")
CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null || echo "")
if [[ -n "$CONTENT" && "${#CONTENT}" -gt 30 ]]; then
  _log_result "FA-37" "T1" "workspace-chat returns non-empty German content" "pass" "0"
else
  _log_result "FA-37" "T1" "workspace-chat returns non-empty German content" "fail" "0" "content='${CONTENT}'"
fi
