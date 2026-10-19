#!/usr/bin/env bash
# devflow-post-merge-deploy.sh — Auto-detect deploy targets from merged PR files
# Aus dev-flow-execute Schritt 8 extrahiert (Chore T001007).
set -u

# T009368: Merge-Commit-Selektion als eigene Funktion, damit BATS sie gegen ein
# temp-Git-Repo laufen lassen kann (Output-Verifikation, T002448-M4).
# Semantik: neuester Commit auf origin/main mit [TICKET_ID] im Subject, AUSSER
# Pfade und fuehrte sonst zu "Keine bekannten Deploy-Trigger" ohne Deploy-Phase-
# Event (beobachtet T008017: getroffen 673f14a48 statt Feature-Merge abda93f9a).
# Nicht nutzbar: --all-match + --invert-match — "matcht nicht beide Patterns"
# schliesst auch Commits ohne Ticket-ID ein (semantisch falsch).
select_merge_commit() {
  local repo="${1:?repo erforderlich}"
  local ticket_id="${2:?ticket_id erforderlich}"
  local all first
  all=$(git -C "$repo" log origin/main --format="%H %s" --grep="\\[${ticket_id}\\]" 2>/dev/null)
  first=$(printf '%s\n' "$all" | grep -vE ' chore\(plans\): archive ' | head -1 | awk '{print $1}')
  # [T008015-1] Bleibt nach dem Archiv-Filter nichts uebrig, es gab aber sehr wohl
  # Treffer, dann besteht die Historie des Tickets ausschliesslich aus Archiv-
  # Commits. Dann den neuesten Treffer zurueckgeben statt leer: der Aufrufer
  # meldet dann "Keine bekannten Deploy-Trigger" (Exit 0) statt mit Exit 3
  # "Kein Merge-Commit gefunden" abzubrechen — der Commit existiert ja.
  # Leer bleibt es nur, wenn es ueberhaupt keinen Treffer gab; das ist Exit 3.
  if [ -z "$first" ]; then
    first=$(printf '%s\n' "$all" | grep -v '^$' | head -1 | awk '{print $1}')
  fi
  printf '%s' "$first"
}

# Beim Sourcing (BATS-Funktionstest) nur die Funktionen bereitstellen.
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
fi

PR_NUM=""
TICKET_ID=""
while [[ $# -gt 0 ]]; do case "$1" in
  --pr) PR_NUM="${2:-}"; shift 2 ;;
  --ticket) echo "ERROR: Ticket-System retiriert (2026-10-14) — nutze --pr <n>." >&2; exit 2 ;;
  -*) echo "FEHLER: unbekannte Option '$1' — Usage: devflow-post-merge-deploy.sh --pr <n> | T00XXXX" >&2; exit 2 ;;
  *) [[ -z "$TICKET_ID" ]] && TICKET_ID="$1" || { echo "FEHLER: unerwartetes Argument '$1'." >&2; exit 2; }; shift ;;
esac; done
if [[ -z "$PR_NUM" && -z "$TICKET_ID" ]]; then
  echo "FEHLER: --pr <n> oder Ticket-ID erforderlich — Usage: devflow-post-merge-deploy.sh --pr <n> | T00XXXX" >&2
  exit 2
fi
# T002506-Review (M7): T-Nummer-Format validieren, bevor die ID als Regex in
# --grep landet. Eine malformed ID wuerde als Zeichenklasse/Regex interpretiert
# und koennte nicht gemeinte Commits matchen — identisches Muster wie in
# agent-lock-merged.sh cmd_check_merged.
if [[ -n "$TICKET_ID" ]]; then
case "$TICKET_ID" in T[0-9][0-9][0-9][0-9][0-9][0-9]) : ;; *)
  echo "FEHLER: ungültiges Ticket-ID-Format '$TICKET_ID' (erwartet T######)" >&2
  exit 2
