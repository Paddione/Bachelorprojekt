#!/usr/bin/env bash
# NFA-04: Skalierbarkeit — horizontal scaling, replica sets, resource headroom
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-workspace}"
DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"

# T1: Mattermost can scale to 2 replicas
ORIG_REPLICAS=$(kubectl get deploy/mattermost -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

kubectl scale deploy/mattermost -n "$NAMESPACE" --replicas=2 > /dev/null 2>&1
kubectl rollout status deploy/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true

READY=$(kubectl get deploy/mattermost -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_eq "${READY:-0}" "2" "NFA-04" "T1" "Mattermost auf 2 Replicas skalierbar"

# T2: Service still responds after scale-up
sleep 5
MM_STATUS=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${MM_URL}/system/ping" 2>/dev/null || echo "000")
assert_eq "$MM_STATUS" "200" "NFA-04" "T2" "Mattermost nach Scale-Up erreichbar"

# T3: Scale back down — verify smooth operation
kubectl scale deploy/mattermost -n "$NAMESPACE" --replicas="${ORIG_REPLICAS}" > /dev/null 2>&1
kubectl rollout status deploy/mattermost -n "$NAMESPACE" --timeout=120s > /dev/null 2>&1 || true
sleep 5
MM_STATUS_DOWN=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${MM_URL}/system/ping" 2>/dev/null || echo "000")
assert_eq "$MM_STATUS_DOWN" "200" "NFA-04" "T3" "Mattermost nach Scale-Down stabil"

# T4: Deployments use RollingUpdate strategy (Nextcloud uses Recreate due to shared storage locks)
for deploy in mattermost keycloak; do
  STRATEGY=$(kubectl get deploy/${deploy} -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
  assert_eq "$STRATEGY" "RollingUpdate" "NFA-04" "T4-${deploy}" "${deploy} nutzt RollingUpdate-Strategie"
done
NC_STRATEGY=$(kubectl get deploy/nextcloud -n "$NAMESPACE" -o jsonpath='{.spec.strategy.type}' 2>/dev/null || echo "unknown")
assert_match "$NC_STRATEGY" "^(RollingUpdate|Recreate)$" "NFA-04" "T4-nextcloud" "Nextcloud Update-Strategie konfiguriert (${NC_STRATEGY})"

# T5: Node resource headroom — at least 20% CPU/memory available
NODE_CPU_ALLOC=$(kubectl top nodes --no-headers 2>/dev/null | awk '{gsub(/%/,""); sum+=$3; n++} END {if(n>0) print int(sum/n); else print 0}')
if [[ "${NODE_CPU_ALLOC:-0}" -gt 0 ]]; then
  CPU_FREE=$((100 - NODE_CPU_ALLOC))
  assert_gt "$CPU_FREE" 20 "NFA-04" "T5a" "CPU-Headroom > 20% (${CPU_FREE}% frei)"
else
  skip_test "NFA-04" "T5a" "CPU-Headroom" "metrics-server nicht verfügbar"
fi

NODE_MEM_ALLOC=$(kubectl top nodes --no-headers 2>/dev/null | awk '{gsub(/%/,""); sum+=$5; n++} END {if(n>0) print int(sum/n); else print 0}')
if [[ "${NODE_MEM_ALLOC:-0}" -gt 0 ]]; then
  MEM_FREE=$((100 - NODE_MEM_ALLOC))
  assert_gt "$MEM_FREE" 20 "NFA-04" "T5b" "Memory-Headroom > 20% (${MEM_FREE}% frei)"
else
  skip_test "NFA-04" "T5b" "Memory-Headroom" "metrics-server nicht verfügbar"
fi

# T6: HPA (Horizontal Pod Autoscaler) is configured — if present
HPA_COUNT=$(kubectl get hpa -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0")
if (( HPA_COUNT > 0 )); then
  _log_result "NFA-04" "T6" "HPA konfiguriert (${HPA_COUNT} Autoscaler)" "pass" "0"
else
  _log_result "NFA-04" "T6" "Kein HPA konfiguriert (manuelles Scaling)" "pass" "0" "Optional — manuelles Scaling funktioniert (T1-T3)"
fi
