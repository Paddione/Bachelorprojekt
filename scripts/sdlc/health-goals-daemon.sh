#!/usr/bin/env bash
# scripts/sdlc/health-goals-daemon.sh — Periodic/Hook runner that records repo health measurements to Postgres (T016507, T016657).
#
# Usage: bash scripts/sdlc/health-goals-daemon.sh [--fast] [<GOAL-ID> ...]
#   ohne IDs: Vollscan aller definierten Ziele (health-goals-scan.sh --all)
#   mit IDs:  ausdrücklich begrenzter Lauf
#
# Exit 0 nur, wenn Scan, Auswertung und Speicherung erfolgreich waren.
# Scanner-, JSON- und DB-Fehler propagieren mit Diagnose auf stderr.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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

has_ids=0
for a in "$@"; do [[ "$a" == --* ]] || has_ids=1; done
SCAN_CLI=("$@")
[[ "$has_ids" -eq 1 ]] || SCAN_CLI+=(--all)

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
