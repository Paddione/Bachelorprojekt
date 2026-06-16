#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3
exec bash scripts/vda.sh factory-prep
