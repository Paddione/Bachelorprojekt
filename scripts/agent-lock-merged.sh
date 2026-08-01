#!/usr/bin/env bash
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
  # M2 (T002506): NUR den Commit-BETREFF pruefen, nicht den Body. git log --grep
  # durchsucht die ganze Message (Body inklusive) und interpretiert das Muster als
  # Regex — "[T002494]" waere eine Zeichenklasse, die jedes Zeichen T/0/2/4/9 matcht
  # (false positives auf x-beliebige Commits). Darum: formatierte Subject-Zeilen
  # ("%h %s") mit fixed-string grep auf das PR-Betreff-Muster "[T00xxxx]" filtern.
  # Eine ID, die nur im Commit-Body vorkommt (z. B. [[T002494]]-Wiki-Link in einer
  # goals.md-Aenderung eines fremden Tickets), gilt NICHT als Merge-Beleg.
  matches="$(git log origin/main --format='%h %s' 2>/dev/null | grep -F "[${ticket_id}]" | head -5)"
  if [ -n "$matches" ]; then
    echo "check-merged: Ticket $ticket_id found in merged commit subject(s) on main:"
    echo "$matches"
    return 1
  fi

  echo "check-merged: Ticket $ticket_id NOT found on main — safe to proceed."
  return 0
}
