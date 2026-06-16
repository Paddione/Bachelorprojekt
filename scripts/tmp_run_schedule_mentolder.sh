#!/usr/bin/env bash
export BRAND=mentolder
export FACTORY_GLOBAL_CAP=3
exec bash scripts/factory/schedule.sh 2>&1
