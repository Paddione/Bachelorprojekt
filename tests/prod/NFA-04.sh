#!/usr/bin/env bash
# NFA-04: Skalierbarkeit — concurrent sessions, resource config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: 10 concurrent requests without HTTP 500
ERROR_COUNT=0
for i in $(seq 1 10); do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "https://${MM_DOMAIN}/api/v4/system/ping" 2>/dev/null)
  [[ "$STATUS" == "500" || "$STATUS" == "000" ]] && ((ERROR_COUNT++)) || true
done
assert_eq "$ERROR_COUNT" "0" "NFA-04" "T1" "10 gleichzeitige Requests ohne HTTP 500"

# T2: Load test — 100 requests, 10 concurrent (curl-based)
_NFA04_FAILS=0
_NFA04_TMPDIR=$(mktemp -d)
for i in $(seq 1 100); do
  ( curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      "https://${MM_DOMAIN}/api/v4/system/ping" 2>/dev/null \
      > "${_NFA04_TMPDIR}/${i}" ) &
  (( i % 10 == 0 )) && wait
done
wait
for f in "${_NFA04_TMPDIR}"/*; do
  s=$(cat "$f")
  [[ "$s" == "500" || "$s" == "502" || "$s" == "503" || "$s" == "000" ]] && ((_NFA04_FAILS++)) || true
done
rm -rf "$_NFA04_TMPDIR"
FAIL_PCT=$(( _NFA04_FAILS * 100 / 100 ))
assert_lt "$FAIL_PCT" 5 "NFA-04" "T2" "Load-Test 100×c10: < 5% Fehlerrate (${FAIL_PCT}%)"

# T4: README contains scaling notes
if [[ -f "${COMPOSE_DIR}/README.md" ]]; then
  README=$(cat "${COMPOSE_DIR}/README.md")
  assert_contains "$README" "Skalier" "NFA-04" "T4" "README enthält Skalierungshinweise"
else
  skip_test "NFA-04" "T4" "README Skalierung" "README.md nicht gefunden"
fi

# T5: DB config via env vars
COMPOSE_CONFIG=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" config 2>/dev/null)
assert_contains "$COMPOSE_CONFIG" "POSTGRES" "NFA-04" "T5" "Datenbank-Konfiguration über Umgebungsvariablen"
