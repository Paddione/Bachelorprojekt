#!/usr/bin/env bash
# scripts/vda/promote.sh — Promote service to environment (delegates to feature-promote.sh)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE=""
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --help|-h)
      source "${SCRIPT_DIR}/lib/vda-core.sh"
      vda_header "vda.sh promote — Promote service to environment"
      echo "Usage: vda.sh promote [service] [--target mentolder|korczewski|both]"
      echo ""
      echo "Delegates to feature-promote.sh"
      exit 0
      ;;
    --*)
      source "${SCRIPT_DIR}/lib/vda-core.sh"
      vda_error "Unknown option: $1"
      exit 2
      ;;
    *)
      if [[ -z "$SERVICE" ]]; then
        SERVICE="$1"
      else
        source "${SCRIPT_DIR}/lib/vda-core.sh"
        vda_error "Unexpected argument: $1"
        exit 2
      fi
      shift
      ;;
  esac
done

export SERVICE="${SERVICE:-}"
export TARGET="${TARGET:-}"
unset SCRIPT_DIR
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/feature-promote.sh"
