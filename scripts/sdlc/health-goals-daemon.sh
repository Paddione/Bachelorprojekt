#!/usr/bin/env bash
# scripts/sdlc/health-goals-daemon.sh — Periodic/Hook runner that records repo health measurements to Postgres (T016507).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Scheduled dry runs must never initialize or write the database.
if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "Dry run: health measurements are not recorded."
  exit 0
fi
VALUES_ARGS=()
IDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --values-file|--complete-file)
      [[ $# -ge 2 ]] || { echo "missing argument: $1" >&2; exit 2; }
      VALUES_ARGS+=("$1" "$2"); shift 2 ;;
    --*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) IDS+=("$1"); shift ;;
  esac
done

# Resolve context and pod
CTX="${TICKET_CTX:-devmesh}"
NS="${TICKET_NS:-workspace}"

_resolve_pod() {
  kubectl --context "$CTX" -n "$NS" get pod -l app=shared-db \
    --field-selector=status.phase=Running -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true
}

POD="$(_resolve_pod)"
if [[ -z "$POD" ]]; then
  echo "WARN: shared-db pod not reachable in context '$CTX' ($NS) — measurement recording skipped." >&2
  exit 1
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo 'detached')"

echo "Running health-goals measurement for commit ${GIT_SHA} (${GIT_BRANCH})..."

# Explicit IDs constrain a run; the default scans every defined goal.
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT
if [[ ${#IDS[@]} -eq 0 ]]; then
  CI_ARGS=()
  [[ "${CI:-}" != true ]] || CI_ARGS+=("$REPO_ROOT/Taskfile.yml")
  ALL_IDS="$(python3 "$REPO_ROOT/scripts/lib/health-goals-record.py" --ids     "$REPO_ROOT/components/website/src/lib/sdlc/goals-data.generated.json" "${CI_ARGS[@]}")"
  mapfile -t IDS <<< "$ALL_IDS"
  [[ ${#IDS[@]} -gt 0 ]] || { echo "ERROR: no valid goal IDs" >&2; exit 1; }
fi
bash "${REPO_ROOT}/scripts/health-goals-scan.sh" "${VALUES_ARGS[@]}" "${IDS[@]}" > "$TMP_OUT"
python3 "$REPO_ROOT/scripts/lib/health-goals-record.py" "$TMP_OUT" "$GIT_SHA" "$GIT_BRANCH" "$POD" "$CTX" "$NS"
echo "Health goals measurements recorded to quality.repo_health_measurements."
