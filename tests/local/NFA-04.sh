#!/usr/bin/env bash
# NFA-04: Skalierbarkeit — replica scaling, rolling update strategy (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: Vaultwarden can scale to 2 replicas
ORIG_REPLICAS=$(kubectl get deploy/vaultwarden -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

kubectl scale deploy/vaultwarden -n "$NAMESPACE" --replicas=2 > /dev/null 2>&1
kubectl rollout status deploy/vaultwarden -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true

READY=$(kubectl get deploy/vaultwarden -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${READY:-0}" "2" "NFA-04" "T1" "Vaultwarden auf 2 Replicas skalierbar"

# T2: Service still responds after scale-up
sleep 5
VW_STATUS=$(kubectl exec -n "$NAMESPACE" deploy/vaultwarden -- \
  curl -s -o /dev/null -w '%{http_code}' "http://localhost:80/alive" --max-time 5 2>/dev/null || echo "000")
assert_eq "$VW_STATUS" "200" "NFA-04" "T2" "Vaultwarden nach Scale-Up erreichbar"

# T3: Scale back down — verify smooth operation
kubectl scale deploy/vaultwarden -n "$NAMESPACE" --replicas="${ORIG_REPLICAS}" > /dev/null 2>&1
kubectl rollout status deploy/vaultwarden -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true
sleep 5
VW_STATUS_DOWN=$(kubectl exec -n "$NAMESPACE" deploy/vaultwarden -- \
  curl -s -o /dev/null -w '%{http_code}' "http://localhost:80/alive" --max-time 5 2>/dev/null || echo "000")
assert_eq "$VW_STATUS_DOWN" "200" "NFA-04" "T3" "Vaultwarden nach Scale-Down stabil"

# T4: Deployments use RollingUpdate strategy
for deploy in vaultwarden keycloak; do
  STRATEGY=$(kubectl get deploy/${deploy} -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
  assert_eq "$STRATEGY" "RollingUpdate" "NFA-04" "T4-${deploy}" "${deploy} nutzt RollingUpdate-Strategie"
done
NC_STRATEGY=$(kubectl get deploy/nextcloud -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
assert_match "$NC_STRATEGY" "^(RollingUpdate|Recreate)$" "NFA-04" "T4-nextcloud" "Nextcloud Update-Strategie konfiguriert (${NC_STRATEGY})"

# T5: Multiple deployments exist (horizontal separation)
DEPLOY_COUNT=$(kubectl get deploy -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
assert_gt "$DEPLOY_COUNT" 3 "NFA-04" "T5" "Mindestens 4 separate Deployments (${DEPLOY_COUNT} vorhanden)"
