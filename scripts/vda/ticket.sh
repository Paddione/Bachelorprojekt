#!/usr/bin/env bash
# scripts/vda/ticket.sh — Ticket subcommand dispatcher
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/ticket" && pwd)"
source "$(dirname "${BASH_SOURCE[0]}")/../lib/vda-core.sh"

show_help() {
  vda_header "vda.sh ticket — Ticket Operations"
  echo "Usage: vda.sh ticket <subcommand> [args]"
  echo ""
  echo "Extracted subcommands:"
  echo "  create, get, update-status, enqueue, stage-plan, triage"
  echo ""
  echo "Pass-through subcommands (delegated to ticket.sh):"
  echo "  add-comment, add-pr-link, grill, archive-plan, get-attachments,"
  echo "  set-touched-files, set-pipeline-slot, release-slot, touch, retry-count,"
  echo "  factory-control, dryrun-mark, dryrun-check, feature-flag, phase,"
  echo "  inject, get-injections, plan-meta, lastenheft"
  echo ""
  echo "Use 'vda.sh ticket help' for this message, or run 'ticket.sh help' for detailed usage."
}

main() {
  local cmd="${1:-help}"
  shift 2>/dev/null || :

  case "$cmd" in
    create|get|update-status|enqueue|stage-plan|triage)
      source "${SCRIPT_DIR}/${cmd}.sh"
      main "$@"
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      local ticket_abs
      ticket_abs="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ticket.sh"
      exec bash -- "$ticket_abs" "$cmd" "$@"
      ;;
  esac
}

main "$@"
