#!/usr/bin/env bash
# scripts/cbm-refresh-cron.sh — Periodischer Auto-Refresh fuer codebase-memory-mcp (K3)
#
# Prueft vor Reindexierung per Helper-Status (index_status und detect_changes plus
# Receipt) auf Drift (skip-if-fresh). Bei Drift wird der Refresh serialisiert ueber
# scripts/mcp/cbm-single-flight.sh ausgefuehrt.
#
# Cron-Eintrag (hourly, bzw. 0 */4 * * * bei Fallback):
#   0 * * * * bash /home/patrick/Bachelorprojekt/scripts/cbm-refresh-cron.sh >> /tmp/cbm-refresh-cron.log 2>&1
#   0 */4 * * * bash /home/patrick/Bachelorprojekt/scripts/cbm-refresh-cron.sh >> /tmp/cbm-refresh-cron.log 2>&1
#
# Usage:
#   scripts/cbm-refresh-cron.sh [--dry-run] [--repo PATH] [--project NAME] [--timeout SECONDS]
#
# Output:
#   stdout: genau eine Zeile JSON mit .status ("fresh-skip", "would-refresh", "refreshed" oder "unknown")
#   stderr: Diagnosemeldungen (unterdrueckt bei --dry-run)
# Exit:
#   0: fresh-skip, would-refresh oder refreshed
#   1: unknown (kein valider Freshness-Nachweis)
#   2: Ungueltige Argumente

set -euo pipefail

DRY_RUN=false
REPO_ARG=""
PROJECT="${CBM_PROJECT:-home-patrick-Bachelorprojekt}"
TIMEOUT="${CBM_STATUS_TIMEOUT:-30}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --repo) [ "$#" -ge 2 ] || { echo "Missing value for --repo" >&2; exit 2; }; REPO_ARG="$2"; shift 2 ;;
    --project) [ "$#" -ge 2 ] || { echo "Missing value for --project" >&2; exit 2; }; PROJECT="$2"; shift 2 ;;
    --timeout) [ "$#" -ge 2 ] || { echo "Missing value for --timeout" >&2; exit 2; }; TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

log() {
  if [ "$DRY_RUN" = "false" ]; then
    echo "[cbm-refresh-cron] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >&2
  fi
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$HERE/mcp/cbm-freshness.py"
WRAPPER="$HERE/mcp/cbm-single-flight.sh"

if [ -n "$REPO_ARG" ]; then
  REPO="$REPO_ARG"
else
  REPO="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo "$HERE")"
fi

if [ ! -f "$HELPER" ]; then
  echo '{"status":"unknown","reasons":["helper-missing"],"refresh_allowed":false}' 
  exit 1
fi

HELPER_ERR="/tmp/cbm-status-$$.err"
STATUS_JSON=""
HELPER_EXIT=0
if [ "$DRY_RUN" = "true" ]; then
  set +e
  STATUS_JSON=$(python3 "$HELPER" status --repo "$REPO" --project "$PROJECT" --timeout "$TIMEOUT" 2>/dev/null)
  HELPER_EXIT=$?
  set -e
else
  set +e
  STATUS_JSON=$(python3 "$HELPER" status --repo "$REPO" --project "$PROJECT" --timeout "$TIMEOUT" 2>"$HELPER_ERR")
  HELPER_EXIT=$?
  set -e
  if [ -s "$HELPER_ERR" ]; then
    cat "$HELPER_ERR" >&2 || true
  fi
fi
rm -f "$HELPER_ERR"

if [ -z "$STATUS_JSON" ]; then
  echo '{"status":"unknown","reasons":["helper-failed"],"refresh_allowed":false}'
  exit 1
fi

export STATUS_JSON_JSON="$STATUS_JSON"
read -r FRESH_STATUS REFRESH_ALLOWED < <(python3 -c '
import json,os
try:
  d=json.loads(os.environ.get("STATUS_JSON_JSON","{}"))
  print(d.get("status","")+" "+("true" if d.get("refresh_allowed") else "false"))
except Exception:
  print(" unknown false")
' 2>/dev/null || echo "unknown false")

emit_mapped() {
  local mapped="$1"
  python3 -c '
import json,os,sys,time
from datetime import datetime,timezone
raw=os.environ.get("STATUS_JSON_JSON","{}")
try:
  d=json.loads(raw)
except Exception:
  d={}
mapped=sys.argv[1]
d["status"]=mapped
try:
  rec=d.get("receipt") or {}
  ts=rec.get("timestamp","")
  if ts:
    dt=datetime.fromisoformat(ts.replace("Z","+00:00"))
    age=int(time.time()-dt.timestamp())
  else:
    age=999999
except Exception:
  age=999999
d["last_refresh_age_s"]=age
try:
  dc=(d.get("dirty") or {}).get("count",0)
  uc=(d.get("untracked") or {}).get("count",0)
  d["changed_count"]=int(dc)+int(uc)
except Exception:
  d["changed_count"]=0
print(json.dumps(d,ensure_ascii=False,sort_keys=True))
' "$mapped"
}

if [ "$FRESH_STATUS" = "fresh" ] && [ "$HELPER_EXIT" -eq 0 ]; then
  emit_mapped "fresh-skip"
  exit 0
fi

if [ "$REFRESH_ALLOWED" = "true" ]; then
  if [ "$DRY_RUN" = "true" ]; then
    emit_mapped "would-refresh"
    exit 0
  fi
  log "Starting fast refresh for project $PROJECT (repo=$REPO)"
  start_s=$(date +%s)
  set +e
  bash "$WRAPPER" "{\"repo_path\": \"$REPO\", \"mode\": \"fast\", \"persistence\": true}" 1>&2 2>&2
  WRAP_EXIT=$?
  set -e
  end_s=$(date +%s)
  duration_s=$((end_s - start_s))
  if [ "$WRAP_EXIT" -ne 0 ]; then
    python3 -c '
import json,os
raw=os.environ.get("STATUS_JSON_JSON","{}")
try:
  d=json.loads(raw)
except Exception:
  d={}
d["status"]="unknown"
r=set(d.get("reasons",[])); r.add("refresh-failed"); d["reasons"]=sorted(r)
d["refresh_allowed"]=False
print(json.dumps(d,ensure_ascii=False,sort_keys=True))
'
    exit 1
  fi
  log "Refresh complete in ${duration_s}s"
  python3 -c '
import json,os,sys
raw=os.environ.get("STATUS_JSON_JSON","{}")
try:
  d=json.loads(raw)
except Exception:
  d={}
d["status"]="refreshed"
d["duration_s"]=int(sys.argv[1])
print(json.dumps(d,ensure_ascii=False,sort_keys=True))
' "$duration_s"
  exit 0
fi

printf '%s\n' "$STATUS_JSON"
exit 1
