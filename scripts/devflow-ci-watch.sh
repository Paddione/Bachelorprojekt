#!/usr/bin/env bash
# scripts/devflow-ci-watch.sh — CI/CD-Überwachung für dev-flow-execute (Schritt 5.5)
# SSOT: .claude/skills/references/ci-fix-loop.md
set -euo pipefail

TICKET_ID="${1:-}"
PR_URL="${2:-}"
MAX_CI_ATTEMPTS="${MAX_CI_ATTEMPTS:-3}"

if [[ -z "$TICKET_ID" || -z "$PR_URL" ]]; then
  echo "Usage: $0 <TICKET_ID> <PR_URL>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
if [[ -z "${TICKET_SH:-}" ]]; then
  if [[ -x "scripts/ticket.sh" ]]; then
    TICKET_SH="scripts/ticket.sh"
  else
    TICKET_SH="$SCRIPT_DIR/ticket.sh"
  fi
fi

PR_NUM_TELEM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
"$TICKET_SH" phase "$TICKET_ID" deploy entered --driver devflow \
  --detail "PR #$PR_NUM_TELEM · CI watch" 2>/dev/null || true

# Preflight: if GitHub reports the PR as DIRTY (needs rebase), CI never starts —
# fail immediately so the caller can rebase, rather than polling 3× against dead runs.
MERGE_STATUS=$(gh pr view "$PR_URL" --json mergeStateStatus -q '.mergeStateStatus' 2>/dev/null || echo "")
if [[ "$MERGE_STATUS" == "DIRTY" ]]; then
  echo "⚠ PR-Merge-Status ist DIRTY (Rebase nötig) — CI startet nicht automatisch."
  echo "  Führe Rebase gegen origin/main durch:"
  echo "  git fetch origin main && git rebase origin/main && git push --force-with-lease"
  # T001408: Rebase direkt versuchen statt sofort abzubrechen
  echo "Versuche automatischen Rebase..."
  if git fetch origin main 2>/dev/null && git rebase origin/main 2>/dev/null; then
    echo "✅ Automatischer Rebase erfolgreich — pushe..."
    if git push --force-with-lease 2>/dev/null; then
      echo "✅ Rebased und gepusht — setze CI-Watch fort..."
    else
      echo "❌ Push nach Rebase fehlgeschlagen." >&2
      exit 3
    fi
  else
    git rebase --abort 2>/dev/null || true
    echo "❌ Automatischer Rebase hatte Konflikte — manuell rebasen." >&2
    exit 3
  fi
fi

# T001415: GitHub mergeable check — CONFLICTING bedeutet Merge-Konflikte
# (z.B. nach parallelen Merges). Exit-Code 4 = echter Merge-Konflikt (nicht nur CI rot).
MERGEABLE=$(gh pr view "$PR_URL" --json mergeable -q '.mergeable' 2>/dev/null || echo "")
if [[ "$MERGEABLE" == "CONFLICTING" ]]; then
  echo "❌ PR hat Merge-Konflikte (mergeable=CONFLICTING) — Rebase/Merge nötig vor CI-Fix." >&2
  echo "  Mögliche Ursache: Parallele PRs haben dieselben Dateien modifiziert." >&2
  echo "  Fix: git fetch origin main && git rebase origin/main -> Konflikte lösen -> push" >&2
  exit 4
fi

# T001415: Wenn der PR bereits gemergt ist (state=MERGED), sind alle Checks
# bereits durchgelaufen. Kein weiterer Poll nötig — direkt Phase-Chain prüfen und Exit 0.
PR_STATE=$(gh pr view "$PR_URL" --json state -q '.state' 2>/dev/null || echo "")
if [[ "$PR_STATE" == "MERGED" ]]; then
  echo "✅ PR bereits gemergt (state=MERGED) — Checks waren per Branch-Protection bereits grün. Überspringe Poll-Loop."
  if [[ ! -x "$TICKET_SH" ]]; then
    echo "⚠ ticket.sh nicht erreichbar ($TICKET_SH) — Phase-Chain kann nicht verifiziert werden (Worktree entfernt?)." >&2
    exit 7
  fi
  if ! "$TICKET_SH" assert-phase-chain --id "$TICKET_ID"; then
    echo "❌ Phase-Chain nicht vollständig — siehe Meldungen oben." >&2
    exit 6
  fi
  exit 0
fi

