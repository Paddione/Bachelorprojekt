#!/usr/bin/env bash
# Wrapper for korczewski factory operations.
# Sets BRAND internally to avoid shell env var prefix issues.
set -uo pipefail
BRAND=korczewski
FACTORY_GLOBAL_CAP=3
cd /home/patrick/Bachelorprojekt

run_korczewski() {
  BRAND="$BRAND" bash scripts/factory/"$1"
}

echo "=== korczewski watchdog ==="
run_korczewski watchdog.sh
echo ""

echo "=== korczewski queue ==="
run_korczewski queue.sh
echo ""

echo "=== korczewski schedule ==="
run_korczewski schedule.sh
echo ""

echo "=== korczewski slots count ==="
run_korczewski slots.sh count
echo ""
