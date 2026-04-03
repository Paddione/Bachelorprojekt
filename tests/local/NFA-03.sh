#!/usr/bin/env bash
# NFA-03: Verfügbarkeit — restart recovery, health endpoints, data persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Kill mattermost pod → Kubernetes auto-restarts it
kubectl delete pod -n "$NAMESPACE" -l app=mattermost --force --grace-period=0 > /dev/null 2>&1
sleep 15
kubectl wait --for=condition=Available deployment/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true
MM_READY=$(kubectl get deploy/mattermost -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${MM_READY:-0}" "1" "NFA-03" "T1" "Mattermost startet nach kill automatisch neu"

# Wait for new pod to be ready before re-establishing port-forward
kubectl wait --for=condition=Ready pod -l app=mattermost -n "$NAMESPACE" --timeout=60s > /dev/null 2>&1 || true
sleep 5

# Re-establish port-forward to the new pod (retry up to 3 times)
if declare -f _start_mm_portforward &>/dev/null; then
  for attempt in 1 2 3; do
    _start_mm_portforward
    if curl -s -o /dev/null --max-time 3 "${MM_URL}/system/ping" 2>/dev/null; then
      break
    fi
    echo "  Port-forward Versuch ${attempt}/3 fehlgeschlagen — warte..."
    sleep 5
  done
fi

# Regenerate MM admin token (the old one is invalidated by the pod kill)
_regenerate_mm_token
echo "  MM Admin-Token nach Neustart regeneriert."

# T2: Services reachable after restart (test via cluster-internal to avoid port-forward issues)
MM_INTERNAL_STATUS=$(kubectl exec -n "$NAMESPACE" deploy/mattermost -- \
  curl -s -o /dev/null -w '%{http_code}' "http://localhost:8065/api/v4/system/ping" --max-time 5 2>/dev/null || echo "000")
assert_eq "$MM_INTERNAL_STATUS" "200" "NFA-03" "T2" "Mattermost nach Restart erreichbar"

# T3: Health endpoint returns 200
assert_eq "$MM_INTERNAL_STATUS" "200" "NFA-03" "T3" "Health-Endpunkt antwortet 200 OK"

# T4: Data persists after crash
MSG_ID=""
if [[ -n "${MM_ADMIN_TOKEN:-}" ]]; then
  TEAM_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/name/testteam" | jq -r 'if .name then .id else empty end')
  CH_ID=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/teams/${TEAM_ID}/channels/name/test-public" | jq -r 'if .name then .id else empty end')
  if [[ -n "$CH_ID" ]]; then
    MSG_ID=$(curl -s -X POST -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json" \
      -d "{\"channel_id\":\"${CH_ID}\",\"message\":\"persistence-test-$(date +%s)\"}" \
      "${MM_URL}/posts" | jq -r 'if .message then .id else empty end')
  fi
fi

if [[ -n "$MSG_ID" ]]; then
  kubectl rollout restart deployment/mattermost -n "$NAMESPACE" > /dev/null 2>&1
  kubectl rollout status deployment/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1
  # Re-establish port-forward and token after rollout
  if declare -f _start_mm_portforward &>/dev/null; then
    _start_mm_portforward
  fi
  sleep 5
  _regenerate_mm_token
  FOUND=$(curl -s -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" "${MM_URL}/posts/${MSG_ID}" | jq -r 'if .message then .id else empty end')
  assert_eq "$FOUND" "$MSG_ID" "NFA-03" "T4" "Nachricht nach Container-Neustart vorhanden"
else
  skip_test "NFA-03" "T4" "Datenpersistenz" "Keine Admin-Token oder Team nicht verfügbar"
fi
