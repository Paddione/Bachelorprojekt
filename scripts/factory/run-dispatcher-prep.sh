#!/usr/bin/env bash
# Dispatcher PREP step - runs all guards, watchdog, and scheduling
set -euo pipefail

BRAND="${1:?brand required}"
GUARDS_REPO=/home/patrick/Bachelorprojekt

# Step 0: Guards
source scripts/factory/guards.sh

# Kill-switch check
if guard_killswitch_on "$BRAND"; then
  echo "GUARD:killswitch:ON"
  exit 0
fi
echo "GUARD:killswitch:OFF"

# Daily cap check
FACTORY_DAILY_DEPLOY_CAP=5
if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached "$BRAND"; then
  echo "GUARD:daily_cap:REACHED"
  exit 0
fi
echo "GUARD:daily_cap:OK"

# Step 1: Watchdog
BRAND="$BRAND" bash scripts/factory/watchdog.sh
echo "WATCHDOG:DONE"

# Step 2: Schedule
BRAND="$BRAND" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
echo "SCHEDULE:DONE"
