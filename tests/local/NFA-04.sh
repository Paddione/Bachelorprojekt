#!/usr/bin/env bash
# NFA-04: Skalierbarkeit — replica scaling, rolling update strategy (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Mattermost can scale to 2 replicas
ORIG_REPLICAS=$(kubectl get deploy/mattermost -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

kubectl scale deploy/mattermost -n "$NAMESPACE" --replicas=2 > /dev/null 2>&1
kubectl rollout status deploy/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true

READY=$(kubectl get deploy/mattermost -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${READY:-0}" "2" "NFA-04" "T1" "Mattermost auf 2 Replicas skalierbar"

# T2: Service still responds after scale-up
sleep 5
MM_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${MM_URL}/system/ping" 2>/dev/null || echo "000")
assert_eq "$MM_STATUS" "200" "NFA-04" "T2" "Mattermost nach Scale-Up erreichbar"

# T3: Scale back down — verify smooth operation
kubectl scale deploy/mattermost -n "$NAMESPACE" --replicas="${ORIG_REPLICAS}" > /dev/null 2>&1
kubectl rollout status deploy/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true
sleep 5
MM_STATUS_DOWN=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${MM_URL}/system/ping" 2>/dev/null || echo "000")
assert_eq "$MM_STATUS_DOWN" "200" "NFA-04" "T3" "Mattermost nach Scale-Down stabil"

# T4: Deployments use RollingUpdate strategy
for deploy in mattermost keycloak; do
  STRATEGY=$(kubectl get deploy/${deploy} -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
  assert_eq "$STRATEGY" "RollingUpdate" "NFA-04" "T4-${deploy}" "${deploy} nutzt RollingUpdate-Strategie"
done
NC_STRATEGY=$(kubectl get deploy/nextcloud -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
assert_match "$NC_STRATEGY" "^(RollingUpdate|Recreate)$" "NFA-04" "T4-nextcloud" "Nextcloud Update-Strategie konfiguriert (${NC_STRATEGY})"

# T5: Multiple deployments exist (horizontal separation)
DEPLOY_COUNT=$(kubectl get deploy -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
assert_gt "$DEPLOY_COUNT" 3 "NFA-04" "T5" "Mindestens 4 separate Deployments (${DEPLOY_COUNT} vorhanden)"
