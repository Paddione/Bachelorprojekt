#!/usr/bin/env bash
set -euo pipefail

# Put the project dir first on PATH so kubectl resolves to our stub
PROJECT=/home/patrick/Bachelorprojekt
export PATH="$PROJECT/scripts:/usr/local/bin:/usr/bin:/bin"
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3

cd "$PROJECT"
exec bash scripts/vda.sh factory-prep 2>&1
