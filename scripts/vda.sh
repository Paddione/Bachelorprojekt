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
  echo "  frontmatter                Plan/spec frontmatter hook (--spec: openspec/changes/<slug>/design.md)"
  echo "  backup                     Database backup operations"
  echo "  ticket                     Ticket operations (CRUD / pipeline)"
  echo "  factory                    Factory operations (slots, …)"
  echo "  factory-prep               Factory preparation guards"
  echo "  brainstorm                 Brainstorming bridge"
  echo "  release-notes              Release notes generator from merged PRs"
  echo "  cfr                        Change Failure Rate (fix()-Commits/Merges, letzte 8 Wochen, opt. CFR_WINDOW=<date>)"
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
    cfr)
      if ! command -v python3 &>/dev/null; then
        echo "✗ python3 benötigt für cfr-Berechnung" >&2
        exit 2
      fi
      LOG=$(git log --since="${CFR_WINDOW:-8 weeks ago}" --first-parent --oneline main 2>/dev/null || true)
      T=$(echo "$LOG" | wc -l | tr -d ' ')
      F=$(echo "$LOG" | grep -ciE '^[0-9a-f]+ fix\(' || true)
      if [[ "$T" -eq 0 ]]; then
        echo "CFR: n/a (keine Merges im Fenster)"
        exit 0
      fi
      python3 -c "print(f'CFR breit (fix()-Proxy): {$F/$T*100:.1f}% ({$F} fix / {$T} total) — Target: ≤15%')"
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
