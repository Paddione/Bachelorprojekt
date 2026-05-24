#!/usr/bin/env bash
# oracle-bench.sh — test a model's oracle capability: does it pick the right task?
set -euo pipefail
MODEL="${1:?Usage: oracle-bench.sh <model>}"
REPO="/home/patrick/Bachelorprojekt"
GOAL="show cluster status"
EXPECTED="clusters:status"

set +o pipefail
TASK_LIST=$(cd "${REPO}" && task --list-all 2>/dev/null | grep '^\* ' | sed 's/^\* //' | awk '
{
  n = split($0, parts, /:  +/)
  if (n >= 2) printf "%s — %s\n", parts[1], parts[2]
}')
set -o pipefail

PROMPT="You are a shell executor. No explanations. No commentary. Output only the raw command result.

Available tasks:
${TASK_LIST}

Pick the single best task for the goal below. Run it with cd ${REPO} && <task-command>. Print only its raw stdout/stderr.

Goal: ${GOAL}"

echo "=== Testing $MODEL ==="
START=$(date +%s)

OUTPUT=$(hermes chat -q "${PROMPT}" -m "${MODEL}" --yolo --quiet 2>/dev/null)
RC=$?

END=$(date +%s)
ELAPSED=$((END - START))

echo "Exit: $RC | Time: ${ELAPSED}s"
echo "--- Output (first 10 lines) ---"
echo "${OUTPUT}" | head -10
echo "---"

if echo "${OUTPUT}" | grep -q "clusters:status\|cluster:status\|NAME.*STATUS\|k3d\|kubectl\|mentolder\|korczewski"; then
  echo "RESULT: PASS ✓ (ran a cluster/status command)"
else
  echo "RESULT: FAIL ✗ (wrong command or no execution)"
fi
