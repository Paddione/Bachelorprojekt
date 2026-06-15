#!/usr/bin/env bash
set -euo pipefail
cd /home/patrick/Bachelorprojekt
REPO=/home/patrick/Bachelorprojekt

log() { echo "[PREP] $*" >&2; }

# Utility: run with timeout to avoid hanging
rt() { timeout 30 "$@" 2>/dev/null || echo "FAILED"; }

# Source guards for the guard functions
source scripts/factory/guards.sh

final_launch='[]'
final_skipped='[]'

for brand in mentolder korczewski; do
  log "=== $brand ==="

  # --- Step 0: HARD GUARD GATE ---
  skip=false; reason=""

  # Kill-switch
  if GUARDS_REPO=$REPO guard_killswitch_on "$brand"; then
    log "KILLSWITCH ON -> skip $brand"
    skip=true; reason="killswitch"
  fi

  # Daily cap
  if ! "$skip"; then
    if FACTORY_DAILY_DEPLOY_CAP=5 GUARDS_REPO=$REPO guard_daily_cap_reached "$brand"; then
      log "DAILY CAP REACHED -> skip $brand"
      skip=true; reason="daily_cap"
    fi
  fi

  if "$skip"; then
    final_skipped=$(echo "$final_skipped" | jq -c --arg b "$brand" --arg r "$reason" '. + [{"brand":$b,"reason":$r}]')
    continue
  fi

  # --- Step 1: Watchdog ---
  log "Watchdog $brand..."
  BRAND=$brand bash scripts/factory/watchdog.sh 2>&1 | log

  # --- Step 2: Schedule ---
  log "Schedule $brand..."
  schedule_out=$(BRAND=$brand FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh 2>/dev/null)
  log "Schedule result: $schedule_out"

  # Process candidates from schedule
  for row in $(echo "$schedule_out" | jq -c '.[]' 2>/dev/null); do
    [[ -z "$row" ]] && continue
    ext_id=$(echo "$row" | jq -r '.external_id')
    slot=$(echo "$row" | jq -r '.slot')
    log "Processing claimed ticket $ext_id (slot $slot)"

    # Dry-run-first guard
    dry_run=false
    if GUARDS_REPO=$REPO guard_dryrun_ok "$ext_id"; then
      dry_run=false
    else
      dry_run=true
      log "Dry-run check FAILED for $ext_id -> forcing dry_run=true"
    fi

    # Session-coordination guard (T000510)
    al=0
    bash scripts/agent-lock.sh check ticket "$ext_id" 2>/dev/null; al=$? || true
    if [[ "$al" -eq 3 ]]; then
      log "Ticket $ext_id claimed by live interactive session -> releasing slot"
      BRAND=$brand bash scripts/ticket.sh release-slot --id "$ext_id" 2>/dev/null || true
      final_skipped=$(echo "$final_skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

    # Fetch details
    ticket_json=$(BRAND=$brand bash scripts/ticket.sh get --id "$ext_id" 2>/dev/null || echo '{}')
    title=$(echo "$ticket_json" | jq -r '.title // null')
    plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // ""')

    branch=null; plan_path=null
    if [[ -n "$plan_ref" ]]; then
      br=$(echo "$plan_ref" | grep -oP 'branch=\K\S+' || true)
      pp=$(echo "$plan_ref" | grep -oP 'plan=\K\S+' || true)
      [[ -n "$br" ]] && branch="$br"
      [[ -n "$pp" ]] && plan_path="$pp"
    fi

    final_launch=$(echo "$final_launch" | jq -c \
      --arg b "$brand" --arg e "$ext_id" --argjson s "$slot" \
      --arg t "${title:-}" --arg br "${branch:-null}" --arg p "${plan_path:-null}" --argjson dr "$dry_run" \
      '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "dry_run":$dr}]')
  done
done

jq -n --argjson launch "$final_launch" --argjson skipped "$final_skipped" '{launch: $launch, skipped: $skipped}'