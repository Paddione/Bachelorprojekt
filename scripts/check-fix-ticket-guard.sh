#!/usr/bin/env bash
# check-fix-ticket-guard.sh — block fix()-commits without a ticket ID.
#
# The Bug-Triage-Konvention (G-DORA03) requires every fix()-commit to carry
# a ticket ID: an unticketed fix counts as a disguised bug and skews the
# Change Failure Rate measurement (scripts/vda.sh cfr) without ever showing
# up in the DORA evaluation. Before T005307 there was no technical block —
# 82 of 740 fix()-merges in 8 weeks were unticketed.
#
# This script enforces the rule at commit-msg time:
#   - Subject WITHOUT a 'fix('-prefix (feat/chore/docs/...) -> allow (only
#     fixes are affected, matching the CFR proxy 'fix(' convention).
#   - Subject WITH 'fix('-prefix AND a ticket ID (T[0-9]{6}) -> allow.
#   - Subject WITH 'fix('-prefix WITHOUT a ticket ID -> block with a hint
#     pointing to `bash scripts/ticket.sh create --type fix ...`.
#   - SKIP_FIX_TICKET_GUARD=1 -> allow (emergency bypass only).
#
# Wired into:
#   - .githooks/commit-msg  (local, blocking)
#
# Only local commits are affected: CI bots (Renovate and co.) commit without
# local hooks. The design doc notes 78 of 82 unticketed fixes came from the
# user's own commits — this guard disciplines exactly that source.
#
# Usage:
#   check-fix-ticket-guard.sh <commit-msg-file>
#
# Exit codes: 0 = allowed, 1 = fix()-commit without ticket ID (blocked),
# 2 = usage error.
set -uo pipefail

MSG_FILE="${1:-}"

if [[ "${SKIP_FIX_TICKET_GUARD:-0}" == "1" ]]; then
  echo "⚠  check-fix-ticket-guard: SKIP_FIX_TICKET_GUARD=1 — bypassing fix-ticket check" >&2
  exit 0
fi

if [[ -z "$MSG_FILE" ]]; then
  echo "check-fix-ticket-guard: usage: check-fix-ticket-guard.sh <commit-msg-file>" >&2
  exit 2
fi
[[ -f "$MSG_FILE" ]] || { echo "check-fix-ticket-guard: message file '$MSG_FILE' not found" >&2; exit 2; }

# --- Parse subject (first non-comment, non-blank line) ---
SUBJECT="$(grep -m1 -E '^[^#[:space:]]' "$MSG_FILE" | sed 's/^[[:space:]]*//')"
[[ -n "$SUBJECT" ]] || exit 0  # empty subject — let other hooks handle it

# --- Only fix()-commits are affected (CFR-proxy convention: 'fix(' form) ---
if ! echo "$SUBJECT" | grep -qE '^fix\([^)]*\):'; then
  exit 0
fi

# --- Ticket ID present (T[0-9]{6}, bracket form optional: [T005307] or T005307) ---
if echo "$SUBJECT" | grep -qE 'T[0-9]{6}'; then
  exit 0
fi

cat >&2 <<EOF
✗  check-fix-ticket-guard: fix()-Commit ohne Ticket-ID (G-DORA03)

Subject:    $SUBJECT

Jeder fix()-Commit braucht eine Ticket-ID im Subject (z. B. [T005307]) —
ungetickte fixes zaehlen als verschleierte Bugs und verfaelschen die
Change Failure Rate. Vor dem Commit das Ticket anlegen:

  bash scripts/ticket.sh create --type fix --title "..." --description "..."

Dann die Commit-Message per 'git commit --amend' um die Ticket-ID ergaenzen.

Zum Bypassen (nur im Notfall): SKIP_FIX_TICKET_GUARD=1 git commit ...
EOF
exit 1
