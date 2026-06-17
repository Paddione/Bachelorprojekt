#!/usr/bin/env bash
# scripts/vda/factory.sh — Factory area dispatcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/vda-core.sh"

show_help() {
  vda_header "VDA factory"
  echo "Usage: vda.sh factory <action> [args]"
  echo ""
  echo "Actions:"
  echo "  slots   Slot accounting (wraps scripts/factory/slots.sh)"
}

main() {
  case "${1:-help}" in
    slots)
      shift
      exec "${SCRIPT_DIR}/factory/slots.sh" "$@"
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      vda_error "Unknown factory action: ${1:-}. Use 'vda.sh factory help'."
      exit 2
      ;;
  esac
}

main "$@"
