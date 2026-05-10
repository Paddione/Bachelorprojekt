#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# llm-host-setup.sh — bootstrap the GPU host (TEI + Ollama + ufw)
# ════════════════════════════════════════════════════════════════════
# Idempotent: re-running upgrades systemd units and Docker images
# without re-pulling Ollama models. Models are pulled by
# scripts/llm-pull-models.sh.
#
# Prereqs on the host:
#   - Ubuntu 24.04 with NVIDIA driver ≥ 555 (Blackwell sm_120 needs CUDA 12.8)
#   - The host has joined wg-mesh (interface name "wg-mesh")
#   - SSH key in ~/.ssh/id_ed25519_hetzner allows passwordless root
#
# Usage:
#   scripts/llm-host-setup.sh <ssh-host>
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${1:?Usage: llm-host-setup.sh <ssh-host>}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

echo "[1/6] Verify connectivity to ${HOST}..."
ssh "${SSH_OPTS[@]}" "${HOST}" "echo connected; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"

echo "[2/6] Install Docker + NVIDIA Container Toolkit if missing..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! dpkg -l | grep -q nvidia-container-toolkit; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update && apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi
REMOTE

echo "[3/6] Install Ollama if missing..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
id ollama >/dev/null 2>&1 || useradd -r -m -d /var/lib/ollama -s /sbin/nologin ollama
mkdir -p /var/lib/llm/hf-cache
chown -R ollama:ollama /var/lib/ollama
REMOTE

echo "[4/6] Copy systemd units..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scp "${SSH_OPTS[@]}" \
  "${SCRIPT_DIR}/llm/ollama.service" \
  "${SCRIPT_DIR}/llm/tei-embed.service" \
  "${SCRIPT_DIR}/llm/tei-rerank.service" \
  "${HOST}:/etc/systemd/system/"

echo "[5/6] Enable and (re)start services..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
systemctl daemon-reload
systemctl enable --now ollama.service
systemctl enable --now tei-embed.service
systemctl enable --now tei-rerank.service
REMOTE

echo "[6/6] Open ufw on wg-mesh interface only..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
ufw allow in on wg-mesh to any port 8081 proto tcp comment "tei-embed"
ufw allow in on wg-mesh to any port 8082 proto tcp comment "tei-rerank"
ufw allow in on wg-mesh to any port 11434 proto tcp comment "ollama"
ufw status numbered | grep -E "wg-mesh.*(8081|8082|11434)"
REMOTE

echo "Done. Now run: scripts/llm-pull-models.sh ${HOST}"
