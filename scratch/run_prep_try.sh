#!/usr/bin/env bash
set -euo pipefail
cd /home/patrick/Bachelorprojekt
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3
bash scripts/vda.sh factory-prep 2>/dev/null
