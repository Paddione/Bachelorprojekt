#!/usr/bin/env bash
# cronjob-check.sh — Zählt CronJobs mit fehlgeschlagenem letzten Lauf.
#
# Usage: bash scripts/lib/cronjob-check.sh [namespace]
# Returns: count of failed CronJobs as integer (0 = all good, fail-closed).
# A CronJob is "failed" if:
#   1. No lastScheduleTime (never ran)
#   2. lastScheduleTime > lastSuccessfulTime (scheduled but not successful)
#
# Fail-closed: if kubectl is unavailable or output is empty, returns "-" (SKIP).

NAMESPACE="${1:-workspace}"
CTX="${HG_OPS_CTX:-fleet}"

kubectl get cronjobs -n "$NAMESPACE" --context "$CTX" -o json 2>/dev/null | \
python3 -c "
import json, sys, datetime

data = json.load(sys.stdin)
items = data.get('items', [])
if not items:
    print('-')
    sys.exit(0)

bad = 0
for cj in items:
    ls = cj['status'].get('lastScheduleTime')
    lss = cj['status'].get('lastSuccessfulTime')

    if not ls:
        # Never ran — counts as failed.
        bad += 1
        continue

    try:
        ls_dt = datetime.datetime.fromisoformat(ls.replace('Z', '+00:00'))
    except Exception:
        bad += 1
        continue

    if not lss:
        # Scheduled but never successful.
        bad += 1
        continue

    try:
        lss_dt = datetime.datetime.fromisoformat(lss.replace('Z', '+00:00'))
    except Exception:
        bad += 1
        continue

    if ls_dt > lss_dt:
        # Last schedule time is after last successful time.
        bad += 1

print(bad)
" 2>/dev/null || echo "-"
