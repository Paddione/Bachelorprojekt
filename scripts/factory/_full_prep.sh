#!/usr/bin/env bash
# Full dispatcher PREP - runs all scripts for both brands
set -uo pipefail
REPO=/home/patrick/Bachelorprojekt
cd "$REPO"

GLOBAL_CAP=3

echo "=== MENTOLDER FULL PREP ==="
# Watchdog
echo "--- Watchdog mentolder ---"
BRAND=mentolder bash scripts/factory/watchdog.sh
# Queue
echo "--- Queue mentolder ---"
BRAND=mentolder bash scripts/factory/queue.sh
# Schedule
echo "--- Schedule mentolder ---"
BRAND=mentolder FACTORY_GLOBAL_CAP="$GLOBAL_CAP" bash scripts/factory/schedule.sh
# Slots
echo "--- Slots count mentolder ---"
BRAND=mentolder bash scripts/factory/slots.sh count
echo ""

echo "=== KORCZEWSKI FULL PREP ==="
# Watchdog
echo "--- Watchdog korczewski ---"
BRAND=korczewski bash scripts/factory/watchdog.sh
# Queue
echo "--- Queue korczewski ---"
BRAND=korczewski bash scripts/factory/queue.sh
# Schedule
echo "--- Schedule korczewski ---"
BRAND=korczewski FACTORY_GLOBAL_CAP="$GLOBAL_CAP" bash scripts/factory/schedule.sh
# Slots
echo "--- Slots count korczewski ---"
BRAND=korczewski bash scripts/factory/slots.sh count

echo ""
echo "=== DONE ==="
