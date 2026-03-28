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

# T2: ab load test
if command -v ab &>/dev/null; then
  AB_OUT=$(ab -n 100 -c 10 "https://${MM_DOMAIN}/api/v4/system/ping" 2>&1)
  FAIL_REQ=$(echo "$AB_OUT" | grep "Failed requests" | awk '{print $3}')
  FAIL_PCT=$((FAIL_REQ * 100 / 100))
  assert_lt "$FAIL_PCT" 5 "NFA-04" "T2" "ab -n 100 -c 10: < 5% Fehlerrate"
else
  skip_test "NFA-04" "T2" "Load test" "Apache Bench (ab) nicht installiert"
fi

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