CI_ATTEMPT=0
while true; do
  CI_ATTEMPT=$((CI_ATTEMPT + 1))
  echo "⏳ CI-Check Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS für $PR_URL ..."
  "$TICKET_SH" phase "$TICKET_ID" deploy entered --driver devflow \
    --detail "CI attempt $CI_ATTEMPT/$MAX_CI_ATTEMPTS" 2>/dev/null || true

  gh pr checks "$PR_URL" --watch --interval 15 2>/dev/null || true

  # T003225: headRefOid aus dem PR lesen und den Rollup darauf filtern.
  # Verhindert, dass veraltete Checks eines früheren Commits als "aktueller Fehler"
  # gewertet werden (StatusCheckRollup kumuliert historisch über den PR).
  PR_HEAD_OID=$(gh pr view "$PR_URL" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")
  if [[ -n "$PR_HEAD_OID" ]]; then
    FAILED_CHECKS=$(gh pr view "$PR_URL" --json headRefOid,statusCheckRollup \
      --jq '. as $p | $p.statusCheckRollup[] | select(.headSha == $p.headRefOid) | select((.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT") | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")' 2>/dev/null || true)
  else
    FAILED_CHECKS=$(gh pr view "$PR_URL" --json statusCheckRollup \
      --jq '.statusCheckRollup[] | select((.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT") | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")' 2>/dev/null || true)
  fi

  # T003224: False-Positive-Schutz bei aggregierten Workflow-Runs:
  # Ein gh-run kann conclusion="failure" melden, obwohl alle einzelnen Jobs
  # grün sind (z.B. weil ein Matrix-Job "cancelled" wurde, was GitHub als failure
  # aggregiert). Wir prüfen, ob tatsächlich Jobs mit conclusion=failure existieren.
  if [[ -n "$FAILED_CHECKS" ]]; then
    REAL_FAILURES=""
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      CHECK_NAME=$(echo "$line" | cut -d: -f1)
      # Prüfe, ob es ein aggregierter Run ist (hat eine run ID in der URL)
      RUN_ID=$(echo "$line" | grep -oE 'actions/runs/[0-9]+' | cut -d/ -f3 || true)
      if [[ -n "$RUN_ID" ]]; then
        # Zähle tatsächlich fehlgeschlagene Jobs in diesem Run
        FAILED_JOB_COUNT=$(gh api "repos/:owner/:repo/actions/runs/$RUN_ID/jobs" \
          --jq '[.jobs[] | select(.conclusion == "failure")] | length' 2>/dev/null || echo "1")
        if [[ "$FAILED_JOB_COUNT" -gt 0 ]]; then
          REAL_FAILURES="${REAL_FAILURES:+$REAL_FAILURES"$'\n'"}$line"
        else
          echo "ℹ Check '$CHECK_NAME' meldet failure, aber 0 Jobs sind fehlgeschlagen (cancelled/skipped) — ignoriere."
        fi
      else
        REAL_FAILURES="${REAL_FAILURES:+$REAL_FAILURES"$'\n'"}$line"
      fi
    done <<< "$FAILED_CHECKS"
    FAILED_CHECKS="$REAL_FAILURES"
  fi

  TOTAL_CHECKS=$(gh api "repos/:owner/:repo/commits/$(git rev-parse HEAD)/check-runs" --jq '.total_count' 2>/dev/null || echo "N/A")

  # T001557: Wenn noch Checks laufen (in_progress/pending/queued), ist der Run NICHT abgeschlossen.
  # Kein Abbruch — weiter pollen, bis alle Checks einen terminalen Status haben.
  PENDING_CHECKS=$(gh pr view "$PR_URL" --json statusCheckRollup \
    --jq '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' 2>/dev/null || echo "0")
  if [[ "$PENDING_CHECKS" -gt 0 ]]; then
    echo "⏳ Noch $PENDING_CHECKS Check(s) aktiv (pending/in_progress) — warte auf Abschluss (Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS)..."
    if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
      echo "⚠ Max attempts ($MAX_CI_ATTEMPTS) erreicht, aber Checks laufen noch ($PENDING_CHECKS pending)."
      echo "  CI läuft noch — keine Fehlentscheidung treffen."
      exit 0
    fi
    sleep 30
    continue
  fi

  if [[ -z "$FAILED_CHECKS" ]]; then
    echo "✅ $TOTAL_CHECKS CI-Checks, alle grün."
    if [[ ! -x "$TICKET_SH" ]]; then
      echo "⚠ ticket.sh nicht erreichbar ($TICKET_SH) — Phase-Chain kann nicht verifiziert werden (Worktree entfernt?)." >&2
      exit 7
    fi
    if ! "$TICKET_SH" assert-phase-chain --id "$TICKET_ID"; then
      echo "❌ Phase-Chain nicht vollständig — siehe Meldungen oben." >&2
      exit 6
    fi
    exit 0
  fi

  echo "❌ Folgende Checks sind fehlgeschlagen:"
  echo "$FAILED_CHECKS"

  if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
    echo "❌ CI nach $MAX_CI_ATTEMPTS Versuchen nicht grün." >&2
    exit 1
  fi

  echo "Warte vor nächstem Versuch..."
  sleep 30
done
