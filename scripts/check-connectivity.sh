#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — Erreichbarkeit aller Dienste testen
# Liest Domains aus .env und prüft HTTPS + Jitsi-UDP.
#
# Verwendung:
#   ./scripts/check-connectivity.sh          # Alle Dienste prüfen
#   ./scripts/check-connectivity.sh --local  # Nur lokale Ports prüfen
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env"

# ── .env laden ───────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Fehler: $ENV_FILE nicht gefunden." >&2
  echo "  cp .env.example .env  und Werte ausfüllen." >&2
  exit 1
fi

# Variablen aus .env laden (nur die benötigten)
eval "$(grep -E '^(MM_DOMAIN|KC_DOMAIN|NC_DOMAIN|JITSI_DOMAIN)=' "$ENV_FILE")"

SERVICES=(
  "$MM_DOMAIN|Mattermost"
  "$KC_DOMAIN|Keycloak"
  "$NC_DOMAIN|Nextcloud"
  "$JITSI_DOMAIN|Jitsi"
)

# ── Farben ───────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0

# ── Lokale Port-Prüfung ─────────────────────────────────────────

check_local_ports() {
  echo "Lokale Port-Verfügbarkeit:"
  echo ""
  for port_info in "80/TCP" "443/TCP" "10000/UDP"; do
    port="${port_info%%/*}"
    proto="${port_info##*/}"
    if [[ "$proto" == "TCP" ]]; then
      if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
         netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
        echo -e "  ${GREEN}✓${NC} Port $port/$proto  belegt (Service aktiv)"
        ((pass++))
      else
        echo -e "  ${YELLOW}⚠${NC} Port $port/$proto  frei (kein Service)"
        ((fail++))
      fi
    else
      if ss -ulnp 2>/dev/null | grep -q ":${port} " || \
         netstat -ulnp 2>/dev/null | grep -q ":${port} "; then
        echo -e "  ${GREEN}✓${NC} Port $port/$proto  belegt (Service aktiv)"
        ((pass++))
      else
        echo -e "  ${YELLOW}⚠${NC} Port $port/$proto  frei (kein Service)"
        ((fail++))
      fi
    fi
  done
}

# ── HTTPS-Prüfung ───────────────────────────────────────────────

check_https() {
  echo "HTTPS-Erreichbarkeit:"
  echo ""
  for entry in "${SERVICES[@]}"; do
    domain="${entry%%|*}"
    name="${entry##*|}"
    if curl -sI --max-time 5 "https://${domain}" &>/dev/null; then
      echo -e "  ${GREEN}✓${NC} ${name}  https://${domain}"
      ((pass++))
    else
      echo -e "  ${RED}✗${NC} ${name}  https://${domain}"
      ((fail++))
    fi
  done
}

# ── Jitsi-UDP-Prüfung ───────────────────────────────────────────

check_jitsi_udp() {
  echo ""
  echo "Jitsi JVB (UDP 10000):"
  echo ""
  if command -v nc &>/dev/null; then
    if nc -u -z -w2 "$JITSI_DOMAIN" 10000 2>/dev/null; then
      echo -e "  ${GREEN}✓${NC} UDP 10000 erreichbar ($JITSI_DOMAIN)"
      ((pass++))
    else
      echo -e "  ${RED}✗${NC} UDP 10000 nicht erreichbar ($JITSI_DOMAIN)"
      ((fail++))
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} nc (netcat) nicht installiert — UDP-Test übersprungen"
  fi
}

# ── Host-IP ermitteln ────────────────────────────────────────────

show_host_ip() {
  echo ""
  echo "Host-IP (für Router Port-Forwarding):"
  echo ""
  local ip
  ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}') || true
  if [[ -n "$ip" ]]; then
    echo -e "  ${GREEN}→${NC} $ip"
  else
    echo -e "  ${YELLOW}⚠${NC} Konnte Host-IP nicht ermitteln"
  fi
}

# ── Hauptprogramm ────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════"
echo "  Homeoffice MVP — Erreichbarkeitstest"
echo "════════════════════════════════════════════"
echo ""

if [[ "${1:-}" == "--local" ]]; then
  check_local_ports
  show_host_ip
else
  check_https
  check_jitsi_udp
  show_host_ip
fi

echo ""
echo "────────────────────────────────────────────"
echo -e "Ergebnis: ${GREEN}${pass} bestanden${NC}, ${RED}${fail} fehlgeschlagen${NC}"
echo "────────────────────────────────────────────"
