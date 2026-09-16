#!/usr/bin/env bash
# Installiert die Dev-Host-Units fuer den ausgelagerten k3d-Dev-Cluster (ws-1c8987):
#   - k3d-dev-ingress-bridge@.service  (System-Template, Instanz @80)
# llm-proxy-lan.service ist mit T900191 entfallen: der Proxy laeuft im devmesh-Pod llm-services.
# Voraussetzung: passwortfreies sudo fuer die System-Unit (Port 80 ist privilegiert).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE_PORT="${BRIDGE_PORT:-80}"

# ── System-Template: Ingress-Bridge ──────────────────────────────────────────
sudo -n cp "$REPO/scripts/dev-host-units/k3d-dev-ingress-bridge@.service" /etc/systemd/system/
sudo -n systemctl daemon-reload
# T002281-Muster: Port ist die verlaessliche Auskunft. Haelt ein FREMD-Prozess
# den Port, schlägt enable --now nur mit EADDRINUSE-Loop durch — abbrechen.
OWNER="$(ss -lptnH "sport = :$BRIDGE_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
if [[ -n "$OWNER" ]]; then
  echo "FEHLER: Port $BRIDGE_PORT wird von PID $OWNER gehalten (nicht diese Unit) — erst freigeben." >&2
  exit 1
fi
sudo -n systemctl enable --now "k3d-dev-ingress-bridge@${BRIDGE_PORT}"
for _ in $(seq 1 15); do
  STATE="$(systemctl show "k3d-dev-ingress-bridge@${BRIDGE_PORT}" -p SubState --value 2>/dev/null || echo unknown)"
  [[ "$STATE" == "running" ]] && break
  sleep 2
done
[[ "$(systemctl is-active "k3d-dev-ingress-bridge@${BRIDGE_PORT}" 2>/dev/null)" == "active" ]] \
  || { echo "ingress-bridge erreicht 'active' nicht." >&2; exit 1; }
echo "k3d-dev-ingress-bridge@${BRIDGE_PORT}: aktiv."
