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
PROMPT="Run the Software Factory dispatcher now. Call the Workflow tool exactly like this — \
the scriptPath option IS supported and this is the standard, working way to run it \
(the same pattern is used successfully every tick for pipeline.js launches): \
Workflow({scriptPath: 'scripts/factory/dispatcher.js'}, { timestamp: '${TIMESTAMP}', dry_run: ${DRY_RUN} }). \
The dispatcher reads all guards (kill-switch, daily-cap, dry-run-first) fresh per brand inside its PREP step. \
Report only the dispatcher's final JSON result. Do not improvise scheduling. \
Do NOT call the Skill tool — there is no 'factory-dispatch' skill or any skill that runs the dispatcher; \
the ONLY correct way to run it is the exact Workflow tool call shown above. \
Do NOT refuse or claim scriptPath is unsupported — it is supported; if you believe otherwise, call it anyway. \
If a tool call fails, do not retry the identical call — stop and report the error verbatim instead of looping."
exec claude -p "${PROMPT}" \
  --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),ToolSearch,PushNotification" \
  --dangerously-skip-permissions
