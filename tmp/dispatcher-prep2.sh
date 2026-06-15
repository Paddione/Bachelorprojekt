#!/usr/bin/env bash
# Minimal Factory dispatcher PREP — no source, direct calls
set -euo pipefail
REPO="/home/patrick/Bachelorprojekt"
cd "$REPO"

launch='[]'
skipped='[]'

# Helper: run a guard by calling ticket.sh directly
guard_killswitch() {
  local brand="$1"
  local g b
  g=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null || echo "ERROR")
  b=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null || echo "ERROR")
  printf '%s\n%s\n' "$g" "$b" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' && return 0
  return 1
}

guard_daily_cap() {
  local brand="$1" cap=5 count
  count=$(bash "$REPO/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null || echo "0")
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  (( count >= cap ))
}

guard_dryrun_ok() {
  local ext_id="$1"
  if bash "$REPO/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then return 0; fi
  return 1
}

# Process one brand
process_brand() {
  local brand="$1" ks cap wd_out wd_exit sc_out sc_exit ids ext_id slot dr_exit al_out al_exit ticket_json title plan_ref branch plan_path pb pp dr item entry
  echo "=== brand=$brand ==="

  # Step 0a: killswitch
  echo "  checking killswitch..."
  if guard_killswitch "$brand"; then
    echo "  KILLSWITCH ON -> skip"
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "killswitch" '. + [{"brand": $b, "reason": $r}]')
    return 0
  fi
  # Step 0b: daily cap
  echo "  checking daily cap..."
  if guard_daily_cap "$brand"; then
    echo "  DAILY CAP REACHED -> skip"
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "daily_cap" '. + [{"brand": $b, "reason": $r}]')
    return 0
  fi
  echo "  guards OK"

  # Step 1: watchdog
  echo "  running watchdog..."
  BRAND="$brand" bash "$REPO/scripts/factory/watchdog.sh" 2>&1 || true

  # Step 2: schedule
  echo "  running schedule..."
  sc_out=$(BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh" 2>&1) || true
  echo "  schedule output: $sc_out"

  ids=$(echo "$sc_out" | jq -c '.[]' 2>/dev/null || echo "")
  [ -z "$ids" ] && { echo "  no tickets claimed"; return 0; }

  while IFS= read -r item; do
    ext_id=$(echo "$item" | jq -r '.external_id // empty')
    slot=$(echo "$item" | jq -r '.slot // 0')
    [ -z "$ext_id" ] && continue
    echo "  claimed: $ext_id slot=$slot"

    # Dry-run guard
    dr=false
    if guard_dryrun_ok "$ext_id"; then :; else dr=true; fi
    echo "    dry_run=$dr"

    # Session coordination guard
    al_out=$(bash "$REPO/scripts/agent-lock.sh" check ticket "$ext_id" 2>&1)
    al_exit=$?
    if [ "$al_exit" -eq 3 ]; then
      echo "    held by live session, releasing slot"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" 2>/dev/null || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand": $b, "reason": $r}]')
      continue
    fi
    echo "    agent-lock: ok (exit $al_exit)"

    # Fetch details
    ticket_json=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null || echo '{}')
    title=$(echo "$ticket_json" | jq -r '.title // empty' 2>/dev/null || echo "")
    plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // empty' 2>/dev/null || echo "")
    echo "    title=$title"

    branch=null
    plan_path=null
    if [ -n "$plan_ref" ]; then
      pb=$(echo "$plan_ref" | grep -oP 'branch=\K\S+' || echo "")
      pp=$(echo "$plan_ref" | grep -oP 'plan=\K\S+' || echo "")
      [ -n "$pb" ] && branch="\"$pb\""
      [ -n "$pp" ] && plan_path="\"$pp\""
    fi

    entry=$(jq -n \
      --arg b "$brand" --arg e "$ext_id" --argjson s "$slot" --arg t "$title" \
      --argjson br "$branch" --argjson pp "$plan_path" --argjson dr "$dr" \
      '{"brand":$b,"external_id":$e,"slot":$s,"title":$t,"branch":$br,"plan_path":$pp,"dry_run":$dr}')
    launch=$(echo "$launch" | jq -c --argjson e "$entry" '. + [$e]')
    echo "    added to launch"
  done < <(echo "$ids")
}

process_brand mentolder
process_brand korczewski

jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{"launch":$launch,"skipped":$skipped}'
