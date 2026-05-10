#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# llm-pull-models.sh — pull all required models to the GPU host
# ════════════════════════════════════════════════════════════════════
# Idempotent: ollama pull is content-addressed, hf download skips
# files already on disk. ~40 GB of downloads on first run.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${1:?Usage: llm-pull-models.sh <ssh-host>}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

echo "[1/3] Pulling Ollama models (~32 GB)..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
ollama pull qwen2.5:14b-instruct-q4_K_M
ollama pull qwen2.5-coder:14b-instruct-q4_K_M
ollama pull qwen2.5vl:7b-instruct-q4_K_M
ollama pull llama3.2:3b-instruct-q4_K_M
ollama list
REMOTE

echo "[2/3] Restarting TEI to pick up cached HF files (downloads run inside the container on first call)..."
ssh "${SSH_OPTS[@]}" "${HOST}" "systemctl restart tei-embed tei-rerank"

echo "[3/3] Probing endpoints..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8081/health > /dev/null && break || sleep 5
done
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8082/health > /dev/null && break || sleep 5
done
echo "TEI embed:  $(curl -s http://127.0.0.1:8081/info | head -c 200)"
echo "TEI rerank: $(curl -s http://127.0.0.1:8082/info | head -c 200)"
echo "Ollama:     $(curl -s http://127.0.0.1:11434/api/version)"
REMOTE

echo "Done."
