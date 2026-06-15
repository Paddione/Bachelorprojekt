#!/usr/bin/env bash
# Software Factory dispatcher PREP step — run deterministic scripts and report only.
set -euo pipefail
REPO="/home/patrick/Bachelorprojekt"
cd "$REPO"

# Initialize result arrays
launch='[]'
skipped='[]'

# Source guards once
source scripts/factory/guards.sh

process_brand() {
  local brand="$1"
  local ks_exit cap_exit wd_exit sc_exit schedule_out
  local ids id_array item ext_id slot dry_run dr_exit al_exit al_out
  local ticket_json title plan_ref branch plan_path parsed_branch parsed_plan entry

  # ── Step 0: HARD-GUARD GATE ──
  echo "--- brand=$brand GUARDS ---"
  set +e
  GUARDS_REPO="$REPO" guard_killswitch_on "$brand"
  ks_exit=$?
  FACTORY_DAILY_DEPLOY_CAP=5 GUARDS_REPO="$REPO" guard_daily_cap_reached "$brand"
  cap_exit=$?
  set -e

  if [ "$ks_exit" -eq 0 ]; then
    echo "GUARD: killswitch ON for $brand -> SKIP"
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "killswitch" '. + [{"brand": $b, "reason": $r}]')
    return 0
  fi
  if [ "$cap_exit" -eq 0 ]; then
    echo "GUARD: daily cap reached for $brand -> SKIP"
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "daily_cap" '. + [{"brand": $b, "reason": $r}]')
    return 0
  fi
  echo "GUARD: OK for $brand (killswitch=off, daily_cap=not_reached)"

  # ── Step 1: Watchdog sweep ──
  echo "--- brand=$brand WATCHDOG ---"
  set +e
  BRAND="$brand" bash scripts/factory/watchdog.sh 2>&1
  wd_exit=$?
  set -e
  echo "WATCHDOG: exit=$wd_exit"

  # ── Step 2: Schedule ──
  echo "--- brand=$brand SCHEDULE ---"
  set +e
  schedule_out=$(BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh 2>&1)
  sc_exit=$?
  set -e
  if [ "$sc_exit" -ne 0 ]; then
    echo "SCHEDULE: FAILED (exit $sc_exit), skip"
    echo "SCHEDULE_OUT: $schedule_out"
    return 0
  fi
  echo "SCHEDULE_OUT: $schedule_out"

  # Parse claimed tickets
  ids=$(echo "$schedule_out" | jq -c '.[]' 2>/dev/null || echo "")
  [ -z "$ids" ] && { echo "SCHEDULE: no tickets claimed"; return 0; }

  # Use process substitution to avoid subshell
  while IFS= read -r item; do
    [ -z "$item" ] && continue
    ext_id=$(echo "$item" | jq -r '.external_id // empty')
    slot=$(echo "$item" | jq -r '.slot // 0')
    [ -z "$ext_id" ] && continue

    echo "CLAIMED: $brand/$ext_id slot=$slot"

    # ── DRY-RUN-FIRST GUARD ──
    dry_run="false"
    set +e
    GUARDS_REPO="$REPO" guard_dryrun_ok "$ext_id"
    dr_exit=$?
    set -e
    if [ "$dr_exit" -ne 0 ]; then
      dry_run="true"
      echo "  DRY-RUN: $ext_id not yet dry-run"
    fi

    # ── SESSION-COORDINATION GUARD ──
    set +e
    al_out=$(bash scripts/agent-lock.sh check ticket "$ext_id" 2>&1)
    al_exit=$?
    set -e
    echo "  AGENT-LOCK: exit=$al_exit"
    if [ "$al_exit" -eq 3 ]; then
      echo "  SESSION-COORDINATION: held by live session, releasing slot"
      set +e
      BRAND="$brand" bash scripts/ticket.sh release-slot --id "$ext_id" 2>&1
      set -e
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand": $b, "reason": $r}]')
      continue
    fi

    # ── FETCH TICKET DETAILS ──
    set +e
    ticket_json=$(BRAND="$brand" bash scripts/ticket.sh get --id "$ext_id" 2>/dev/null || echo '{}')
    set -e
    title=$(echo "$ticket_json" | jq -r '.title // empty' 2>/dev/null || echo "")
    plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // empty' 2>/dev/null || echo "")
    echo "  TICKET: title='$title' plan_ref='${plan_ref:0:100}'"

    branch="null"
    plan_path="null"
    if [ -n "$plan_ref" ]; then
      parsed_branch=$(echo "$plan_ref" | grep -oP 'branch=\K\S+' || echo "")
      parsed_plan=$(echo "$plan_ref" | grep -oP 'plan=\K\S+' || echo "")
      [ -n "$parsed_branch" ] && branch="\"$parsed_branch\""
      [ -n "$parsed_plan" ] && plan_path="\"$parsed_plan\""
    fi

    entry=$(jq -n \
      --arg b "$brand" \
      --arg e "$ext_id" \
      --argjson s "$slot" \
      --arg t "$title" \
      --argjson br "$branch" \
      --argjson pp "$plan_path" \
      --argjson dr "$dry_run" \
      '{"brand": $b, "external_id": $e, "slot": $s, "title": $t, "branch": $br, "plan_path": $pp, "dry_run": $dr}')
    launch=$(echo "$launch" | jq -c --argjson e "$entry" '. + [$e]')
    echo "  LAUNCH: $ext_id (dry_run=$dry_run)"
  done < <(echo "$ids")
}

# Process both brands
process_brand "mentolder"
process_brand "korczewski"

# Final output
echo "========= DISPATCHER-PREP RESULT ========="
jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{"launch": $launch, "skipped": $skipped}'
echo "=========================================="
