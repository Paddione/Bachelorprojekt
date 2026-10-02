#!/bin/bash
# backfill-claude.sh — Session End Hook Execution
# Purpose: Execute Langfuse SessionEnd hook for a Claude transcript.
# Usage: bash scripts/langfuse/backfill-claude.sh <session-id>
# Exit codes: 0=success, 1=API error, 2=usage/missing args
# [T900750]

set -euo pipefail

ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
HOOK_LOG="$HOME/.claude/state/langfuse_hook.log"
HOOK_STATE="$HOME/.claude/state/langfuse_state.json"

main() {
    local session_id="$1"
    if [ -z "$session_id" ] || ! [[ "$session_id" =~ ^[0-9a-f-]{36}$ ]]; then
        echo "Usage: $0 <session-id>" >&2
        exit 2
    fi

    local transcript
    transcript=$(find "$HOME/.claude/projects" -maxdepth 2 -name "${session_id}.jsonl" | head -1)
    if [ -z "$transcript" ]; then
        echo "transcript für $session_id nicht gefunden"
        exit 2
    fi

    local hook_path
    hook_path=$(ls -d "$HOME/.claude/plugins/cache/langfuse-observability/langfuse-observability/*/hooks/langfuse_hook.py" 2>/dev/null | sort -V | tail -1)
    if [ -z "$hook_path" ]; then
        exit 2
    fi

    local state_key
    state_key=$(printf '%s' "${session_id}:${transcript}" | sha256sum | cut -d' ' -f1)
    if ! jq -e --arg k "$state_key" 'has($k)' "$HOOK_STATE" >/dev/null 2>&1; then
        echo "kein Plugin-State für $session_id (Plugin-Format geändert?)"
        exit 2
    fi

    local new_state
    new_state=$(jq -e --arg k "$state_key" 'del(.[$k])' "$HOOK_STATE" 2>/dev/null)
    if [ "$new_state" != "$HOOK_STATE" ]; then
        echo "$new_state" > "$HOOK_STATE"
    fi

    local hook_log_line
    hook_log_line=$(jq -cn --arg s "$session_id" --arg t "$transcript" '{session_id:$s,transcript_path:$t,hook_event_name:"SessionEnd"}' \
        | if command -v uv >/dev/null 2>&1; then uv run --quiet --script "$hook_path"; else python3 "$hook_path"; fi)

    echo "$hook_log_line"
    exit 0
}

main "$@"
