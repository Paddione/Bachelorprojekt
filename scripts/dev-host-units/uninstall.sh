#!/usr/bin/env bash
# Deinstalliert die Dev-Host-Units (Rueckbau von install.sh).
set -euo pipefail
BRIDGE_PORT="${BRIDGE_PORT:-80}"
UNIT_DIR="${HOME}/.config/systemd/user"

sudo -n systemctl disable --now "k3d-dev-ingress-bridge@${BRIDGE_PORT}" 2>/dev/null || true
sudo -n rm -f /etc/systemd/system/k3d-dev-ingress-bridge@.service
sudo -n systemctl daemon-reload

systemctl --user disable --now llm-proxy-lan.service 2>/dev/null || true
rm -f "$UNIT_DIR/llm-proxy-lan.service"
systemctl --user daemon-reload 2>/dev/null || true

echo "Dev-Host-Units deinstalliert."
