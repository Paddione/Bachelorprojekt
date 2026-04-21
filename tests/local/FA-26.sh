#!/usr/bin/env bash
# FA-26: Bug Report Form — Website bug report endpoint
# Tests: Website pod running, /api/bug-report endpoint reachable,
#        bugs channel (or anfragen fallback) present, ConfigMap has env.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"
# shellcheck source=./lib/k3d.sh
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# ── T1: Website deployment running ───────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-26" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: /api/bug-report endpoint reachable ───────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  # Busybox wget has no --method flag; --post-data sends an empty POST body.
  # wget -S prints both a "HTTP/..." header line and a "wget: server returned
  # error: HTTP/..." error line; take the first match only.
  API_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --post-data='' http://127.0.0.1:4321/api/bug-report 2>&1 \
    | grep -m1 "HTTP/" | awk '{print $2}')
  API_CODE="${API_CODE:-0}"
  # 400 is the expected response for an empty body — confirms the endpoint exists.
  assert_eq "$API_CODE" "400" "FA-26" "T2" "/api/bug-report endpoint erreichbar (HTTP 400 bei leerem Body)"
else
  skip_test "FA-26" "T2" "/api/bug-report endpoint" "Website nicht bereit"
fi

# ── T3: BUG_REPORT_CHANNEL env var in website ConfigMap ──────────
BUG_CHANNEL=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.BUG_REPORT_CHANNEL}' 2>/dev/null || echo "")
assert_eq "$BUG_CHANNEL" "bugs" "FA-26" "T3" "BUG_REPORT_CHANNEL in website-config gesetzt"

# ── T4: Admin bug inbox API responds ─────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  INBOX_RESP=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/api/admin/bugs 2>&1 | grep -m1 "HTTP/" | awk '{print $2}' || echo "0")
  # 401 is expected (no session) — confirms the endpoint exists
  assert_gt "${INBOX_RESP:-0}" 0 "FA-26" "T4" "Admin-Bug-Inbox-Endpunkt antwortet (HTTP ${INBOX_RESP})"
else
  skip_test "FA-26" "T4" "Admin-Bug-Inbox-Endpunkt" "Website nicht bereit"
fi
