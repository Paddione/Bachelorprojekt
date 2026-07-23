#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# llm-host-setup.sh — bootstrap the GPU host (llama.cpp + PS1 + ufw)
# ════════════════════════════════════════════════════════════════════
# Setzt die drei llama.cpp-Server (Embedding/Rerank/Bonsai) via Windows
# PowerShell-Skripte auf dem GPU-Host auf. Das Linux-Serverskript
# dokumentiert nur den Pfad und verweist auf die PS1-Ausführung.
#
# Prereqs on the host:
#   - Ubuntu 24.04 with NVIDIA driver ≥ 555 (Blackwell sm_120 needs CUDA 12.8)
#   - The host has joined wg-mesh (interface name "wg-mesh")
#   - SSH key in ~/.ssh/id_ed25519_hetzner allows passwordless root
#
# Usage:
#   scripts/llm-host-setup.sh <ssh-host>
#
# NOTE: This script runs on a Linux fleet node that connects to the
# Windows GPU host via wg-mesh. The actual llama.cpp servers run as
# Windows Scheduled Tasks on the GPU host, not as systemd units here.
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

echo "[3/6] Open ufw on wg-mesh interface only..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
# Neue llama.cpp-Server auf dem Windows GPU-Host (via wg-gpu)
ufw allow in on wg-mesh to any port 8093 proto tcp comment "llama-bonsai (Windows)"
ufw allow in on wg-mesh to any port 8095 proto tcp comment "llama-embed (Windows)"
ufw allow in on wg-mesh to any port 8096 proto tcp comment "llama-rerank (Windows)"
# Legacy: Ollama (bleibt auf dem Linux-Host, falls noch benötigt)
ufw allow in on wg-mesh to any port 11434 proto tcp comment "ollama"
ufw status numbered | grep -E "wg-mesh.*(8093|8095|8096|11434)"
REMOTE

echo "[4/6] Verify llama.cpp services on Windows GPU host via wg-mesh..."
echo ""
echo "  The three llama.cpp servers run as Windows Scheduled Tasks on the"
echo "  GPU host (Korczewski WSL), NOT as systemd units on this fleet node."
echo ""
echo "  To set up the Windows Scheduled Tasks, run these PS1 scripts on"
echo "  the GPU host (e.g. via WinRM or interactive RDP session):"
echo ""
echo "    scripts/llm/start-bonsai-server.ps1"
echo "    scripts/llm/start-embed-server.ps1"
echo "    scripts/llm/start-rerank-server.ps1"
echo "    scripts/llm/register-scheduled-tasks.ps1"
echo ""

echo "[5/6] Smoke-test endpoints via wg-mesh..."
echo "  Embedding: curl -s http://${LLM_HOST_IP:-192.168.100.10}:8095/v1/embeddings ..."
echo "  Rerank:    curl -s http://${LLM_HOST_IP:-192.168.100.10}:8096/v1/rerank ..."
echo "  Bonsai:    curl -s http://${LLM_HOST_IP:-192.168.100.10}:8093/v1/models"

echo ""
echo "[6/6] Verify reachability..."
ssh "${SSH_OPTS[@]}" "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
echo "Probing GPU host via wg-mesh (192.168.100.10)..."
for port in 8093 8095 8096; do
  timeout 3 bash -c "echo >/dev/tcp/192.168.100.10/$port" 2>/dev/null \
    && echo "  Port $port: reachable" \
    || echo "  Port $port: NOT reachable — ensure Windows Scheduled Tasks are running"
done
REMOTE

echo ""
echo "=== LLM Host Setup Complete ==="
echo "Next steps:"
echo "  1. Run the Äquivalenzmessung: node scripts/llm/measure-embedding-equivalence.mjs"
echo "  2. If pass (mean >= 0.99), cleanup old TEI containers:"
echo "     sudo systemctl disable --now tei-embed tei-rerank tei-socat tei-rerank-socat lmstudio-socat"
echo "     docker rm -f \$(docker ps -q --filter 'ancestor=ghcr.io/huggingface/text-embeddings-inference:cpu-1.9')"
echo "  3. Re-register PS Scheduled Tasks after llama-server.exe updates"
