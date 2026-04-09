#!/usr/bin/env bash
# NFA-09: Dynamisches DNS (DDNS) — CronJob manifest and configuration
# Note: Actual DNS updates only run in prod. Local tier validates manifests.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

PROJECT_DIR="${SCRIPT_DIR}/.."

# ── T1: DDNS updater manifest exists ────────────────────────────
assert_eq "$(test -f "${PROJECT_DIR}/prod/ddns-updater.yaml" && echo "exists" || echo "missing")" "exists" \
  "NFA-09" "T1" "DDNS-Updater Manifest vorhanden"

# ── T2: Manifest contains CronJob resource ──────────────────────
CRONJOB_KIND=$(grep -c "kind: CronJob" "${PROJECT_DIR}/prod/ddns-updater.yaml" 2>/dev/null || echo "0")
assert_gt "$CRONJOB_KIND" "0" "NFA-09" "T2" "DDNS-Manifest enthält CronJob-Ressource"

# ── T3: CronJob uses ipv64 API ──────────────────────────────────
IPV64_REF=$(grep -c "ipv64" "${PROJECT_DIR}/prod/ddns-updater.yaml" 2>/dev/null || echo "0")
assert_gt "$IPV64_REF" "0" "NFA-09" "T3" "DDNS-CronJob nutzt ipv64 API"

# ── T4: CronJob references ipv64 secret ─────────────────────────
SECRET_REF=$(grep -c "ddns-ipv64-key" "${PROJECT_DIR}/prod/ddns-updater.yaml" 2>/dev/null || echo "0")
assert_gt "$SECRET_REF" "0" "NFA-09" "T4" "DDNS-CronJob referenziert ipv64-Secret"

# ── T5: DDNS Taskfile tasks exist ───────────────────────────────
if grep -q "ddns:" "${PROJECT_DIR}/Taskfile.yml" 2>/dev/null; then
  _log_result "NFA-09" "T5" "DDNS Tasks in Taskfile vorhanden" "pass" "0"
else
  _log_result "NFA-09" "T5" "DDNS Tasks in Taskfile vorhanden" "fail" "0" "Kein ddns: Task gefunden"
fi

# ── T6: CronJob schedule is reasonable (every 5 min) ────────────
SCHEDULE=$(grep -oP 'schedule:\s*"\K[^"]+' "${PROJECT_DIR}/prod/ddns-updater.yaml" 2>/dev/null || echo "")
assert_contains "$SCHEDULE" "*/5" "NFA-09" "T6" "DDNS-CronJob läuft alle 5 Minuten"

