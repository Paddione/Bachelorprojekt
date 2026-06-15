#!/usr/bin/env bash
# Wrapper to run factory scripts for korczewski brand without env var prefix
set -uo pipefail
BRAND=korczewski
export BRAND
FACTORY_GLOBAL_CAP=3
export FACTORY_GLOBAL_CAP
cd /home/patrick/Bachelorprojekt

case "${1:-}" in
  watchdog)
    bash scripts/factory/watchdog.sh
    ;;
  schedule)
    bash scripts/factory/schedule.sh
    ;;
  queue)
    bash scripts/factory/queue.sh
    ;;
  slots)
    bash scripts/factory/slots.sh "${2:-count}"
    ;;
  *)
    echo "Usage: $0 {watchdog|schedule|queue|slots}" >&2
    exit 1
    ;;
esac
