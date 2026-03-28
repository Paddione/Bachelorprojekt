#!/usr/bin/env bash
# NFA-06: Wartbarkeit — compose lifecycle, logs, .env config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: All services healthy
UNHEALTHY=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" ps --format json 2>/dev/null \
  | jq -r 'select(.Health != "healthy" and .Health != "" and .Health != null) | .Name' | head -5)
assert_eq "${UNHEALTHY:-}" "" "NFA-06" "T1" "Alle Services healthy"

# T4: Logs readable
LOG_OUTPUT=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" logs --tail 10 mattermost 2>&1)
assert_gt "${#LOG_OUTPUT}" 0 "NFA-06" "T4" "docker compose logs liefert Ausgabe"

# T5: .env file exists
assert_cmd "test -f ${COMPOSE_DIR}/.env" "NFA-06" "T5" ".env Datei vorhanden"
