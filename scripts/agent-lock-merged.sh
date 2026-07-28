# scripts/agent-lock-merged.sh — check-merged command for agent-lock.sh. [T002279]
#
# Sourced by scripts/agent-lock.sh; provides cmd_check_merged.
# Extracted to keep agent-lock.sh under the 500-line S1 limit (T002279).
set -uo pipefail

# check-merged <ticket_id> — Check if a ticket ID appears in a merged commit on main.
# This is the programmatic equivalent of the SKILL.md preflight check, usable from
# scripts, preflight guards, and CI. [T002279]
#
# Exit codes:
#   0 = ticket_id NOT found in main — proceed (no pre-existing fix)
#   1 = ticket_id FOUND in main — a merged commit references it (likely already fixed)
#   2 = no origin/main ref (detached, no remote)
#
# Usage:
#   bash scripts/agent-lock.sh check-merged T002264
#   if [ $? -eq 1 ]; then echo "Already fixed on main!"; fi
cmd_check_merged() {
  local ticket_id="${1:-}"
  if [ -z "$ticket_id" ]; then
    echo "Usage: agent-lock.sh check-merged <ticket_id>" >&2
    return 2
  fi
  # Validate T-number format
  case "$ticket_id" in T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;; *)
    echo "check-merged: invalid ticket ID format '$ticket_id' (expected T######)" >&2
    return 2
  esac

  if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "check-merged: origin/main not found (no remote?)" >&2
    return 2
  fi

  local matches
  matches="$(git log origin/main --oneline --grep="$ticket_id" 2>/dev/null | head -5)"
  if [ -n "$matches" ]; then
    echo "check-merged: Ticket $ticket_id found in merged commit(s) on main:"
    echo "$matches"
    return 1
  fi

  # Also scan commit bodies and full diff for mentions (not just subject line)
  local body_matches
  body_matches="$(git log origin/main --all-match --grep="$ticket_id" --format="%H %s" 2>/dev/null | head -5)"
  if [ -n "$body_matches" ]; then
    echo "check-merged: Ticket $ticket_id found in commit body on main:"
    echo "$body_matches"
    return 1
  fi

  echo "check-merged: Ticket $ticket_id NOT found on main — safe to proceed."
  return 0
}
