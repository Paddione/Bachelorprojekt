#!/usr/bin/env bash
# FA-17: Meeting Lifecycle — Talk, Channels, Reminders
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NS="${WEB_NS:-website}"

WEB_READY=$(kubectl get deployment website -n "$WEB_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

# ── T1: Reminder process endpoint works ───────────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  REM_CODE=$(kubectl exec -n "$WEB_NS" deploy/website -- \
    node -e "fetch('http://localhost:4321/api/reminders/process',{method:'POST'}).then(r=>console.log(r.status))" 2>/dev/null || echo "0")
  assert_eq "$REM_CODE" "200" "FA-17" "T1" "Reminder-Endpoint erreichbar (200)"
else
  skip_test "FA-17" "T1" "Reminders" "Website nicht bereit"
fi

# ── T2: CronJob meeting-reminders defined ─────────────────────────
CJ_COUNT=$(kubectl get cronjob meeting-reminders -n "$WEB_NS" -o name 2>/dev/null | wc -l)
assert_gt "$CJ_COUNT" 0 "FA-17" "T2" "CronJob meeting-reminders definiert"

# ── T3: Nextcloud Talk available (internal) ───────────────────────
NC_NS="${NC_NS:-workspace}"
NC_READY=$(kubectl get deployment nextcloud -n "$NC_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$NC_READY" 0 "FA-17" "T3" "Nextcloud laeuft (Voraussetzung fuer Talk)"

# ── T4: NEXTCLOUD_EXTERNAL_URL configured ─────────────────────────
NC_EXT=$(kubectl get configmap website-config -n "$WEB_NS" \
  -o jsonpath='{.data.NEXTCLOUD_EXTERNAL_URL}' 2>/dev/null || echo "")
if [[ -n "$NC_EXT" ]]; then
  assert_contains "$NC_EXT" "files" "FA-17" "T4" "NEXTCLOUD_EXTERNAL_URL konfiguriert"
else
  skip_test "FA-17" "T4" "NC External URL" "Nicht gesetzt"
fi
