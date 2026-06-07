#!/usr/bin/env bash
set -euo pipefail

VENV="$HOME/comfy-venv"
COMFY_DIR="$HOME/ComfyUI"

# 1. Python venv + PyTorch (CUDA 12.8, kompatibel mit Driver 596)
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install torch torchvision \
    --index-url https://download.pytorch.org/whl/cu128
fi

# 2. ComfyUI
if [[ ! -d "$COMFY_DIR" ]]; then
  git clone https://github.com/comfyanonymous/ComfyUI "$COMFY_DIR"
fi
"$VENV/bin/pip" install -r "$COMFY_DIR/requirements.txt"

# 3. Hunyuan3D-2 Custom Nodes (kijai/ComfyUI-Hunyuan3D-2)
HUNYUAN_DIR="$COMFY_DIR/custom_nodes/ComfyUI-Hunyuan3D-2"
if [[ ! -d "$HUNYUAN_DIR" ]]; then
  git clone https://github.com/kijai/ComfyUI-Hunyuan3D-2 "$HUNYUAN_DIR"
fi
"$VENV/bin/pip" install -r "$HUNYUAN_DIR/requirements.txt"

# 4. Modellgewichte (~8 GB, Hunyuan3D-2 mini empfohlen für 16 GB VRAM)
MODEL_DIR="$COMFY_DIR/models/hunyuan3d"
mkdir -p "$MODEL_DIR"
if [[ ! -f "$MODEL_DIR/model.safetensors" ]]; then
  "$VENV/bin/pip" install huggingface_hub
  "$VENV/bin/huggingface-cli" download tencent/Hunyuan3D-2 \
    --local-dir "$MODEL_DIR" --include "*.safetensors" "*.json"
fi

# 5. Blender (für headless Rigging)
if ! command -v blender &>/dev/null; then
  sudo apt install -y blender
fi

# 6. FastAPI für Rigger-Server
"$VENV/bin/pip" install fastapi uvicorn python-multipart

echo "Setup abgeschlossen. Starte mit: bash scripts/start-comfyui.sh"
