#!/usr/bin/env bash
set -euo pipefail
cd /home/patrick/Bachelorprojekt
BRAND=mentolder
export BRAND
bash scripts/factory/budget-guard.sh "$BRAND"
