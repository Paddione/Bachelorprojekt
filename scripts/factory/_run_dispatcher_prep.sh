#!/usr/bin/env bash
# Dispatcher PREP — runs all steps and outputs results as structured text
set -uo pipefail

REPO=/home/patrick/Bachelorprojekt

# Track results
declare -a LAUNCH_OBJS
declare -a SKIPPED_BRANDS

for brand in mentolder korczewski; do
  echo "### STEP: HARD-GUARD-GATE $brand"

  # --- KILL-SWITCH CHECK ---
  KS_TRIPPED=false
  KS_GLOBAL=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null)
  gl_ok=$?
  KS_BRAND=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null)
  br_ok=$?

  if [ $gl_ok -ne 0 ] || [ $br_ok -ne 0 ]; then
    echo "guard:killswitch read error → fail-closed ON"
    KS_TRIPPED=true
  else
    if echo "$KS_GLOBAL" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$'; then echo "guard:global-killswitch ON"; KS_TRIPPED=true; fi
    if echo "$KS_BRAND" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$'; then echo "guard:brand-killswitch ON"; KS_TRIPPED=true; fi
  fi

  if $KS_TRIPPED; then
    echo "result:SKIP killswitch"
    SKIPPED_BRANDS+=("{\"brand\":\"$brand\",\"reason\":\"killswitch\"}")
    continue
  fi

  # --- DAILY CAP CHECK ---
  CAP_TRIPPED=false
  COUNT=$(bash "$REPO/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null)
  count_ok=$?

  if [ $count_ok -ne 0 ]; then
    echo "guard:daily-cap read error → fail-closed REACHED"
    CAP_TRIPPED=true
  else
    COUNT=${COUNT:-0}
    if [[ "$COUNT" =~ ^[0-9]+$ ]]; then
      if [ "$COUNT" -ge 5 ]; then
        echo "guard:daily-cap $COUNT >= 5"
        CAP_TRIPPED=true
      fi
    fi
  fi

  if $CAP_TRIPPED; then
    echo "result:SKIP daily_cap"
    SKIPPED_BRANDS+=("{\"brand\":\"$brand\",\"reason\":\"daily_cap\"}")
    continue
  fi

  echo "guard:pass $brand"

  # --- WATCHDOG SWEEP ---
  echo "### STEP: WATCHDOG $brand"
  BRAND="$brand" bash "$REPO/scripts/factory/watchdog.sh" 2>&1
  echo "watchdog:done $brand"

  # --- SCHEDULE ---
  echo "### STEP: SCHEDULE $brand"
  BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh" 2>&1
  echo "schedule:done $brand"
done

echo ""
echo "=== POST-SCHEDULE: CHECK CLAIMS ==="

for brand in mentolder korczewski; do
  echo "--- Slots for $brand ---"
  BRAND="$brand" bash "$REPO/scripts/ticket.sh" factory-slots 2>&1
done

echo ""
echo "=== DISPATCHER PREP SUMMARY ==="
echo "skipped: ${SKIPPED_BRANDS[*]:-none}"
