#!/usr/bin/env bash
# FA-26: Bug Report Form — Website + Mattermost bugs channel
# Tests: Website pod running, /api/bug-report endpoint reachable,
#        bugs channel (or anfragen fallback) present, ConfigMap has env.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"
# shellcheck source=./lib/k3d.sh
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"
MM_NAMESPACE="${NAMESPACE:-workspace}"

# ── T1: Website deployment running ───────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-26" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: /api/bug-report endpoint reachable ───────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  API_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider --method=POST http://localhost:4321/api/bug-report 2>&1 \
    | grep "HTTP/" | awk '{print $2}' || echo "0")
  # 400 is the expected response for an empty body — confirms the endpoint exists.
  assert_eq "$API_CODE" "400" "FA-26" "T2" "/api/bug-report endpoint erreichbar (HTTP 400 bei leerem Body)"
else
  skip_test "FA-26" "T2" "/api/bug-report endpoint" "Website nicht bereit"
fi

# ── T3: BUG_REPORT_CHANNEL env var in website ConfigMap ──────────
BUG_CHANNEL=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.BUG_REPORT_CHANNEL}' 2>/dev/null || echo "")
assert_eq "$BUG_CHANNEL" "bugs" "FA-26" "T3" "BUG_REPORT_CHANNEL in website-config gesetzt"

# ── T4: bugs channel (or fallback anfragen) present in Mattermost ─
CHAN_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local channel list --all 2>/dev/null | grep -cE "^bugs$|^anfragen$|[[:space:]]bugs[[:space:]]|[[:space:]]anfragen[[:space:]]" || echo "0")
assert_gt "$CHAN_COUNT" 0 "FA-26" "T4" "bugs- oder anfragen-Kanal in Mattermost vorhanden"
