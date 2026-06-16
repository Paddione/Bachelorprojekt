#!/usr/bin/env bash
set -euo pipefail
cd /home/patrick/Bachelorprojekt
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3
bash scripts/vda.sh factory-prep > /home/patrick/Bachelorprojekt/scratch/factory-prep-output.json 2>/tmp/factory-prep-err.log
echo "EXIT CODE: $?"
