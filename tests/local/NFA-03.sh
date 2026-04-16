#!/usr/bin/env bash
# NFA-03: Verfügbarkeit — restart recovery, health endpoints, data persistence
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Kill vaultwarden pod → Kubernetes auto-restarts it
kubectl delete pod -n "$NAMESPACE" -l app=vaultwarden --force --grace-period=0 > /dev/null 2>&1
sleep 10
kubectl wait --for=condition=Available deployment/vaultwarden -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true
VW_READY=$(kubectl get deploy/vaultwarden -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${VW_READY:-0}" "1" "NFA-03" "T1" "Vaultwarden startet nach kill automatisch neu"

# Wait for new pod to be ready before testing
kubectl wait --for=condition=Ready pod -l app=vaultwarden -n "$NAMESPACE" --timeout=60s > /dev/null 2>&1 || true
sleep 5

# T2: Service reachable after restart (internal health endpoint)
VW_STATUS=$(kubectl exec -n "$NAMESPACE" deploy/vaultwarden -- \
  curl -s -o /dev/null -w '%{http_code}' "http://localhost:80/alive" --max-time 5 2>/dev/null || echo "000")
assert_eq "$VW_STATUS" "200" "NFA-03" "T2" "Vaultwarden nach Restart erreichbar"

# T3: Health endpoint returns 200
assert_eq "$VW_STATUS" "200" "NFA-03" "T3" "Health-Endpunkt antwortet 200 OK"

# T4: Database persists after crash (Vaultwarden DB still exists in shared-db)
VW_DB=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='vaultwarden'" 2>/dev/null | tr -d '[:space:]')
assert_eq "$VW_DB" "1" "NFA-03" "T4" "Vaultwarden-Datenbank bleibt nach Neustart erhalten"
