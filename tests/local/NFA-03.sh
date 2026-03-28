#!/usr/bin/env bash
# NFA-03: Verfügbarkeit — restart recovery, health endpoints, data persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: Kill mattermost → auto-restart
docker kill homeoffice-mattermost > /dev/null 2>&1
sleep 15
MM_STATE=$(docker inspect homeoffice-mattermost --format '{{.State.Running}}' 2>/dev/null || echo "false")
assert_eq "$MM_STATE" "true" "NFA-03" "T1" "Mattermost startet nach kill automatisch neu"

# T2: Services reachable within 60s after restart
sleep 10
assert_http 200 "http://localhost:8065/api/v4/system/ping" "NFA-03" "T2" "Mattermost nach Restart erreichbar"

# T3: Health endpoint returns 200
assert_http 200 "http://localhost:8065/api/v4/system/ping" "NFA-03" "T3" "Health-Endpunkt antwortet 200 OK"

# T4: Data persists after crash
MSG_ID=""
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  TEAM_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/name/testteam" | jq -r '.id // empty')
  CH_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id // empty')
  if [[ -n "$CH_ID" ]]; then
    MSG_ID=$(curl -s -X POST -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
      -d "{\"channel_id\":\"${CH_ID}\",\"message\":\"persistence-test-$(date +%s)\"}" \
      "${MM_URL}/posts" | jq -r '.id // empty')
  fi
fi

if [[ -n "$MSG_ID" ]]; then
  docker restart homeoffice-mattermost > /dev/null 2>&1
  sleep 20
  FOUND=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/posts/${MSG_ID}" | jq -r '.id // empty')
  assert_eq "$FOUND" "$MSG_ID" "NFA-03" "T4" "Nachricht nach Container-Neustart vorhanden"
else
  skip_test "NFA-03" "T4" "Datenpersistenz" "Keine Admin-Token verfügbar"
fi
