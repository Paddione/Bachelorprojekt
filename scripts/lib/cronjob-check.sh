#!/usr/bin/env bash
# cronjob-check.sh — Zählt CronJobs mit fehlgeschlagenem letzten Lauf.
#
# Usage: bash scripts/lib/cronjob-check.sh [namespace]
# Returns: count of failed CronJobs as integer (0 = all good, fail-closed).
# Bewertet werden nur aktive, tatsaechlich geplante CronJobs (T016657):
#   - spec.suspend=true          → ignoriert (pausiert, kein Lauf erwartet)
#   - kein lastScheduleTime      → ignoriert (noch nie geplant, kein Lauf-Ergebnis)
# Ein bewerteter CronJob ist "failed", wenn
#   1. er geplant, aber nie erfolgreich war (kein lastSuccessfulTime), oder
#   2. lastScheduleTime > lastSuccessfulTime (letzter Lauf nicht erfolgreich), oder
#   3. ein Zeitstempel unlesbar ist (fail-closed).
#
# "-" (SKIP): kubectl nicht verfuegbar, Ausgabe leer oder kein bewertbarer CronJob.

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
rated = 0
for cj in items:
    if (cj.get('spec') or {}).get('suspend'):
        continue
    st = cj.get('status') or {}
    ls = st.get('lastScheduleTime')
    lss = st.get('lastSuccessfulTime')
    if not ls:
        continue
    rated += 1
    try:
        ls_dt = datetime.datetime.fromisoformat(ls.replace('Z', '+00:00'))
        lss_dt = datetime.datetime.fromisoformat(lss.replace('Z', '+00:00')) if lss else None
    except Exception:
        bad += 1
        continue
    if lss_dt is None or ls_dt > lss_dt:
        bad += 1

if rated == 0:
    print('-')
    sys.exit(0)
print(bad)
" 2>/dev/null || echo "-"
