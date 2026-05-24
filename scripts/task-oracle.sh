#!/usr/bin/env bash
# task-oracle.sh — natural-language task dispatcher
# Model selects the task name; bash executes it. No tool calls needed.
set -euo pipefail

GOAL="${*:?Usage: task-oracle.sh '<goal>'}"
REPO="/home/patrick/Bachelorprojekt"
MODEL="qwen3:8b"

# ── Primary: Hermes (local model, no API cost) ────────────────────────
if hermes status 2>/dev/null | grep -q "Model:"; then
  # Pre-fetch task list (pipefail off: head closes pipe early → SIGPIPE)
  set +o pipefail
  TASK_LIST=$(cd "${REPO}" && task --list-all 2>/dev/null | head -150)
  set -o pipefail

  PROMPT="From the task list below, output ONLY the single best matching task name for the goal. No explanation. No flags. Just the task name exactly as listed.

Task list:
${TASK_LIST}

Goal: ${GOAL}"

  # Ask model to select the task name; extract task:name pattern from any prose
  RAW=$(hermes chat -q "${PROMPT}" -m "${MODEL}" --quiet 2>/dev/null \
    | grep -v "^session_id:")
  SELECTED=$(echo "${RAW}" \
    | grep -oE '`[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*`' | head -1 | tr -d '`' \
    || echo "${RAW}" \
    | grep -oE '\b[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*\b' | head -1 \
    || true)

  echo "→ Selected: ${SELECTED}" >&2

  if [[ -z "${SELECTED}" ]]; then
    echo "Model returned empty selection." >&2
    exit 1
  fi

  # Tail hermes log to stderr during execution
  tail -fn 0 ~/.hermes/logs/agent.log >&2 2>/dev/null &
  TAIL_PID=$!
  trap "kill $TAIL_PID 2>/dev/null || true" EXIT

  # Execute the selected task directly
  cd "${REPO}" && task ${SELECTED}
  RC=$?

  kill $TAIL_PID 2>/dev/null || true
  trap - EXIT
  exit $RC
fi

# ── Fallback: OpenClaw (Claude, reliable) ─────────────────────────────
if curl -sf http://localhost:18789/healthz >/dev/null 2>&1; then
  exec openclaw agent \
    --agent task-runner \
    --message "${GOAL}" \
    --json
fi

# ── Both down ─────────────────────────────────────────────────────────
echo "Neither Hermes nor OpenClaw is available." >&2
echo "Discover tasks manually: cd ${REPO} && task --list" >&2
exit 1
