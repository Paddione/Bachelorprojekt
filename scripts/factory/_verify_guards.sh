#!/usr/bin/env bash
# Verify guard conditions with proper env vars
set -uo pipefail
REPO=/home/patrick/Bachelorprojekt
cd "$REPO"

echo "=== HARD GUARD VERIFICATION ==="
FACTORY_DAILY_DEPLOY_CAP=5
GUARDS_REPO="$REPO"

for brand in mentolder korczewski; do
  echo "--- Brand: $brand ---"

  # Kill-switch check (replicate guard_killswitch_on logic)
  KS=0
  KS_GLOBAL=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch 2>&1) || KS=1
  KS_BRAND=$(bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>&1) || KS=1

  if [ "$KS" = "1" ]; then
    echo "killswitch: READ FAILED → fail-closed ON"
    echo "verdict: SKIP (killswitch)"
    continue
  fi

  TRI="off"
  echo "global_killswitch: [$KS_GLOBAL]"
  echo "brand_killswitch: [$KS_BRAND]"
  echo "$KS_GLOBAL" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' && TRI="on" && echo "  → global kill-switch ON"
  echo "$KS_BRAND" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' && TRI="on" && echo "  → brand kill-switch ON"

  if [ "$TRI" = "on" ]; then
    echo "verdict: SKIP (killswitch tripped)"
    continue
  fi
  echo "killswitch: OFF (pass)"

  # Daily cap check (replicate guard_daily_cap_reached logic)
  CAP_CHECK="not_reached"
  if [ -z "$FACTORY_DAILY_DEPLOY_CAP" ]; then
    echo "daily_cap: FACTORY_DAILY_DEPLOY_CAP unset → fail-closed REACHED"
    echo "verdict: SKIP (daily_cap)"
    continue
  fi

  COUNT=$(bash "$REPO/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>&1) || CAP_CHECK="read_failed"

  if [ "$CAP_CHECK" = "read_failed" ]; then
    echo "daily_cap: READ FAILED → fail-closed REACHED"
    echo "verdict: SKIP (daily_cap)"
    continue
  fi

  echo "daily_deploy_count: [$COUNT]"
  COUNT=${COUNT:-0}
  [[ "$COUNT" =~ ^[0-9]+$ ]] || COUNT=0
  echo "daily_deploy_count (normalized): $COUNT"

  if [ "$COUNT" -ge "$FACTORY_DAILY_DEPLOY_CAP" ]; then
    echo "daily_cap: $COUNT >= $FACTORY_DAILY_DEPLOY_CAP"
    echo "verdict: SKIP (daily_cap)"
    continue
  fi

  echo "daily_cap: $COUNT < $FACTORY_DAILY_DEPLOY_CAP (pass)"
  echo "verdict: PASS"
done

echo ""
echo "=== GUARD CHECKS COMPLETE ==="
