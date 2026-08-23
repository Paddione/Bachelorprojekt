#!/usr/bin/env bash
# Installiert die Dev-Host-Units fuer den ausgelagerten k3d-Dev-Cluster (ws-1c8987):
#   - k3d-dev-ingress-bridge@.service  (System-Template, Instanz @80)
#   - llm-proxy-lan.service            (User-Unit, setzt installiertes llm-proxy.service voraus)
# Voraussetzung: passwortfreies sudo fuer die System-Unit (Port 80 ist privilegiert).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE_PORT="${BRIDGE_PORT:-80}"
UNIT_DIR="${HOME}/.config/systemd/user"

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

# ── User-Unit: LAN-Bruecke zum LLM-Proxy ─────────────────────────────────────
systemctl --user show-environment >/dev/null 2>&1 || {
  echo "KEIN systemd --user Manager — llm-proxy-lan wird uebersprungen." >&2;
  exit 0;
}
mkdir -p "$UNIT_DIR"
ln -sf "$REPO/scripts/llm-proxy/llm-proxy-lan.service" "$UNIT_DIR/llm-proxy-lan.service"
systemctl --user daemon-reload
systemctl --user enable --now llm-proxy-lan.service
for _ in $(seq 1 15); do
  STATE="$(systemctl --user show llm-proxy-lan.service -p SubState --value 2>/dev/null || echo unknown)"
  [[ "$STATE" == "running" ]] && break
  sleep 2
done
[[ "$(systemctl --user is-active llm-proxy-lan.service 2>/dev/null)" == "active" ]] \
  || { echo "llm-proxy-lan erreicht 'active' nicht." >&2; exit 1; }
echo "llm-proxy-lan: aktiv."