esac
fi
# T002448-M9/M10: Finde den Merge-Commit durch Ticket-ID-Match auf main,
# nicht durch blindes `git log -1`. Bei mehreren intervenierenden Commits
# zwischen Merge und HEAD liefert `-1` den falschen Commit.
# M7 (T002506): `--merges` gestrichen — das Repo squasht PRs (1 Parent),
# `--merges` wuerde nur echte Merge-Commits (≥2 Parents) finden und schliesst
# den Squash-Commit aus.
# T009368: `select_merge_commit` filtert zusaetzlich die Archiv-Commit-Klasse
# heraus — deren Subject traegt die Ticket-ID ebenfalls und kaeme sonst als
# neuester Treffer zurueck (siehe Funktionskommentar oben).
if [[ -n "$PR_NUM" ]]; then
  PR_STATE="$(gh pr view "$PR_NUM" --json state -q .state 2>/dev/null || true)"
  [[ "$PR_STATE" == "MERGED" ]] || { echo "FEHLER: PR #$PR_NUM ist nicht MERGED (state=${PR_STATE:-unbekannt})." >&2; exit 3; }
  MERGE_COMMIT="$(gh pr view "$PR_NUM" --json mergeCommit -q .mergeCommit.oid 2>/dev/null || true)"
  [[ -n "$MERGE_COMMIT" ]] || { echo "FEHLER: Kein Merge-Commit fuer PR #$PR_NUM bestimmbar." >&2; exit 3; }
else
  MERGE_COMMIT=$(select_merge_commit . "$TICKET_ID")
  if [[ -z "$MERGE_COMMIT" ]]; then
    echo "FEHLER: Kein Merge-Commit fuer Ticket ${TICKET_ID} auf origin/main gefunden." >&2
    exit 3
  fi
fi
# Generierte Artefakte (linguist-generated in .gitattributes) aus der Deploy-Routing-
# (T002255). SSOT des Routings: .claude/skills/references/deploy-routing.md
# T003982: k3d/sdlc-stack/ existiert nur auf dem lokalen k3d-Dev-Cluster, nicht auf
# fleet. grep -E hat kein Lookahead, deshalb VOR dem DEPLOY_K8S-Match (Zeile 48) filtern.
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT" \
  | bash scripts/filter-generated.sh | sed '/^k3d\/sdlc-stack\//d')

DEPLOY_WEBSITE=false
DEPLOY_K8S=false

echo "$CHANGED" | grep -qE '^components/website/' && DEPLOY_WEBSITE=true
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' \
  && DEPLOY_K8S=true

if [[ "$DEPLOY_WEBSITE" == false \
      && "$DEPLOY_K8S" == false ]]; then
  echo "⚠ Keine bekannten Deploy-Trigger in den geänderten Dateien erkannt."
  echo "Geänderte Dateien:"; echo "$CHANGED"
  echo "Bitte manuell deployen."
  exit 0
fi

FAILED_TASKS=()

# Container-Images werden NICHT lokal gebaut (T002255). Prod laeuft pull-based via Flux,
# die Images baut GitHub Actions; ein lokaler Build braucht einen GHCR-Login, den der
# Agent nicht haelt. Zuvor scheiterte er reproduzierbar mit
#   ERROR: failed to build: failed to solve: error getting credentials
# und wurde als deploy/blocked gemeldet, obwohl der CI-Build fuer denselben SHA gruen war
# — das verfaelschte die DORA-Auswertung (beobachtet: T002251 / PR #3300).
if [[ "$DEPLOY_WEBSITE" == true ]]; then
  echo "ℹ Website-Image: .github/workflows/build-website.yml baut+rollt aus (pull-based via Flux) — kein lokaler Build."
fi

# Break-Glass bleibt: `kubectl apply` braucht keinen Registry-Login.
if [[ "$DEPLOY_K8S" == true ]]; then
  echo "🚀 Deploye K8s-Manifeste (beide Brands)..."
  task feature:deploy || { rc=$?; FAILED_TASKS+=("feature:deploy=$rc"); }
fi

if [[ ${#FAILED_TASKS[@]} -eq 0 ]]; then
  echo "✅ Deploy abgeschlossen (Merge $MERGE_COMMIT)."
else
  DETAIL="deploy blocked: $(IFS=,; echo "${FAILED_TASKS[*]}")"
  echo "❌ $DETAIL" >&2
  exit 1
fi
