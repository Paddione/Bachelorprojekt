#!/usr/bin/env bash
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3
cd /home/patrick/Bachelorprojekt
bash scripts/vda.sh factory-prep 2>&1
echo "EXIT_CODE=$?"
