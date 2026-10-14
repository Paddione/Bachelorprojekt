#!/usr/bin/env bash
# scripts/sdlc/health-goals-daemon.sh — Periodic/Hook runner that records repo health measurements to Postgres,
# creates tickets on regression, and wakes the agent harness (T016507).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CTX="${TICKET_CTX:-devmesh}"
NS="${TICKET_NS:-workspace}"

ALL_GOALS=0
NO_TICKET=0
NO_WAKE=0
DRY_RUN=0
TARGET_IDS=()

usage() {
  cat <<'EOF'
Usage: scripts/sdlc/health-goals-daemon.sh [OPTIONS] [GOAL-ID ...]

Options:
  --all         Scan all active goals from quality.repo_health_goals or snapshot
  --no-ticket   Do not create tickets on failing goals (measurement only)
  --no-wake     Do not trigger/wake the agent harness for regressions
  --dry-run     Print planned SQL, ticket checks and wake-up actions without writing
  -h, --help    Show this help message

If no GOAL-IDs are supplied and --all is not set, default anchor goals are scanned:
  G-RH01 G-CQ02 G-GIT01 G-SIZE03
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) ALL_GOALS=1; shift ;;
    --no-ticket) NO_TICKET=1; shift ;;
    --no-wake) NO_WAKE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    --*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) TARGET_IDS+=("$1"); shift ;;
  esac
done

_resolve_pod() {
  kubectl --context "$CTX" -n "$NS" get pod -l app=shared-db \
    --field-selector=status.phase=Running -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true
}

_exec_psql() {
  local sql="$1"
  if [[ -n "${WORKSPACE_PG_URL:-${DATABASE_URL:-}}" ]]; then
    psql "${WORKSPACE_PG_URL:-${DATABASE_URL}}" -q -v ON_ERROR_STOP=1 <<< "$sql"
  elif [[ -n "${POD:-}" ]]; then
    kubectl --context "$CTX" -n "$NS" exec -i "$POD" \
      -c postgres -- psql -U website -d website -q -v ON_ERROR_STOP=1 <<< "$sql"
  else
    echo "WARN: No database connection available for SQL execution." >&2
    return 1
  fi
}

POD=""
if [[ -z "${WORKSPACE_PG_URL:-${DATABASE_URL:-}}" ]]; then
  POD="$(_resolve_pod)"
  if [[ -z "$POD" && "$DRY_RUN" -eq 0 ]]; then
    echo "WARN: shared-db pod not reachable in context '$CTX' ($NS) and no WORKSPACE_PG_URL set — measurement recording skipped." >&2
    exit 0
  fi
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo 'detached')"

# Determine goals to scan
SCAN_IDS=()
if [[ "${#TARGET_IDS[@]}" -gt 0 ]]; then
  SCAN_IDS=("${TARGET_IDS[@]}")
elif [[ "$ALL_GOALS" -eq 1 ]]; then
  # Read active goal IDs from snapshot
  SNAPSHOT="${REPO_ROOT}/components/website/src/lib/sdlc/goals-data.snapshot.json"
  if [[ -f "$SNAPSHOT" ]]; then
    mapfile -t SCAN_IDS < <(python3 -c "import json; [print(g['id']) for g in json.load(open('$SNAPSHOT')) if g.get('priority') in ('A','B','C')]")
  else
    SCAN_IDS=(G-RH01 G-CQ02 G-GIT01 G-SIZE03)
  fi
else
  # Default anchor goals
  SCAN_IDS=(G-RH01 G-CQ02 G-GIT01 G-SIZE03)
fi

echo "Running health-goals measurement for commit ${GIT_SHA} (${GIT_BRANCH}) [${#SCAN_IDS[@]} goals]..."

TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

bash "${REPO_ROOT}/scripts/health-goals-scan.sh" "${SCAN_IDS[@]}" > "$TMP_OUT" 2>/dev/null || true

# Process measurements, persist into Postgres, and identify failing goals needing tickets/wake-up
FAILING_FILE="$(mktemp)"
trap 'rm -f "$TMP_OUT" "$FAILING_FILE"' EXIT

python3 - "$TMP_OUT" "$GIT_SHA" "$GIT_BRANCH" "$DRY_RUN" "$FAILING_FILE" > /tmp/health_measurements.sql <<'PY'
import json
import os
import sys

out_file, sha, branch, dry_run_str, failing_file = sys.argv[1:6]
dry_run = dry_run_str == "1"

try:
    with open(out_file) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)

if not data:
    sys.exit(0)

sql_lines = ["BEGIN;"]
failing_goals = []

for item in data:
    gid = item.get("id")
    if not gid or not item.get("measurable", False):
        continue
    actual = item.get("actual")
    cmp_op = item.get("cmp", "le")
    target = item.get("target")

    if actual is None:
        continue

    # Evaluate status
    if target is not None:
        if cmp_op == "le":
            ok = actual <= target
        elif cmp_op == "ge":
            ok = actual >= target
        elif cmp_op == "eq":
            ok = actual == target
        else:
            ok = False
    else:
        ok = True

    status = "achieved" if ok else "at_risk"

    details = json.dumps({"cmp": cmp_op, "target": target})
    sql_lines.append(f"""
    INSERT INTO quality.repo_health_measurements (goal_id, current_value, status, git_sha, git_branch, details)
    VALUES ('{gid}', {actual}, '{status}', '{sha}', '{branch}', '{details}'::jsonb);
    """)

    if not ok:
        failing_goals.append({
            "id": gid,
            "actual": actual,
            "cmp": cmp_op,
            "target": target,
            "status": status
        })

