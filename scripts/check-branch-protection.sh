#!/usr/bin/env bash
# check-branch-protection.sh — Branch Protection eines Branches bewerten [T002889]
#
# Hintergrund: main trug am 2026-08-09 enforce_admins.enabled=false und kein
# required_pull_request_reviews. Sieben Required Status Checks waren konfiguriert,
# galten aber nicht fuer Admins — ein Admin-Push landete ungeprueft auf main.
# Dieses Skript macht den nicht-versionierten Server-Zustand pruefbar.
#
# Exit-Codes (die Dreiteilung ist der Zweck des Skripts):
#   0  geprueft und konform
#   1  geprueft und mangelhaft — JEDER unerfuellte Punkt wird einzeln benannt
#   2  NICHT pruefbar (gh fehlt, API-Aufruf schlug fehl) — damit "nicht pruefbar"
#      nicht als "geprueft und in Ordnung" durchgeht
#
# Aufruf:
#   scripts/check-branch-protection.sh [branch]              # gegen die Live-API, Default main
#   scripts/check-branch-protection.sh --from-json <datei>   # Einstellungen aus Datei
#
# Der --from-json-Pfad ist der einzige, der ohne Admin-Scope funktioniert, und
# der Pfad, den tests/spec/ci-cd/main-direct-push-guard.bats benutzt.

set -euo pipefail

REPO_SLUG="${REPO_SLUG:-Paddione/Bachelorprojekt}"
BRANCH="main"
FROM_JSON=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-json)
      FROM_JSON="${2:-}"
      [[ -n "$FROM_JSON" ]] || { echo "✗ --from-json erwartet einen Dateipfad" >&2; exit 2; }
      shift 2
      ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      BRANCH="$1"
      shift
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq nicht gefunden — Protection nicht pruefbar" >&2
  exit 2
fi

# --- Einstellungen beschaffen ---------------------------------------------
if [[ -n "$FROM_JSON" ]]; then
  if [[ ! -f "$FROM_JSON" ]]; then
    echo "✗ Datei nicht gefunden: $FROM_JSON — Protection nicht pruefbar" >&2
    exit 2
  fi
  if ! PROTECTION="$(jq -e '.' <"$FROM_JSON" 2>/dev/null)"; then
    echo "✗ kein gueltiges JSON: $FROM_JSON — Protection nicht pruefbar" >&2
    exit 2
  fi
else
  if ! command -v gh >/dev/null 2>&1; then
    echo "✗ gh nicht gefunden — Protection nicht pruefbar" >&2
    exit 2
  fi
  API_PATH="repos/${REPO_SLUG}/branches/${BRANCH}/protection"
  if ! PROTECTION="$(gh api "$API_PATH" 2>/dev/null)"; then
    # 404 heisst: gar keine Protection konfiguriert. Das ist ein bekannter
    # unsicherer Zustand, kein Messfehler — also Exit 1 statt Exit 2, mit
    # beiden Maengeln benannt. Jeder andere Fehler bleibt "nicht pruefbar".
    if gh api "$API_PATH" 2>&1 | grep -qi 'Branch not protected\|HTTP 404'; then
      echo "✗ ${REPO_SLUG}@${BRANCH}: keine Branch Protection konfiguriert"
      echo "  ✗ enforce_admins ist nicht aktiv"
      echo "  ✗ required_pull_request_reviews fehlt"
      exit 1
    fi
    echo "✗ API-Aufruf fehlgeschlagen: $API_PATH — Protection nicht pruefbar" >&2
    echo "  Hinweis: das Lesen von branches/*/protection verlangt Admin-Scope." >&2
    exit 2
  fi
fi

# --- Bewerten -------------------------------------------------------------
# Beide Punkte werden IMMER geprueft, nie nach dem ersten Treffer abgebrochen:
# wer hier abbricht, schliesst die eine Luecke und laesst die andere offen —
# genau der Zustand, den T002889 behebt.
FAILED=0

if [[ "$(jq -r '.enforce_admins.enabled // false' <<<"$PROTECTION")" == "true" ]]; then
  echo "  ✓ enforce_admins ist aktiv"
else
  echo "  ✗ enforce_admins ist nicht aktiv — Admin-Pushes umgehen alle Required Checks"
  FAILED=1
fi

if [[ "$(jq -r 'has("required_pull_request_reviews")' <<<"$PROTECTION")" == "true" ]]; then
  echo "  ✓ required_pull_request_reviews ist gesetzt"
else
  echo "  ✗ required_pull_request_reviews fehlt — Aenderungen koennen ohne PR landen"
  FAILED=1
fi

CONTEXTS="$(jq -r '.required_status_checks.contexts // [] | length' <<<"$PROTECTION")"
echo "  · required_status_checks: ${CONTEXTS} contexts"

if [[ "$FAILED" -ne 0 ]]; then
  echo "✗ ${BRANCH}: Branch Protection unvollstaendig" >&2
  exit 1
fi

echo "✓ ${BRANCH}: Branch Protection vollstaendig"
exit 0
