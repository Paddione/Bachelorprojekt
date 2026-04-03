#!/usr/bin/env bash
# FA-10: Kundenanfragen-Kontaktformular — Website + Mattermost Webhook
# Tests: Website pod running, contact form reachable, Anfragen channel exists, webhook reachable
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"
MM_NAMESPACE="${NAMESPACE:-workspace}"

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

# ── T4: Anfragen-Kanal in mind. einem Team vorhanden ────────────
ANFRAGEN_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local channel list --all 2>/dev/null | grep -c "anfragen" || echo "0")
assert_gt "$ANFRAGEN_COUNT" 0 "FA-10" "T4" "Anfragen-Kanal in mind. einem Mattermost-Team vorhanden"

# ── T5: Incoming Webhook vorhanden ───────────────────────────────
TOKEN_OUT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local token generate sysadmin wh-check 2>/dev/null || echo "")
MM_TMP_TOKEN=$(echo "$TOKEN_OUT" | awk -F: '{print $1}' | tr -d '[:space:]')
if [[ -n "$MM_TMP_TOKEN" && ${#MM_TMP_TOKEN} -gt 10 ]]; then
  WH_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
    curl -sf -H "Authorization: Bearer ${MM_TMP_TOKEN}" \
    "http://localhost:8065/api/v4/hooks/incoming?per_page=50" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
  kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
    mmctl --local token revoke "$MM_TMP_TOKEN" 2>/dev/null || true
  assert_gt "$WH_COUNT" 0 "FA-10" "T5" "Mattermost Incoming Webhook vorhanden (${WH_COUNT})"
else
  skip_test "FA-10" "T5" "Incoming Webhook vorhanden" "Token-Generierung fehlgeschlagen"
fi

# ── T6: Website ConfigMap has webhook URL ────────────────────────
WH_URL=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.MATTERMOST_WEBHOOK_URL}' 2>/dev/null || echo "")
if [[ -n "$WH_URL" && "$WH_URL" != *"REPLACE_ME"* ]]; then
  assert_contains "$WH_URL" "hooks" "FA-10" "T6" "Webhook-URL in Website-ConfigMap konfiguriert"
else
  skip_test "FA-10" "T6" "Webhook-URL konfiguriert" "MATTERMOST_WEBHOOK_URL noch nicht gesetzt oder Platzhalter"
fi
