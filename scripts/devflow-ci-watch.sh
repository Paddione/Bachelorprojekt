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

# Preflight: if GitHub reports the PR as DIRTY (needs rebase), CI never starts —
# self-service a rebase against origin/main instead of hanging in the poll loop.
MERGE_STATE=$(gh pr view "$PR_URL" --json mergeStateStatus -q '.mergeStateStatus' 2>/dev/null || echo "")
if [[ "$MERGE_STATE" == "DIRTY" ]]; then
  echo "⚠ PR mergeStateStatus=DIRTY — Rebase gegen origin/main vor dem CI-Poll ..."
  git fetch origin main 2>/dev/null || true
  if git rebase origin/main; then
    if ! git push --force-with-lease; then
      echo "❌ push nach Rebase fehlgeschlagen (force-with-lease abgelehnt oder Netzwerkfehler) — manuelles Eingreifen nötig." >&2
      exit 3
    fi
  else
    git rebase --abort 2>/dev/null || true
    echo "❌ Rebase-Konflikt gegen origin/main — manuelle Konfliktlösung nötig (kein Auto-Force)." >&2
    exit 3
  fi
fi

CI_ATTEMPT=0
while true; do
  CI_ATTEMPT=$((CI_ATTEMPT + 1))
  echo "⏳ CI-Check Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS für $PR_URL ..."
  ./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow \
    --detail "CI attempt $CI_ATTEMPT/$MAX_CI_ATTEMPTS" 2>/dev/null || true

  gh pr checks --watch --interval 15 2>/dev/null || true

  if ! FAILED_CHECKS=$(gh pr view "$PR_URL" --json statusCheckRollup \
    -q '.statusCheckRollup[] | select(
          (.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT"
          or (.state // "") == "FAILURE"
        ) | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")'); then
    echo "⚠ gh pr view --json statusCheckRollup fehlgeschlagen (Auth/Schema/Rate-Limit?) — kann Checks nicht sicher bewerten." >&2
    if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
      echo "❌ Nach $MAX_CI_ATTEMPTS Versuchen weiterhin keine verlässliche Check-Auskunft von gh — manuelles Eingreifen nötig." >&2
      exit 1
    fi
    sleep 15
    continue
  fi

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

    # Job-level step diagnostics via GitHub API (structured, faster than log scan)
    echo "--- Job-Step-Diagnose (Run $FAILED_RUN_ID) ---"
    FAILED_JOBS=$(gh api "repos/Paddione/Bachelorprojekt/actions/runs/${FAILED_RUN_ID}/jobs" \
      --jq '.jobs[] | select(.conclusion == "failure") | {id: .id, name: .name, steps: [.steps[] | select(.conclusion == "failure") | {step: .name, number: .number, conclusion: .conclusion}]}' \
      2>/dev/null || echo "")
    if [[ -n "$FAILED_JOBS" ]]; then
      echo "$FAILED_JOBS"
      # Fetch detailed annotations for each failed job
      echo "$FAILED_JOBS" | jq -r '.id' 2>/dev/null | while read -r JOB_ID; do
        [[ -z "$JOB_ID" ]] && continue
        echo "--- Annotations für Job $JOB_ID ---"
        gh api "repos/Paddione/Bachelorprojekt/actions/jobs/${JOB_ID}" \
          --jq '{job: .name, started_at: .started_at, completed_at: .completed_at, steps: [.steps[] | select(.conclusion != "skipped" and .conclusion != null) | {n: .number, name: .name, conclusion: .conclusion, duration_s: ((.completed_at // .started_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) - (.started_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))}]}' \
          2>/dev/null || true
      done
    fi
  fi

  echo "🔧 CI-Fix-Subagenten spawnen (siehe dev-flow-execute Schritt 5.5 für Prompt-Bauanleitung) ..."
  echo "   Kontext für den Fix-Subagenten: fehlgeschlagene Steps aus der Job-Diagnose oben"
  echo "   + gh run view $FAILED_RUN_ID --log-failed für den vollständigen Stacktrace."
  echo "   → Nach erfolgreichem Fix: commit + push, Loop wiederholen."
done
