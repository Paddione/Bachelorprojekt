#!/usr/bin/env bash
# NFA-11: After all four Ollama models are touched in sequence, VRAM stays
#         under 14 GB and TEI services are still responsive.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

LLM_HOST_IP="${LLM_HOST_IP:-10.0.0.99}"
LLM_HOST="${LLM_HOST:-root@${LLM_HOST_IP}}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

# T1: rotate through all 4 Ollama models, then verify TEI + VRAM
for m in qwen2.5:14b-instruct-q4_K_M qwen2.5-coder:14b-instruct-q4_K_M qwen2.5vl:7b-instruct-q4_K_M llama3.2:3b-instruct-q4_K_M; do
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$LLM_HOST" \
    "curl -fsS -X POST http://127.0.0.1:11434/api/generate -d '{\"model\":\"$m\",\"prompt\":\"hi\",\"stream\":false,\"options\":{\"num_predict\":1}}'" \
    >/dev/null 2>&1 || true
done

USED_MIB=$(ssh -i "$SSH_KEY" "$LLM_HOST" \
  "nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits" 2>/dev/null || echo "99999")

# 14 GB ≈ 14336 MiB
if [[ "$USED_MIB" -lt 14336 ]]; then
  _log_result "NFA-11" "T1" "VRAM under 14 GB after model rotation (${USED_MIB} MiB used)" "pass" "0"
else
  _log_result "NFA-11" "T1" "VRAM under 14 GB after model rotation" "fail" "0" "VRAM=${USED_MIB} MiB ≥ 14336 MiB"
fi

# T2: TEI embed still responsive
TEI_EMBED=$(ssh -i "$SSH_KEY" "$LLM_HOST" "curl -fsS http://127.0.0.1:8081/health" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$TEI_EMBED" == "ok" ]]; then
  _log_result "NFA-11" "T2" "TEI embed (bge-m3) still responsive after rotation" "pass" "0"
else
  _log_result "NFA-11" "T2" "TEI embed (bge-m3) still responsive after rotation" "fail" "0" "TEI embed health check failed"
fi

# T3: TEI rerank still responsive
TEI_RERANK=$(ssh -i "$SSH_KEY" "$LLM_HOST" "curl -fsS http://127.0.0.1:8082/health" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$TEI_RERANK" == "ok" ]]; then
  _log_result "NFA-11" "T3" "TEI rerank (bge-reranker-v2-m3) still responsive after rotation" "pass" "0"
else
  _log_result "NFA-11" "T3" "TEI rerank (bge-reranker-v2-m3) still responsive after rotation" "fail" "0" "TEI rerank health check failed"
fi
