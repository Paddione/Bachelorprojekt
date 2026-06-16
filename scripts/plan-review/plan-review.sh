#!/usr/bin/env bash
# scripts/plan-review/plan-review.sh — Plan-Review-CLI
# Subcommands: render | result
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

case "${1:-help}" in
  render)
    PLAN="${2:-}"
    [[ -n "$PLAN" && -f "$PLAN" ]] || { echo "Usage: $0 render <plan.md>" >&2; exit 1; }
    TMP="${TMPDIR:-/tmp}/pr-$$.html"
    node "$HERE/render-plan.mjs" "$PLAN" --out "$TMP"
    bash "$REPO/vda/brainstorm.sh" show "$TMP"
    echo "rendered: $TMP"
    ;;
  result)
    SUB="$("$REPO/vda/brainstorm.sh" submission 2>/dev/null || echo "")"
    if [[ -z "$SUB" || "$SUB" == "null" ]]; then
      echo "no submission yet" >&2; exit 1
    fi
    echo "$SUB" | jq '{kind, verdict, annotations, plan}' 2>/dev/null || echo "$SUB"
    ;;
  *)
    echo "Usage: $0 {render|result} [args]" >&2
    exit 1
    ;;
esac
