#!/usr/bin/env bash
# scripts/factory/auto-close-merged.sh — factory poll: close tickets whose
# associated PR is already merged on GitHub but the local ticket status has
# not yet advanced to done. Closes the auto-close gap observed in T001415
# (T001371, T001412, T414 all merged without their tickets transitioning).
#
# Usage: BRAND=<brand> bash scripts/factory/auto-close-merged.sh [--dry-run]
#
# Env:
#   BRAND              — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — when set, skips cluster access (offline-test)
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run) DRY_RUN=true; shift ;;
  --help)
    echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
    echo "  auto-close-merged: merged PRs with [T-NNNNNN] → ticket.sh update-status done"
    exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "auto-close-merged [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND}"
  exit 0
fi

factory_resolve

# Pull the most recent 30 merged PRs and walk each one. The list is small
# (last 30 merges) and the API cost is negligible (~30 calls / month).
PRS=$(gh pr list --state merged --limit 30 --json number,title 2>/dev/null || echo "[]")
if [[ -z "$PRS" || "$PRS" == "[]" || "$PRS" == "null" ]]; then
  echo "auto-close-merged: keine merged PRs in den letzten 30 für ${BRAND}" >&2
  exit 0
fi

# Extract the first [T-NNNNNN] tag from each title, look up the ticket's
# current status, and transition non-terminal ones. The tag pattern is
# `[T-NNNNNN]` (literal `[T` + 6 digits + `]`, e.g. [T123456] or [T001415]).
echo "$PRS" | jq -r '.[] | "\(.number)\t\(.title)"' | while IFS=$'\t' read -r pr_num title; do
  ticket=$(printf '%s' "$title" | sed -n 's/.*\[(T[0-9]\{6\})\].*/\1/p' | head -1)
  [[ -z "$ticket" ]] && continue

  # Look up the ticket's current status and type. SQL is read-only.
  row=$(cat <<SQL | factory_psql 2>/dev/null
SELECT status, type FROM tickets.tickets WHERE external_id = '$ticket' LIMIT 1;
SQL
)
  [[ -z "$row" ]] && { echo "auto-close-merged: $ticket (PR #$pr_num) existiert nicht in ${BRAND} — skip" >&2; continue; }
  status=$(printf '%s' "$row" | awk -F'|' '{print $1}' | tr -d ' ')
  ttype=$(printf '%s' "$row" | awk -F'|' '{print $2}' | tr -d ' ')

  case "$status" in
    done|archived) echo "auto-close-merged: $ticket (PR #$pr_num) bereits $status — skip" >&2; continue ;;
  esac

  resolution="shipped"
  [[ "$ttype" == "bug" ]] && resolution="fixed"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "auto-close-merged [DRY-RUN]: würde $ticket (PR #$pr_num, ${BRAND}) → done/$resolution"
    continue
  fi

  echo "auto-close-merged: $ticket (PR #$pr_num, ${BRAND}) $status → done/$resolution" >&2
  # Single-line transition so the audit grep `ticket.sh update-status --status done` matches verbatim.
  BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" update-status --id "$ticket" --status done --resolution "$resolution" || \
    echo "auto-close-merged: $ticket update-status fehlgeschlagen — continue" >&2
done

echo "auto-close-merged: fertig (BRAND=${BRAND}, DRY_RUN=${DRY_RUN})"
