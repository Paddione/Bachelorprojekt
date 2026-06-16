#!/usr/bin/env bash
# This script runs the factory-prep and outputs only the final JSON
FACTORY_DAILY_DEPLOY_CAP=5 FACTORY_GLOBAL_CAP=3 bash /home/patrick/Bachelorprojekt/scripts/vda.sh factory-prep 2>/dev/null
