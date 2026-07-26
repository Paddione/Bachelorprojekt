#!/usr/bin/env bash
# NFA-11: After all four Ollama models are touched in sequence, VRAM stays
#         under 14 GB and the embedding/rerank services are still responsive.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

LLM_HOST_IP="${LLM_HOST_IP:-10.0.0.99}"
LLM_HOST="${LLM_HOST:-root@${LLM_HOST_IP}}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

# T1: rotate through all 4 Ollama models, then verify embed/rerank + VRAM
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

# T2: llama.cpp embedding server still responsive (T002258: was TEI :8081)
EMBED_HEALTH=$(ssh -i "$SSH_KEY" "$LLM_HOST" "curl -fsS http://127.0.0.1:8095/health" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$EMBED_HEALTH" == "ok" ]]; then
  _log_result "NFA-11" "T2" "Embedding server (bge-m3 :8095) still responsive after rotation" "pass" "0"
else
  _log_result "NFA-11" "T2" "Embedding server (bge-m3 :8095) still responsive after rotation" "fail" "0" "embed health check on :8095 failed"
fi

# T3: llama.cpp rerank server still responsive (T002258: was TEI :8082)
RERANK_HEALTH=$(ssh -i "$SSH_KEY" "$LLM_HOST" "curl -fsS http://127.0.0.1:8096/health" 2>/dev/null && echo "ok" || echo "fail")
if [[ "$RERANK_HEALTH" == "ok" ]]; then
  _log_result "NFA-11" "T3" "Rerank server (bge-reranker-v2-m3 :8096) still responsive after rotation" "pass" "0"
else
  _log_result "NFA-11" "T3" "Rerank server (bge-reranker-v2-m3 :8096) still responsive after rotation" "fail" "0" "rerank health check on :8096 failed"
fi
