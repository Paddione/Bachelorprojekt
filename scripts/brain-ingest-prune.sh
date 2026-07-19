#!/usr/bin/env bash
# brain-ingest-prune.sh — Deletion-Sync: entfernt Wiki-Seiten, deren Quelle
# im Bachelorprojekt nicht mehr existiert (D1/D2, T001963).
# Usage: brain-ingest-prune.sh --brain-repo <path> [--root <repo-root>] \
#          [--worklist <tsv>] [--state <path>] [--prune]
# Default: dry (nur PRUNE-CANDIDATE-Zeilen listen). --prune löscht scharf.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$DEFAULT_ROOT/scripts/brain/ingest-sources.yaml"
WORKLIST_SCRIPT="$HERE/brain-ingest-worklist.sh"

BRAIN_REPO=""
ROOT="$DEFAULT_ROOT"
WORKLIST=""
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
DO_PRUNE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brain-repo) BRAIN_REPO="${2:?--brain-repo requires a path}"; shift ;;
    --root)       ROOT="${2:?--root requires a path}"; shift ;;
    --worklist)   WORKLIST="${2:?--worklist requires a path}"; shift ;;
    --state)      STATE_FILE="${2:?--state requires a path}"; shift ;;
    --prune)      DO_PRUNE=1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$BRAIN_REPO" ] || { echo "error: --brain-repo required" >&2; exit 1; }
[ -d "$BRAIN_REPO/wiki" ] || { echo "error: no wiki/ dir under --brain-repo: $BRAIN_REPO" >&2; exit 1; }
[ -f "$STATE_FILE" ] || { echo "error: state file not found: $STATE_FILE" >&2; exit 1; }

GENERATED_WORKLIST=""
if [ -z "$WORKLIST" ]; then
  GENERATED_WORKLIST="$(mktemp)"
  trap '[ -n "$GENERATED_WORKLIST" ] && rm -f "$GENERATED_WORKLIST"' EXIT
  bash "$WORKLIST_SCRIPT" --root "$ROOT" --manifest "$MANIFEST" > "$GENERATED_WORKLIST"
  WORKLIST="$GENERATED_WORKLIST"
fi

CANDIDATES=0

for page in "$BRAIN_REPO"/wiki/*.md; do
  [ -e "$page" ] || continue
  slug="$(basename "$page" .md)"
  src_line="$(grep -m1 '^source:: ' "$page" || true)"
  src_path=""
  state_src=""
  candidate=0

  if [[ "$src_line" == "source:: Bachelorprojekt "* ]]; then
    src_path="${src_line#source:: Bachelorprojekt }"
    if [ ! -e "$ROOT/$src_path" ] && ! cut -f1 "$WORKLIST" | grep -qxF "$src_path"; then
      candidate=1
    fi
  elif [ -z "$src_line" ] || [[ "$src_line" != "source:: Bachelorprojekt "* ]]; then
    state_src="$(jq -r --arg s "$slug" 'to_entries[] | select(.value.slug == $s) | .key' "$STATE_FILE" | head -1)"
    if [ -n "$state_src" ] && [ ! -e "$ROOT/$state_src" ] \
       && ! cut -f1 "$WORKLIST" | grep -qxF "$state_src"; then
      candidate=1
    fi
    # Weder Bachelorprojekt-source:: noch State-Eintrag → Meta-Seite, NIE löschen
  fi

  [ "$candidate" -eq 1 ] || continue
  CANDIDATES=$((CANDIDATES + 1))

  echo "PRUNE-CANDIDATE: wiki/$slug.md (source: ${src_path:-$state_src})"
  if [ "$DO_PRUNE" -eq 1 ]; then
    rm -f "$page"
    (
      flock -x 200
      tmp="$(mktemp)"
      jq --arg k "${src_path:-$state_src}" 'del(.[$k])' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
    ) 200>"$STATE_FILE.lock"
    echo "PRUNED: wiki/$slug.md"
  fi
done

if [ "$DO_PRUNE" -eq 1 ]; then
  echo "Prune: $CANDIDATES Kandidaten (gelöscht)"
else
  echo "Prune: $CANDIDATES Kandidaten (dry)"
fi
exit 0
