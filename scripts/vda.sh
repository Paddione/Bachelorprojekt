#!/usr/bin/env bash
# scripts/vda.sh — Unified View-Decision-Action Interface
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/vda-core.sh"

show_help() {
  vda_header "VDA Unified Interface"
  echo "Usage: vda.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  oracle                     Task oracle integration"
  echo "  promote                    Promote service to environment"
  echo "  frontmatter                Plan frontmatter hook"
  echo "  backup                     Database backup operations"
  echo "  ticket                     Ticket operations (CRUD / pipeline)"
  echo "  factory                    Factory operations (slots, …)"
  echo "  factory-prep               Factory preparation guards"
  echo "  brainstorm                 Brainstorming bridge"
  echo "  release-notes              Release notes generator from merged PRs"
  echo "  help                       Show this help"
  echo "  version                    Show version"
}

show_version() { echo "vda.sh 1.0.0"; }

main() {
  [[ "${1:-}" = "--help" || "${1:-}" = "-h" ]] && { show_help; exit 0; }

  case "${1:-}" in
    oracle)
      shift
      exec "${SCRIPT_DIR}/vda/oracle.sh" "$@"
      ;;
    promote)
      shift
      exec "${SCRIPT_DIR}/vda/promote.sh" "$@"
      ;;
    frontmatter)
      shift
      exec "${SCRIPT_DIR}/vda/frontmatter.sh" "$@"
      ;;
    backup)
      shift
      exec "${SCRIPT_DIR}/vda/backup.sh" "$@"
      ;;
    ticket)
      shift
      exec "${SCRIPT_DIR}/vda/ticket.sh" "$@"
      ;;
    factory-prep)
      shift
      exec "${SCRIPT_DIR}/vda/factory-prep.sh" "$@"
      ;;
    brainstorm)
      shift
      exec "${SCRIPT_DIR}/vda/brainstorm.sh" "$@"
      ;;
    factory)
      shift
      exec "${SCRIPT_DIR}/vda/factory.sh" "$@"
      ;;
    release-notes)
      shift
      exec "${SCRIPT_DIR}/vda/release-notes.sh" "$@"
      ;;
    help|--help|-h)
      show_help
      ;;
    version|--version|-v)
      show_version
      ;;
    *)
      vda_error "Unknown command: ${1:-}. Use 'vda.sh help' for usage."
      exit 2
      ;;
  esac
}

main "$@"
