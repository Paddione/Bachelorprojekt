#!/usr/bin/env bash
# devflow-ci-watch.sh — Watch PR-CI bis grün (max $MAX_CI_ATTEMPTS Versuche)
# Aus dev-flow-execute Schritt 5.5 extrahiert (Chore T001007).
set -u

TICKET_ID="${1:-}"
PR_URL="${2:-}"
MAX_CI_ATTEMPTS="${MAX_CI_ATTEMPTS:-5}"

if [[ -z "$TICKET_ID" || -z "$PR_URL" ]]; then
  echo "usage: devflow-ci-watch.sh <TICKET_ID> <PR_URL>" >&2
  exit 2
fi

PR_NUM_TELEM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow \
  --detail "PR #$PR_NUM_TELEM · CI watch" 2>/dev/null || true

CI_ATTEMPT=0
while true; do
  CI_ATTEMPT=$((CI_ATTEMPT + 1))
  echo "⏳ CI-Check Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS für $PR_URL ..."
  ./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow \
    --detail "CI attempt $CI_ATTEMPT/$MAX_CI_ATTEMPTS" 2>/dev/null || true

  gh pr checks --watch --interval 15 2>/dev/null || true

  FAILED_CHECKS=$(gh pr checks --json name,state,link \
    | jq -r '.[] | select(.state == "FAILURE" or .state == "TIMED_OUT") | "\(.name): \(.link)"')

  if [[ -z "$FAILED_CHECKS" ]]; then
    echo "✅ Alle CI-Checks grün."
    exit 0
  fi

  if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
    echo "❌ CI nach $MAX_CI_ATTEMPTS Versuchen noch rot — manuelles Eingreifen nötig:"
    echo "$FAILED_CHECKS"
    exit 1
  fi

  echo "⚠ Fehlgeschlagene Checks:"
  echo "$FAILED_CHECKS"

  FAILED_RUN_ID=$(gh run list --json databaseId,status,conclusion \
    | jq -r '[.[] | select(.conclusion == "failure")] | sort_by(.databaseId) | last | .databaseId // empty')

  if [[ -n "$FAILED_RUN_ID" ]]; then
    echo "--- CI-Logs (Run $FAILED_RUN_ID) ---"
    gh run view "$FAILED_RUN_ID" --log-failed 2>&1 | tail -200
  fi

  echo "🔧 CI-Fix-Subagenten spawnen (siehe dev-flow-execute Schritt 5.5 für Prompt-Bauanleitung) ..."
  echo "   → Nach erfolgreichem Fix: commit + push, Loop wiederholen."
done
