#!/usr/bin/env bash
# lmstudio-preload.sh — Pin LM Studio models to VRAM to prevent mid-task eviction.
#
# Strategy:
#   Embedding models (1.26 GB total) → ttl=-1 (permanent, too small to matter)
#   LLM models (hermes 4.58 GB / qwen 8.87 GB) → only one at a time, ttl set
#   by caller. Loading both simultaneously risks exceeding 16 GB VRAM.
#
# Usage:
#   scripts/lmstudio-preload.sh embeddings   # pre-load all 3 embedding models
#   scripts/lmstudio-preload.sh coding       # pre-load qwen + embeddings (big coding task)
#   scripts/lmstudio-preload.sh chat         # pre-load hermes + embeddings
#   scripts/lmstudio-preload.sh status       # show loaded instances
#   scripts/lmstudio-preload.sh unload <id>  # explicit unload

set -euo pipefail

HOST="${LM_STUDIO_HOST:-192.168.100.10}"
PORT="${LM_STUDIO_PORT:-1234}"
BASE="http://${HOST}:${PORT}"

HERMES="hermes-3-llama-3.1-8b"
QWEN="qwen/qwen3.5-9b"
EMBED_BGE="text-embedding-bge-m3"
EMBED_NOMIC="text-embedding-nomic-embed-text-v1.5"
EMBED_RERANK="text-embedding-bge-reranker-v2-m3"

load_model() {
  local model="$1"
  echo "  → loading ${model} ..."
  local resp
  resp=$(curl -sf -X POST "${BASE}/api/v1/models/load" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"${model}\"}" 2>&1) || {
    echo "  ✗ failed to load ${model}: ${resp}"
    return 1
  }
  echo "  ✓ ${model}"
}

unload_model() {
  local model="$1"
  echo "  → unloading ${model} ..."
  curl -sf -X POST "${BASE}/api/v1/models/unload" \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"${model}\"}" >/dev/null 2>&1 && echo "  ✓ unloaded" || echo "  (not loaded or already unloaded)"
}

show_status() {
  echo "── LM Studio loaded instances ──"
  curl -sf "${BASE}/api/v1/models" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for m in d['models']:
    inst = m.get('loaded_instances', [])
    sz = m.get('size_bytes', 0) / 1024**3
    status = f'loaded ({len(inst)} inst)' if inst else 'not loaded'
    print(f\"  {'[+]' if inst else '[ ]'} {m['key']:45} {sz:.2f}GB  {status}\")
"
}

CMD="${1:-status}"

case "$CMD" in
  embeddings)
    echo "Pinning embedding models permanently (ttl=-1) ..."
    load_model "$EMBED_BGE"
    load_model "$EMBED_NOMIC"
    load_model "$EMBED_RERANK"
    echo "Done. Embedding models are now resident."
    ;;

  coding)
    echo "Pre-loading Qwen3.5-9B (8.87 GB) + embedding models for coding session ..."
    echo "Note: Hermes (4.58 GB) + Qwen (8.87 GB) = 13.45 GB — LM Studio manages VRAM."
    load_model "$QWEN"
    load_model "$EMBED_BGE"
    load_model "$EMBED_NOMIC"
    load_model "$EMBED_RERANK"
    echo "Done. Qwen3.5-9B is warm — start your coding task now."
    ;;

  chat)
    echo "Pre-loading Hermes (4.58 GB) + embedding models for chat session ..."
    load_model "$HERMES"
    load_model "$EMBED_BGE"
    load_model "$EMBED_NOMIC"
    load_model "$EMBED_RERANK"
    echo "Done. Hermes is warm for chat."
    ;;

  unload)
    MODEL="${2:?usage: $0 unload <model-id>}"
    unload_model "$MODEL"
    ;;

  status)
    show_status
    ;;

  *)
    echo "Usage: $0 {embeddings|coding|chat|unload <model>|status}"
    exit 1
    ;;
esac
