#!/usr/bin/env bash
# scripts/vda/ticket.sh — Ticket subcommand dispatcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/ticket" && pwd)"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/vda-core.sh"

show_help() {
  vda_header "vda.sh ticket — Ticket Operations"
  echo "Usage: vda.sh ticket <subcommand> [args]"
  echo ""
  echo "Subcommands: create, get, update-status, enqueue, stage-plan, help"
}

main() {
  case "${1:-help}" in
    create|get|update-status|enqueue|stage-plan)
      local sub="$1"; shift
      source "${SCRIPT_DIR}/${sub}.sh"
      main "$@"
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      vda_error "Unknown ticket subcommand: ${1:-}. Use 'vda.sh ticket help'."
      exit 2
      ;;
  esac
}

main "$@"
