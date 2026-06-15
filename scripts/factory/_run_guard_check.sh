#!/usr/bin/env bash
# Dispatcher PREP step — guard checks and scheduling
# This script runs all the guard checks and scheduling steps,
# outputting JSON for the orchestrator to consume.
set -uo pipefail

REPO=/home/patrick/Bachelorprojekt

echo "=== GUARD CHECKS ==="

for brand in mentolder korczewski; do
  echo "--- Brand: $brand ---"

  # Kill-switch check
  KS=1
  KS_GLOBAL=$(bash "${REPO}/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null) || KS=0
  KS_BRAND=$(bash "${REPO}/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null) || KS=0

  TRI="off"
  if [ "$KS" = "0" ]; then
    echo "ks: FAIL_READ → fail-closed ON"
    TRI="on"
  else
    echo "$KS_GLOBAL" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' && { echo "ks: global ON"; TRI="on"; }
    echo "$KS_BRAND" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' && { echo "ks: brand ON"; TRI="on"; }
  fi

  if [ "$TRI" = "on" ]; then
    echo "guard_result: killswitch"
    continue
  fi
  echo "ks: OFF"

  # Daily cap check
  CAP=1
  COUNT=$(bash "${REPO}/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null) || CAP=0

  if [ "$CAP" = "0" ]; then
    echo "guard_result: daily_cap (read failed)"
    continue
  fi

  COUNT=${COUNT:-0}
  if [[ "$COUNT" =~ ^[0-9]+$ ]]; then
    if [ "$COUNT" -ge 5 ]; then
      echo "guard_result: daily_cap (count=$COUNT >= 5)"
      continue
    fi
  fi
  echo "daily_deploy_count: $COUNT (under cap 5)"
  echo "guard_result: pass"
done

echo ""
echo "=== WATCHDOG SWEEP ==="

for brand in mentolder korczewski; do
  echo "--- Watchdog: $brand ---"
  BRAND="$brand" bash "${REPO}/scripts/factory/watchdog.sh" 2>&1 || echo "watchdog exit=$?"
  echo "watchdog:done"
done

echo ""
echo "=== SCHEDULING ==="

for brand in mentolder korczewski; do
  echo "--- Schedule: $brand ---"
  BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "${REPO}/scripts/factory/schedule.sh" 2>&1 || echo "schedule exit=$?"
  echo "schedule:done"
done

echo ""
echo "=== CHECK CLAIMS ==="

# List claimed tickets
for brand in mentolder korczewski; do
  echo "--- Claims for $brand ---"
  BRAND="$brand" bash "${REPO}/scripts/ticket.sh" factory-slots 2>&1 || echo "slots exit=$?"
done

echo ""
echo "=== DONE ==="
