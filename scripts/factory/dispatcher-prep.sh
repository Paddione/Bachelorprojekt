#!/usr/bin/env bash
# dispatcher-prep.sh — wrapper for the PREP step
# Usage: bash scripts/factory/dispatcher-prep.sh
set -euo pipefail
cd /home/patrick/Bachelorprojekt
REPO=/home/patrick/Bachelorprojekt

echo "[PREP] Starting dispatcher PREP step"
launch='[]'
skipped='[]'

for brand in mentolder korczewski; do
  echo "[PREP] === Brand: $brand ==="
  skip=false; reason=""

  # --- Step 0: HARD GUARD GATE ---
  g=$(bash scripts/ticket.sh factory-control get --key killswitch 2>/dev/null || echo "FAILED")
  b=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null || echo "FAILED")

  if [[ "$g" == "FAILED" || "$b" == "FAILED" ]]; then
    echo "[PREP] Kill-switch read FAILED (g=$g b=$b) -> fail-closed skip"
    skip=true; reason="killswitch_read_error"
  elif printf '%s\n%s\n' "$g" "$b" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$'; then
    echo "[PREP] Kill-switch ON -> skip $brand"
    skip=true; reason="killswitch"
  else
    echo "[PREP] Kill-switch OFF (g='$g' b='$b')"
  fi

  # Daily-cap
  if ! "$skip"; then
    cap="${FACTORY_DAILY_DEPLOY_CAP:-5}"
    count=$(bash "$REPO/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null || echo "FAILED")
    if [[ "$count" == "FAILED" ]]; then
      echo "[PREP] Daily-cap read FAILED -> fail-closed skip"
      skip=true; reason="daily_cap_read_error"
    else
      count=$(echo "$count" | tr -d '[:space:]')
      [[ "$count" =~ ^[0-9]+$ ]] || count=0
      if (( count >= cap )); then
        echo "[PREP] Daily cap reached ($count >= $cap) -> skip"
        skip=true; reason="daily_cap"
      else
        echo "[PREP] Daily cap OK ($count < $cap)"
      fi
    fi
  fi

  if "$skip"; then
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "$reason" '. + [{"brand":$b,"reason":$r}]')
    continue
  fi

  # --- Step 1: Watchdog ---
  echo "[PREP] Watchdog $brand..."
  export BRAND="$brand"
  wd_out=$(bash "$REPO/scripts/factory/watchdog.sh" 2>&1) || true
  echo "[PREP] Watchdog result: $wd_out"

  # --- Step 2: Schedule ---
  echo "[PREP] Schedule $brand..."
  schedule_out=$(FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh" 2>&1) || true
  echo "[PREP] Schedule raw: $schedule_out"

  # Process claimed tickets
  if echo "$schedule_out" | jq -e '. | type == "array"' >/dev/null 2>&1; then
    for row in $(echo "$schedule_out" | jq -c '.[]' 2>/dev/null); do
      [[ -z "$row" ]] && continue
      ext_id=$(echo "$row" | jq -r '.external_id')
      slot=$(echo "$row" | jq -r '.slot')
      echo "[PREP] Processing claimed ticket $ext_id (slot $slot)"

      # Dry-run-first guard
      dry_run=false
      if bash "$REPO/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then
        echo "[PREP] Dry-run ok for $ext_id"
      else
        dry_run=true
        echo "[PREP] Dry-run NOT ok for $ext_id -> forcing dry_run=true"
      fi

      # Session-coordination guard (T000510)
      al=0
      bash "$REPO/scripts/agent-lock.sh" check ticket "$ext_id" 2>/dev/null; al=$? || true
      if [[ "$al" -eq 3 ]]; then
        echo "[PREP] Ticket $ext_id claimed by live interactive session -> releasing slot"
        bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" 2>/dev/null || true
        skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
        continue
      fi

      # Fetch ticket details
      ticket_json=$(bash "$REPO/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null || echo '{}')
      title=$(echo "$ticket_json" | jq -r '.title // null')
      plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // ""')
      echo "[PREP] Ticket $ext_id: title='$title' plan_ref='$plan_ref'"

      branch=null; plan_path=null
      if [[ -n "$plan_ref" ]]; then
        br=$(echo "$plan_ref" | grep -oP 'branch=\K\S+' || true)
        pp=$(echo "$plan_ref" | grep -oP 'plan=\K\S+' || true)
        [[ -n "$br" ]] && branch="$br"
        [[ -n "$pp" ]] && plan_path="$pp"
      fi

      launch=$(echo "$launch" | jq -c \
        --arg b "$brand" --arg e "$ext_id" --argjson s "$slot" \
        --arg t "${title:-}" --arg br "${branch:-null}" --arg p "${plan_path:-null}" --argjson dr "$dry_run" \
        '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "dry_run":$dr}]')
    done
  fi
done

echo "[PREP] Final JSON output:"
jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{launch: $launch, skipped: $skipped}'