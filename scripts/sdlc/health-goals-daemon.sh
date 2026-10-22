#!/usr/bin/env bash
# scripts/sdlc/health-goals-daemon.sh — Periodic/Hook runner that records repo health measurements to Postgres (T016507, T016657).
#
# Usage: bash scripts/sdlc/health-goals-daemon.sh [--fast] [--values-file F --complete-file M] [<GOAL-ID> ...]
#   ohne IDs: Vollscan aller definierten Ziele (health-goals-scan.sh --all)
#   mit IDs:  ausdrücklich begrenzter Lauf
#   --values-file/--complete-file: bereits gemessenes Paket speichern statt neu zu messen
#   DRY_RUN=1: nichts schreiben, sofort Exit 0
#
# Exit 0 nur, wenn Scan, Auswertung und Speicherung erfolgreich waren.
# Scanner-, JSON- und DB-Fehler propagieren mit Diagnose auf stderr.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Geplante Dry-Runs dürfen die Datenbank weder initialisieren noch beschreiben.
if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "Dry run: health measurements are not recorded."
  exit 0
fi

CTX="${TICKET_CTX:-devmesh}"
NS="${TICKET_NS:-workspace}"

POD="$(kubectl --context "$CTX" -n "$NS" get pod -l app=shared-db \
  --field-selector=status.phase=Running -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)"
if [[ -z "$POD" ]]; then
  echo "ERROR: shared-db pod not reachable in context '$CTX' ($NS) — nothing recorded." >&2
  exit 1
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo 'detached')"

echo "Running health-goals measurement for commit ${GIT_SHA} (${GIT_BRANCH})..."

TMP_OUT="$(mktemp)"
TMP_SQL="$(mktemp)"
trap 'rm -f "$TMP_OUT" "$TMP_SQL"' EXIT

# Dateiargumente von --values-file/--complete-file sind keine Ziel-IDs.
has_ids=0
has_packet=0
skip_next=0
for a in "$@"; do
  if [[ "$skip_next" -eq 1 ]]; then skip_next=0; continue; fi
  case "$a" in
    --values-file|--complete-file) skip_next=1; has_packet=1 ;;
    --*) ;;
    *) has_ids=1 ;;
  esac
done
SCAN_CLI=("$@")
if [[ "$has_ids" -eq 0 ]]; then
  if [[ "$has_packet" -eq 1 ]]; then
    # Übernommenes Runner-Messpaket: ohne lokal-only Ziele (Host/Worktree/LLM-Stack
    # sind dort nicht beobachtbar und würden sonst als unknown gespeichert).
    mapfile -t PACKET_IDS < <(python3 "${REPO_ROOT}/scripts/lib/health_goals_record.py" ids \
      "${REPO_ROOT}/components/website/src/lib/sdlc/goals-data.generated.json" "${REPO_ROOT}/Taskfile.yml")
    [[ ${#PACKET_IDS[@]} -gt 0 ]] || { echo "ERROR: no valid goal IDs" >&2; exit 1; }
    SCAN_CLI+=("${PACKET_IDS[@]}")
  else
    SCAN_CLI+=(--all)
  fi
fi

if ! bash "${REPO_ROOT}/scripts/health-goals-scan.sh" "${SCAN_CLI[@]}" > "$TMP_OUT"; then
  echo "ERROR: health-goals-scan.sh failed — nothing recorded." >&2
  exit 1
fi

python3 "${REPO_ROOT}/scripts/lib/health_goals_record.py" daemon-sql "$TMP_OUT" "$GIT_SHA" "$GIT_BRANCH" \
  "${REPO_ROOT}/components/website/src/lib/sdlc/goals-data.generated.json" > "$TMP_SQL"

if [[ ! -s "$TMP_SQL" ]]; then
  echo "No measurements returned by the scanner — nothing recorded."
  exit 0
fi

if ! kubectl --context "$CTX" -n "$NS" exec -i "$POD" -c postgres -- \
    psql -U website -d website -q -v ON_ERROR_STOP=1 < "$TMP_SQL"; then
  echo "ERROR: writing quality.repo_health_measurements failed — transaction rolled back." >&2
  exit 1
fi

echo "Health goals measurements recorded to quality.repo_health_measurements."
