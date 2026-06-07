#!/usr/bin/env bash
set -euo pipefail

VENV="$HOME/comfy-venv"
COMFY_DIR="$HOME/ComfyUI"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

screen -dmS comfyui bash -c \
  "'$VENV/bin/python' '$COMFY_DIR/main.py' \
   --listen 0.0.0.0 --port 8189 2>&1 | tee '$HOME/comfyui.log'"

screen -dmS rigger bash -c \
  "cd '$REPO_DIR' && '$VENV/bin/uvicorn' \
   scripts.rigger_server:app --host 0.0.0.0 --port 8190 \
   2>&1 | tee '$HOME/rigger.log'"

echo "ComfyUI: screen -r comfyui"
echo "Rigger:  screen -r rigger"
