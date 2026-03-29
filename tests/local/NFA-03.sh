#!/usr/bin/env bash
# NFA-03: Verfügbarkeit — restart recovery, health endpoints, data persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: Kill mattermost pod → Kubernetes auto-restarts it
kubectl delete pod -n homeoffice -l app=mattermost --force --grace-period=0 > /dev/null 2>&1
sleep 20
MM_READY=$(kubectl get deploy/mattermost -n homeoffice -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${MM_READY:-0}" "1" "NFA-03" "T1" "Mattermost startet nach kill automatisch neu"

# T2: Services reachable within 60s after restart
sleep 10
assert_http 200 "${MM_URL}/api/v4/system/ping" "NFA-03" "T2" "Mattermost nach Restart erreichbar"

# T3: Health endpoint returns 200
assert_http 200 "${MM_URL}/api/v4/system/ping" "NFA-03" "T3" "Health-Endpunkt antwortet 200 OK"

# T4: Data persists after crash
MSG_ID=""
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  TEAM_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/api/v4/teams/name/testteam" | jq -r '.id // empty')
  CH_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/api/v4/teams/${TEAM_ID}/channels/name/test-public" | jq -r '.id // empty')
  if [[ -n "$CH_ID" ]]; then
    MSG_ID=$(curl -s -X POST -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
      -d "{\"channel_id\":\"${CH_ID}\",\"message\":\"persistence-test-$(date +%s)\"}" \
      "${MM_URL}/api/v4/posts" | jq -r '.id // empty')
  fi
fi

if [[ -n "$MSG_ID" ]]; then
  kubectl rollout restart deployment/mattermost -n homeoffice > /dev/null 2>&1
  kubectl rollout status deployment/mattermost -n homeoffice --timeout=60s > /dev/null 2>&1
  FOUND=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/api/v4/posts/${MSG_ID}" | jq -r '.id // empty')
  assert_eq "$FOUND" "$MSG_ID" "NFA-03" "T4" "Nachricht nach Container-Neustart vorhanden"
else
  skip_test "NFA-03" "T4" "Datenpersistenz" "Keine Admin-Token verfügbar"
fi
