#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — Linux-Firewall (UFW) einrichten / entfernen
# Verwendung:
#   ./scripts/firewall-linux.sh setup    Regeln anlegen
#   ./scripts/firewall-linux.sh remove   Regeln entfernen
#   ./scripts/firewall-linux.sh status   Regeln anzeigen
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

RULES=(
  "80/tcp|Homeoffice MVP HTTP"
  "443/tcp|Homeoffice MVP HTTPS"
  "10000/udp|Homeoffice MVP Jitsi JVB"
)

# ── Hilfsfunktionen ──────────────────────────────────────────────

require_ufw() {
  if ! command -v ufw &>/dev/null; then
    echo "Fehler: ufw ist nicht installiert." >&2
    echo "  sudo apt install ufw" >&2
    exit 1
  fi
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Fehler: Root-Rechte erforderlich." >&2
    echo "  sudo $0 $*" >&2
    exit 1
  fi
}

# ── Befehle ──────────────────────────────────────────────────────

cmd_setup() {
  require_root "$@"
  require_ufw
  echo "Firewall-Regeln anlegen ..."
  for entry in "${RULES[@]}"; do
    port="${entry%%|*}"
    comment="${entry##*|}"
    if ufw status | grep -q "$port.*ALLOW"; then
      echo "  ✓ $port bereits erlaubt"
    else
      ufw allow "$port" comment "$comment"
      echo "  + $port erlaubt ($comment)"
    fi
  done
  # UFW aktivieren falls inaktiv
  if ! ufw status | grep -q "Status: active"; then
    echo ""
    echo "UFW ist inaktiv — aktiviere ..."
    ufw --force enable
  fi
  echo ""
  echo "Fertig. Aktueller Status:"
  ufw status verbose
}

cmd_remove() {
  require_root "$@"
  require_ufw
  echo "Firewall-Regeln entfernen ..."
  for entry in "${RULES[@]}"; do
    port="${entry%%|*}"
    comment="${entry##*|}"
    if ufw status | grep -q "$port.*ALLOW"; then
      ufw delete allow "$port"
      echo "  - $port entfernt ($comment)"
    else
      echo "  ✓ $port war nicht vorhanden"
    fi
  done
  echo ""
  ufw status verbose
}

cmd_status() {
  require_ufw
  echo "Homeoffice MVP Firewall-Regeln:"
  echo ""
  for entry in "${RULES[@]}"; do
    port="${entry%%|*}"
    comment="${entry##*|}"
    if ufw status 2>/dev/null | grep -q "$port.*ALLOW" || \
       sudo ufw status 2>/dev/null | grep -q "$port.*ALLOW"; then
      echo "  ✓ $port  erlaubt  ($comment)"
    else
      echo "  ✗ $port  NICHT erlaubt  ($comment)"
    fi
  done
}

# ── Hauptprogramm ────────────────────────────────────────────────

case "${1:-}" in
  setup)  cmd_setup "$@" ;;
  remove) cmd_remove "$@" ;;
  status) cmd_status ;;
  *)
    echo "Verwendung: $0 {setup|remove|status}"
    echo ""
    echo "  setup   — Ports 80/tcp, 443/tcp, 10000/udp freigeben"
    echo "  remove  — Regeln wieder entfernen"
    echo "  status  — Aktuelle Regeln anzeigen"
    exit 1
    ;;
esac
