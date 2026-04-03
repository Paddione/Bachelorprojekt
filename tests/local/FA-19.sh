#!/usr/bin/env bash
# FA-19: Outline Knowledge Base — Deployment, DB, OIDC
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WS_NS="${WS_NS:-workspace}"

# ── T1: Outline pod running ──────────────────────────────────────
OL_READY=$(kubectl get deployment outline -n "$WS_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$OL_READY" 0 "FA-19" "T1" "Outline-Deployment laeuft (readyReplicas > 0)"

# ── T2: Outline /api/info reachable ──────────────────────────────
if [[ "$OL_READY" -gt 0 ]]; then
  API_CODE=$(kubectl exec -n "$WS_NS" deploy/outline -- \
    curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/api/info 2>/dev/null || echo "0")
  assert_gt "$API_CODE" 0 "FA-19" "T2" "Outline API erreichbar (${API_CODE})"
else
  skip_test "FA-19" "T2" "Outline API" "Outline nicht bereit"
fi

# ── T3: Outline database in shared-db ─────────────────────────────
DB_READY=$(kubectl get deployment shared-db -n "$WS_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$DB_READY" -gt 0 ]]; then
  DB_EXISTS=$(kubectl exec -n "$WS_NS" deploy/shared-db -- \
    psql -U postgres -lqt 2>/dev/null | grep -c "outline" || echo "0")
  assert_gt "$DB_EXISTS" 0 "FA-19" "T3" "Outline-Datenbank in shared-db vorhanden"
else
  skip_test "FA-19" "T3" "Outline DB" "shared-db nicht bereit"
fi

# ── T4: Outline PVC exists ────────────────────────────────────────
PVC_COUNT=$(kubectl get pvc outline-data -n "$WS_NS" -o name 2>/dev/null | wc -l)
assert_gt "$PVC_COUNT" 0 "FA-19" "T4" "Outline PVC definiert"

# ── T5: OUTLINE_URL in website ConfigMap ──────────────────────────
OL_URL=$(kubectl get configmap website-config -n website \
  -o jsonpath='{.data.OUTLINE_URL}' 2>/dev/null || echo "")
assert_contains "$OL_URL" "outline" "FA-19" "T5" "OUTLINE_URL in Website-ConfigMap"
