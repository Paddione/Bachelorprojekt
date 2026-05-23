#!/usr/bin/env bash
# FA-17: Meeting Lifecycle — Talk, Channels
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"

# ── T1: Reminder feature removed (PR #871 — SMTP auth failure) ────
skip_test "FA-17" "T1" "Reminders" "Feature entfernt in PR #871 (SMTP auth fehlgeschlagen)"

# ── T2: meeting-reminders CronJob removed (PR #871) ───────────────
skip_test "FA-17" "T2" "meeting-reminders CronJob" "Feature entfernt in PR #871"

# ── T3: Nextcloud Talk available (internal) ───────────────────────
NC_NS="${NC_NS:-workspace}"
NC_READY=$(kubectl get deployment nextcloud -n "$NC_NS" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$NC_READY" 0 "FA-17" "T3" "Nextcloud laeuft (Voraussetzung fuer Talk)"

# ── T4: NEXTCLOUD_EXTERNAL_URL configured ─────────────────────────
NC_EXT=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.NEXTCLOUD_EXTERNAL_URL}' 2>/dev/null || echo "")
if [[ -n "$NC_EXT" ]]; then
  assert_contains "$NC_EXT" "files" "FA-17" "T4" "NEXTCLOUD_EXTERNAL_URL konfiguriert"
else
  skip_test "FA-17" "T4" "NC External URL" "Nicht gesetzt"
fi
