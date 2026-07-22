#!/usr/bin/env bash
# scripts/factory/pr-babysit-ticket.sh <ticket_id> <pr_number>
#
# Ticket-scoped CI babysit loop for the ticket's OWN, just-created PR
# (event-driven — complements, does NOT replace, the repo-wide scanner
# scripts/factory/babysit-prs.sh; scripts/devflow-ci-watch.sh stays the dev-flow
# entry point and is not touched). Reuse over duplication:
#   - failure classification: source scripts/factory/classify-failure.sh
#     (classify_failure <ci-log-file> — echoes exactly one class).
#   - polling cadence, `gh pr checks` overview and the job-level step diagnosis
#     are the SSOT of .claude/skills/references/ci-fix-loop.md (read there).
# GitHub CLI runs through the preferred wrapper gh-axi (gh fallback).
#
#   bash scripts/factory/pr-babysit-ticket.sh T002074 123
# Exit 0 = merged / all green; exit 1 = red after MAX_CI_ATTEMPTS.
set -euo pipefail

TICKET_ID="${1:?usage: pr-babysit-ticket.sh <ticket_id> <pr_number>}"
PR="${2:?usage: pr-babysit-ticket.sh <ticket_id> <pr_number>}"
REPO="${REPO:-/home/patrick/Bachelorprojekt}"
MAX_CI_ATTEMPTS="${MAX_CI_ATTEMPTS:-5}"
POLL_INTERVAL="${POLL_INTERVAL:-20}"

# Prefer the gh-axi wrapper; fall back to plain gh.
GH="gh"; command -v gh-axi >/dev/null 2>&1 && GH="gh-axi"

# shellcheck source=/dev/null
source "$REPO/scripts/factory/classify-failure.sh"

# Print the PR checks that are not SUCCESS (name<TAB>state). Empty = all green.
_red_or_pending_checks() {
  "$GH" pr checks "$PR" --json name,state 2>/dev/null \
    | jq -r '.[] | select(.state != "SUCCESS") | "\(.name)\t\(.state)"' 2>/dev/null || true
}
_has_red() {
  "$GH" pr checks "$PR" --json state 2>/dev/null \
    | jq -e 'any(.[]; .state == "FAILURE" or .state == "ERROR" or .state == "CANCELLED")' >/dev/null 2>&1
}
_is_merged() {
  "$GH" pr view "$PR" --json state -q '.state' 2>/dev/null | grep -qi merged
}

# Merge = Abschluss (T001092): on a confirmed merge, close the ticket
# done/resolution=shipped and record the verify pass. Best-effort.
_on_merged() {
  echo "pr-babysit: PR #$PR merged — closing ticket $TICKET_ID"
  bash "$REPO/scripts/ticket.sh" add-pr-link --id "$TICKET_ID" --pr "$PR" || true
  bash "$REPO/scripts/ticket.sh" update-status --id "$TICKET_ID" --status done --resolution shipped || true
  bash "$REPO/scripts/ticket.sh" phase "$TICKET_ID" verify done --driver factory --detail "gate=ci result=pass" || true
}

# Queue auto-merge (squash). Only ever called AFTER a full re-check confirms no
# known-red check remains (green or pending are ok).
_queue_automerge() {
  "$GH" pr merge "$PR" --squash --auto --delete-branch 2>/dev/null || true
}

attempt=0
_queue_automerge   # queue once up front; requeued only after fixes + re-check
while (( attempt < MAX_CI_ATTEMPTS )); do
  if _is_merged; then _on_merged; exit 0; fi
  if ! _has_red; then
    # nothing known-red — wait for pending checks / the merge to land.
    if [[ -z "$(_red_or_pending_checks)" ]]; then
      _is_merged && { _on_merged; exit 0; }
    fi
    sleep "$POLL_INTERVAL"; continue
  fi

  # A check is red — gather details for the fix subagent.
  attempt=$(( attempt + 1 ))
  logf="$(mktemp)"
  "$GH" run view --log-failed >"$logf" 2>&1 || "$GH" run view --log >"$logf" 2>&1 || true
  class="$(classify_failure "$logf")"
  red_list="$(_red_or_pending_checks)"
  changed="$(git -C "$REPO" diff --name-only "origin/main...HEAD" 2>/dev/null | tr '\n' ' ' || true)"

  # Dispatch a fix subagent with the concrete details and WAIT for its return.
  # Factory context: the Deploy-phase agent runs the fix; orchestrator context:
  # the Task tool. Prompt template: ci-fix-loop.md §Fix-Subagent.
  echo "pr-babysit: attempt $attempt/$MAX_CI_ATTEMPTS class=$class red=[${red_list//$'\t'/ }] changed=[$changed]" >&2
  if command -v opencode >/dev/null 2>&1; then
    opencode run --agent build "CI-Fix-Subagent für PR #$PR ($TICKET_ID). Fehlerklasse=$class. Rote Checks:
$red_list
Log-Auszug:
$(tail -n 60 "$logf")
Betroffene Dateien: $changed
Aufgabe: Behebe den Fehler minimal im Worktree, git add <changed-paths> (kein git add -A), commit + push auf den PR-Branch. Danach STOPP." 2>&1 | tail -5 || true
  fi
  rm -f "$logf"

  # Re-check BEFORE requeue: fix any now-red check first (loop), then requeue
  # auto-merge only when no known-red check remains.
  if _has_red; then
    continue
  fi
  _queue_automerge
  sleep "$POLL_INTERVAL"
done

echo "pr-babysit: PR #$PR still red after $MAX_CI_ATTEMPTS attempts" >&2
_red_or_pending_checks >&2 || true
exit 1
