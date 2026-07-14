#!/usr/bin/env bash
# scripts/factory/run-dispatcher.sh — wrapper that unsets CLAUDE_CODE_EFFORT_LEVEL
# before invoking the dispatcher via a fresh `claude -p` session.
# This is the same pattern as wakeup.sh:69 — the env var MUST be unset for
# Workflow subagents to work with DeepSeek. [T000519]
set -euo pipefail
unset CLAUDE_CODE_EFFORT_LEVEL
REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
cd "${REPO}"
TIMESTAMP="${1:-$(date -u +%FT%TZ)}"
DRY_RUN="${2:-false}"
PROMPT="Run the Software Factory dispatcher now. Invoke the Workflow tool with \
scriptPath 'scripts/factory/dispatcher.js' and args { timestamp: '${TIMESTAMP}', dry_run: ${DRY_RUN} }. \
The dispatcher reads all guards (kill-switch, daily-cap, dry-run-first) fresh per brand inside its PREP step. \
Report only the dispatcher's final JSON result. Do not improvise scheduling. \
Do NOT call the Skill tool — there is no 'factory-dispatch' skill or any skill that runs the dispatcher; \
the ONLY correct way to run it is the Workflow tool call described above. \
If a tool call fails, do not retry the identical call — stop and report the error verbatim instead of looping."
exec claude -p "${PROMPT}" \
  --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),ToolSearch,PushNotification" \
  --dangerously-skip-permissions
