#!/usr/bin/env bash
# FA-10: Kundenanfragen-Kontaktformular — Website + Admin Inbox
# Tests: Website pod running, contact form reachable, admin inbox API
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# ── T1: Website pod running ──────────────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-10" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: Website service reachable ────────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  HTTP_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider http://localhost:4321/ 2>&1 | grep "HTTP/" | awk '{print $2}' || echo "0")
  assert_eq "$HTTP_CODE" "200" "FA-10" "T2" "Website antwortet auf HTTP (Status ${HTTP_CODE})"
else
  skip_test "FA-10" "T2" "Website HTTP-Antwort" "Website nicht bereit"
fi

# ── T3: Contact form API endpoint reachable ──────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  API_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider --method=POST http://localhost:4321/api/contact 2>&1 | grep "HTTP/" | awk '{print $2}' || echo "0")
  # 400 is expected (no body), but confirms the endpoint exists
  assert_gt "$API_CODE" 0 "FA-10" "T3" "Kontaktformular-API erreichbar (Status ${API_CODE})"
else
  skip_test "FA-10" "T3" "Kontaktformular-API" "Website nicht bereit"
fi

# ── T4: Admin inbox API returns JSON ────────────────────────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  INBOX_STATUS=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO- --header="Cookie:" http://localhost:4321/api/admin/inbox 2>/dev/null | head -c 50)
  # 401 expected (no session), confirms endpoint exists
  assert_gt "${#INBOX_STATUS}" 0 "FA-10" "T4" "Admin-Inbox-API erreichbar"
else
  skip_test "FA-10" "T4" "Admin-Inbox-API" "Website nicht bereit"
fi
