#!/usr/bin/env bash
# scripts/sdlc/health-goals-daemon.sh — Periodic/Hook runner that records repo health measurements to Postgres (T016507).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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
  exit 0
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo 'detached')"

echo "Running health-goals measurement for commit ${GIT_SHA} (${GIT_BRANCH})..."

# If arguments (goal IDs) are provided, scan those; otherwise run scan on active goals
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

if [[ $# -gt 0 ]]; then
  bash "${REPO_ROOT}/scripts/health-goals-scan.sh" "$@" > "$TMP_OUT" 2>/dev/null || true
else
  # Default quick scan of anchor goals
  bash "${REPO_ROOT}/scripts/health-goals-scan.sh" G-RH01 G-CQ02 G-GIT01 G-SIZE03 > "$TMP_OUT" 2>/dev/null || true
fi

# Insert measurements into Postgres
python3 - "$TMP_OUT" "$GIT_SHA" "$GIT_BRANCH" "$POD" "$CTX" "$NS" <<'PY'
import json
import subprocess
import sys

out_file, sha, branch, pod, ctx, ns = sys.argv[1:7]
try:
    with open(out_file) as f:
        data = json.load(f)
except Exception as e:
    sys.exit(0)

if not data:
    sys.exit(0)

sql_lines = ["BEGIN;"]
for item in data:
    gid = item.get("id")
    actual = item.get("actual")
    if gid and actual is not None:
        status = "achieved" if actual <= (item.get("target") or actual) else "at_risk"
        sql_lines.append(f"""
        INSERT INTO quality.repo_health_measurements (goal_id, current_value, status, git_sha, git_branch)
        VALUES ('{gid}', {actual}, '{status}', '{sha}', '{branch}');
        """)
sql_lines.append("COMMIT;")

full_sql = "\n".join(sql_lines)
cmd = [
    "kubectl", "--context", ctx, "-n", ns, "exec", "-i", pod,
    "-c", "postgres", "--", "psql", "-U", "website", "-d", "website", "-q", "-v", "ON_ERROR_STOP=1"
]
subprocess.run(cmd, input=full_sql, text=True)
PY

echo "Health goals measurements recorded to quality.repo_health_measurements."