sql_lines.append("COMMIT;")
full_sql = "\n".join(sql_lines)

if dry_run:
    print("[DRY-RUN] Planned SQL:\n" + full_sql)
else:
    # Print SQL to stdout for shell to execute via _exec_psql
    print(full_sql)

with open(failing_file, "w") as f:
    json.dump(failing_goals, f)
PY

if [[ "$DRY_RUN" -eq 0 && -s /tmp/health_measurements.sql ]]; then
  _exec_psql "$(< /tmp/health_measurements.sql)" >/dev/null || echo "WARN: DB insert encountered an issue." >&2
  rm -f /tmp/health_measurements.sql
  echo "Health goals measurements recorded to quality.repo_health_measurements."
fi

# Triage & Harness Wake-Up for failing goals
if [[ -s "$FAILING_FILE" ]]; then
  python3 - "$FAILING_FILE" "$NO_TICKET" "$NO_WAKE" "$DRY_RUN" "$REPO_ROOT" "$GIT_SHA" "$GIT_BRANCH" <<'PY_TRIAGE'
import json
import subprocess
import sys

failing_file, no_ticket_str, no_wake_str, dry_run_str, repo_root, sha, branch = sys.argv[1:8]
no_ticket = no_ticket_str == "1"
no_wake = no_wake_str == "1"
dry_run = dry_run_str == "1"

try:
    with open(failing_file) as f:
        failing = json.load(f)
except Exception:
    failing = []

if not failing:
    sys.exit(0)

print(f"\nFound {len(failing)} failing health goal(s):")
for g in failing:
    gid = g["id"]
    actual = g["actual"]
    target = g["target"]
    cmp_op = g["cmp"]
    print(f"  - {gid}: actual={actual} (target {cmp_op} {target})")

    if no_ticket:
        continue

    # Check for existing open ticket for this goal
    check_sql = f"""
    SELECT external_id FROM tickets.tickets
    WHERE status NOT IN ('done', 'cancelled', 'superseded')
      AND (title ILIKE '%{gid}%' OR description ILIKE '%{gid}%')
    LIMIT 1;
    """
    existing_ticket = ""
    if not dry_run:
        # Check via ticket.sh or direct sql
        res = subprocess.run(
            ["bash", f"{repo_root}/scripts/ticket.sh", "list"],
            capture_output=True, text=True
        )
        for line in res.stdout.splitlines():
            if gid in line and ("open" in line or "triage" in line or "in_progress" in line or "review" in line):
                parts = line.split()
                if parts:
                    existing_ticket = parts[0]
                    break

    if existing_ticket:
        print(f"    Existing active ticket found ({existing_ticket}) — skipping duplicate ticket creation.")
        ticket_id = existing_ticket
    else:
        title = f"fix(health): {gid} regressed ({actual} vs target {target})"
        desc = (
            f"Health goal {gid} violated target threshold in commit {sha} ({branch}).\n"
            f"Measured value: {actual}\nTarget: {target} (cmp: {cmp_op})\n"
            f"Automated alert from scripts/sdlc/health-goals-daemon.sh."
        )
        if dry_run:
            print(f"    [DRY-RUN] Would create ticket: {title}")
            ticket_id = "T-DRYRUN"
        else:
            create_cmd = [
                "bash", f"{repo_root}/scripts/ticket.sh", "create",
                "--type", "fix",
                "--brand", "mentolder",
                "--severity", "major",
                "--priority", "hoch",
                "--title", title,
                "--description", desc,
                "--areas", "quality,ops"
            ]
            c_res = subprocess.run(create_cmd, capture_output=True, text=True)
            output = c_res.stdout.strip()
            ticket_id = output.split("|")[0].strip() if "|" in output else output.split()[0] if output else ""
            if ticket_id:
                print(f"    Created ticket: {ticket_id}")
            else:
                print(f"    WARN: Failed to create ticket: {c_res.stderr.strip() or output}")

    # Wake Agent Harness
    if ticket_id and not no_wake:
        if dry_run:
            print(f"    [DRY-RUN] Would wake agent harness for ticket: {ticket_id}")
        else:
            print(f"    Waking agent harness for ticket {ticket_id}...")
            # Spawn opencode agent or plan-runner in background
            wake_cmd = [
                "node", f"{repo_root}/scripts/llm/plan-runner.mjs",
                "--ticket", ticket_id,
                "--4b-slots", "1"
            ] if os.path.exists(f"{repo_root}/scripts/llm/plan-runner.mjs") else [
                "opencode", "run",
                "--agent", "plan-worker-qwen35",
                f"Health goal {gid} regressed. Diagnose and fix ticket {ticket_id}."
            ]
            try:
                log_file = open(f"/tmp/health-agent-{ticket_id}.log", "w")
                proc = subprocess.Popen(wake_cmd, stdout=log_file, stderr=subprocess.STDOUT, cwd=repo_root)
                print(f"    Agent harness dispatched (PID {proc.pid}), log: /tmp/health-agent-{ticket_id}.log")
            except Exception as exc:
                print(f"    WARN: Could not spawn agent harness: {exc}")
PY_TRIAGE
fi
