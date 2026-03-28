#!/usr/bin/env bash
# NFA-01: Datenschutz — no external DNS, no telemetry
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: No connections to proprietary cloud services
LOGS=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" logs --tail 500 2>&1)
for domain in microsoft.com slack.com zoom.us googleapis.com; do
  assert_not_contains "$LOGS" "$domain" "NFA-01" "T1-${domain%%.*}" "Keine Verbindung zu ${domain}"
done

# T2: No external tracking endpoints
for tracker in analytics tracking; do
  assert_not_contains "$LOGS" "$tracker" "NFA-01" "T2-${tracker}" "Kein ${tracker}-Endpunkt in Logs"
done
# Telemetry: check for actual outbound endpoints, not the config keyword
for endpoint in telemetry.mattermost.com diagnostics.mattermost.com; do
  assert_not_contains "$LOGS" "$endpoint" "NFA-01" "T2-${endpoint%%.*}" "Keine Verbindung zu ${endpoint}"
done

# T5: Server IP in Germany
if command -v curl &>/dev/null; then
  HOST_IP=$(curl -s --max-time 5 https://ipinfo.io/country 2>/dev/null || echo "unknown")
  assert_eq "$HOST_IP" "DE" "NFA-01" "T5" "Server-IP in Deutschland"
fi
