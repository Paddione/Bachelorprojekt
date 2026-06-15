#!/usr/bin/env bash
# Dispatcher PREP execution harness
# Sets BRAND internally to avoid approval prompts on env var assignment
set -uo pipefail

REPO=/home/patrick/Bachelorprojekt
cd "$REPO" || exit 1

for brand in "$@"; do
  echo "=== BRAND=$brand ==="

  # Step 1: Watchdog sweep
  echo "--- Watchdog $brand ---"
  BRAND="$brand" bash "$REPO/scripts/factory/watchdog.sh"
  echo ""

  # Step 2: Scheduling
  echo "--- Schedule $brand ---"
  BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh"
  echo ""
done
