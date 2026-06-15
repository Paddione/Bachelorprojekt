#!/usr/bin/env bash
set -euo pipefail
cd /home/patrick/Bachelorprojekt

echo "PREP STEP START"
echo "---guard_killswitch_on mentolder---"
source scripts/factory/guards.sh
GUARDS_REPO=/home/patrick/Bachelorprojekt
if guard_killswitch_on mentolder; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
echo "---guard_killswitch_on korczewski---"
if guard_killswitch_on korczewski; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
echo "---guard_daily_cap_reached mentolder---"
if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached mentolder; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
echo "---guard_daily_cap_reached korczewski---"
if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached korczewski; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
echo "---watchdog mentolder---"
BRAND=mentolder bash scripts/factory/watchdog.sh
echo "---watchdog korczewski---"
BRAND=korczewski bash scripts/factory/watchdog.sh
echo "---schedule mentolder---"
BRAND=mentolder FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
echo "---schedule korczewski---"
BRAND=korczewski FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
echo "PREP STEP END"
