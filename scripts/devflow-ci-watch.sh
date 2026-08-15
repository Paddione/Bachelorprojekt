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
# self-service a rebase against origin/main instead of hanging in the poll loop.
MERGE_STATE=$(gh pr view "$PR_URL" --json mergeStateStatus -q '.mergeStateStatus' 2>/dev/null || echo "")
if [[ "$MERGE_STATE" == "DIRTY" ]]; then
  echo "⚠ PR mergeStateStatus=DIRTY — Rebase gegen origin/main vor dem CI-Poll ..."
  git fetch origin main 2>/dev/null || true
  if git rebase origin/main; then
    echo "↻ Freshness-Artefakte nach Rebase regenerieren ..."
    task freshness:regenerate || echo "⚠ freshness:regenerate fehlgeschlagen — Push läuft ohne Regeneration weiter." >&2
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      git commit -m "chore(ci): regenerate freshness artifacts after auto-rebase [${TICKET_ID}]"
    fi
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

# Conflict preflight: a PR with real merge conflicts (mergeable=CONFLICTING)
# never starts CI checks — bail with a clear message instead of hanging.
MERGEABLE=$(gh pr view "$PR_URL" --json mergeable -q '.mergeable' 2>/dev/null || echo "")
if [[ "$MERGEABLE" == "CONFLICTING" ]]; then
  echo "❌ PR hat echte Merge-Konflikte gegen main (mergeable=CONFLICTING) — manueller Rebase nötig (kein Auto-Resolve möglich)." >&2
  echo "   Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" >&2
  echo "   Fix: rebase den Branch auf origin/main, dann rufe devflow-ci-watch.sh erneut auf." >&2
  exit 4
fi

# [T002671] MERGED-Preflight: a PR that is already MERGED never needs (re-)polling —
# its checks were, by branch-protection definition, already green. Without this check
# the loop's first action is the BLOCKING `gh pr checks --watch` call, which can hang
# indefinitely against a closed PR (observed T002628/T002671).
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

  # [T003225] headSha-Filter: statusCheckRollup kann Checks VORGÄNGER-Commits mischen
  # (Re-Runs nach Push). Nur Checks des aktuellen PR-HEAD zählen — fremde head-SHAs
  # werden ignoriert. Der Filter ist Vorbedingung für jede Auswertung darunter.
  HEAD_OID="$(gh pr view "$PR_URL" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")"
  if [[ -z "$HEAD_OID" ]]; then
    echo "⚠ gh pr view --json headRefOid fehlgeschlagen — PR-HEAD nicht bestimmbar, Checks können nicht sicher bewertet werden." >&2
    if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
      echo "❌ Nach $MAX_CI_ATTEMPTS Versuchen weiterhin keine verlässliche Check-Auskunft von gh — manuelles Eingreifen nötig." >&2
      exit 1
    fi
    sleep 15
    continue
  fi

  # [T003224] cancelled ≠ fail: nur echte FAILURE/TIMED_OUT-Conclusions am aktuellen
  # HEAD zählen als Fehler. Laufende (conclusion="") und abgebrochene (CANCELLED/SKIPPED)
  # Checks sind KEIN failure — ein aggregierter "fail"-Check, dessen Jobs alle grün oder
  # cancelled sind, ist kein Codefehler, sondern ein Re-Run-Kandidat.
  if ! FAILED_CHECKS=$(gh pr view "$PR_URL" --json headRefOid,statusCheckRollup \
    -q '. as $p | $p.statusCheckRollup[] | select(.headSha == $p.headRefOid) | select(
          (.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT"
        ) | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")'); then
    echo "⚠ gh pr view --json statusCheckRollup fehlgeschlagen (Auth/Schema/Rate-Limit?) — kann Checks nicht sicher bewerten." >&2
    if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
      echo "❌ Nach $MAX_CI_ATTEMPTS Versuchen weiterhin keine verlässliche Check-Auskunft von gh — manuelles Eingreifen nötig." >&2
      exit 1
    fi
    sleep 15
    continue
  fi

  PR_HEAD_OID=$(gh pr view "$PR_URL" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")
  TOTAL_CHECKS=$(gh api "repos/Paddione/Bachelorprojekt/commits/${PR_HEAD_OID}/check-runs" -q '.total_count' 2>/dev/null || echo "0")
  if [[ "$TOTAL_CHECKS" -eq 0 ]]; then
    echo "⚠ Keine CI-Checks gefunden (total_count=0) — CI wurde nie gestartet oder läuft noch."
    exit 5
  fi

  # [T003612] Pending-Check VOR der Grün-Prüfung: laufende Checks sind weder grün
  # noch rot — erst abwarten, bis alle COMPLETED sind.
  PENDING_COUNT=$(gh pr view "$PR_URL" --json statusCheckRollup \
    -q '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' 2>/dev/null || echo "0")
  if [[ "$PENDING_COUNT" -gt 0 ]]; then
    if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
      echo "❌ Nach $MAX_CI_ATTEMPTS Versuchen noch $PENDING_COUNT Checks nicht abgeschlossen — manuelles Eingreifen nötig." >&2
      exit 1
    fi
    echo "⏳ $PENDING_COUNT Checks noch nicht abgeschlossen — warte ..."
    sleep 30
    continue
  fi

  # [T003224] Gegenprobe auf Run-/Job-Ebene BEVOR über rot/grün entschieden wird:
  # ein aggregierter "failure"-Check, dessen Jobs alle success/cancelled/skipped sind,
  # ist KEIN Codefehler (z.B. ein nachträglich abgebrochener Re-Run auf demselben HEAD).
  # Nur wenn mindestens ein Job conclusion=="failure" hat, gilt der Check als echt rot —
  # sonst FAILED_CHECKS leeren, damit der Lauf als grün weiterläuft.
  if [[ -n "$FAILED_CHECKS" ]]; then
    FAILED_RUN_ID=$(gh run list --branch "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)" \
      --json databaseId,headSha,status,conclusion \
      | jq -r --arg head "$HEAD_OID" '[.[] | select(.conclusion == "failure" and .headSha == $head)] | sort_by(.databaseId) | last | .databaseId // empty')
    if [[ -n "$FAILED_RUN_ID" ]]; then
      REAL_FAILURES=$(gh api "repos/Paddione/Bachelorprojekt/actions/runs/${FAILED_RUN_ID}/jobs" \
        --jq '[.jobs[] | select(.conclusion == "failure")] | length' 2>/dev/null || echo "")
      if [[ "$REAL_FAILURES" =~ ^[0-9]+$ ]] && [ "$REAL_FAILURES" -eq 0 ]; then
        echo "ℹ Check $FAILED_RUN_ID meldet failure, aber KEIN Job ist failure (cancelled/skipped) — kein Codefehler, weiter beobachten."
        FAILED_CHECKS=""
      fi
    else
      # Kein failure-Run am aktuellen HEAD gefunden, obwohl das Rollup rot meldet: die
      # Meldung stammt von einem abgebrochenen/leeren Lauf oder einem fremden HEAD —
      # beides ist kein echter Codefehler. (Das Rollup wurde bereits auf .headSha gefiltert.)
      echo "ℹ Rollup meldet rot, aber kein failure-Run am aktuellen HEAD — kein Codefehler, weiter beobachten."
      FAILED_CHECKS=""
    fi
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

  if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
    echo "❌ CI nach $MAX_CI_ATTEMPTS Versuchen noch rot — manuelles Eingreifen nötig:"
    echo "$FAILED_CHECKS"
    exit 1
  fi

  echo "⚠ Fehlgeschlagene Checks:"
  echo "$FAILED_CHECKS"

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
