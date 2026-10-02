#!/bin/bash
# tracing-status.sh — Langfuse Tracing Status Checks
# Purpose: Check harness configuration, tool traces, export gaps and refresh cache.
# Usage: bash scripts/langfuse/tracing-status.sh check [--hook] | refresh
# Exit codes: 0=success, 1=API error, 2=usage/missing args
# [T900750]

set -euo pipefail

ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/langfuse/tracing-status.json"
HOOK_LOG="$HOME/.claude/state/langfuse_hook.log"
HOOK_STATE="$HOME/.claude/state/langfuse_state.json"
RUNBOOK="docs/runbooks/qwen35-mtp-subagent-finetuning.md"
THRESHOLD="${LANGFUSE_FINETUNE_THRESHOLD:-3000}"

check_harness_claude() {
    local h="$1"
    command -v "$h" >/dev/null 2>&1 || return 1
    local cfg="$HOME/.claude/settings.json"
    [ -f "$cfg" ] || return 1
    local enabled=$(jq -e '.enabledPlugins["langfuse-observability@langfuse-observability"] == true' "$cfg" 2>/dev/null)
    [ "$enabled" = "true" ] || return 1
}

check_harness_opencode() {
    local h="$1"
    command -v "$h" >/dev/null 2>&1 || return 1
    local cfg="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode-langfuse.json"
    [ -f "$cfg" ] || return 1
}

check_harness_pi() {
    local h="$1"
    command -v "$h" >/dev/null 2>&1 || return 1
    local cfg="$HOME/.pi/agent/langfuse.json"
    [ -f "$cfg" ] || return 1
}

check_harness_codex() {
    local h="$1"
    command -v "$h" >/dev/null 2>&1 || return 1
    local cfg="$HOME/.codex/langfuse.json"
    [ -f "$cfg" ] || return 1
}

check_harness() {
    local msgs=()
    check_harness_claude "claude" && msgs+=("Langfuse: claude tracet aktiv")
    check_harness_opencode "opencode" && msgs+=("Langfuse: opencode tracet aktiv")
    check_harness_pi "pi" && msgs+=("Langfuse: pi tracet aktiv")
    check_harness_codex "codex" && msgs+=("Langfuse: codex tracet aktiv")
    [ ${#msgs[@]} -eq 0 ] && msgs+=("Langfuse: keine Harness tracet (Config fehlt) — task devmesh:langfuse:setup")
    printf '%s\n' "${msgs[@]}"
}

cmd_check() {
    local hook_flag=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --hook) hook_flag=1 ;;
            *) echo "Usage: $0 check [--hook]" >&2; exit 2 ;;
        esac
        shift
    done

    local msgs; msgs=$(check_harness)

    if [ ! -f "$ENV_FILE" ]; then
        echo "Langfuse: Credentials fehlen — task devmesh:langfuse:setup" >&2
    fi

    [ -f "$CACHE" ] && jq -e '.refreshed_at' "$CACHE" >/dev/null 2>&1 || true

    if [ -n "$HOOK_LOG" ] && [ -s "$HOOK_LOG" ]; then
        local last_gap
        last_gap=$(grep -m1 'Processed [1-9][0-9]* turns' "$HOOK_LOG" 2>/dev/null || true)
        if [ -n "$last_gap" ]; then
            local gap_time
            gap_time=$(echo "$last_gap" | sed -n 's/.*Processed [0-9]* turns in .*\(session=<[^>]*>\).*/\1/p' | sed -n 's/session=\([^ ]*\).*/\1/p')
            if [ -n "$gap_time" ]; then
                local session_id
                session_id=$(echo "$last_gap" | grep -oP 'session=\K[^ ]+' | head -1)
                if [ -n "$session_id" ]; then
                    echo "Langfuse: Export-Trace-Session nicht gefunden (Session $session_id) — task devmesh:langfuse:backfill SESSION=$session_id"
                fi
            fi
        fi
    fi

    if [ -n "$HOOK_LOG" ] && [ -s "$HOOK_LOG" ]; then
        local last_export
        last_export=$(grep -m1 'Processed [1-9][0-9]* turns' "$HOOK_LOG" 2>/dev/null || true)
        if [ -n "$last_export" ]; then
            local export_time
            export_time=$(date -d "$(echo "$last_export" | sed 's/ .*//')" +%s 2>/dev/null || true)
            if [ -n "$export_time" ]; then
                local last_claude_time
                last_claude_time=$(jq -r '.data[0].startTime // empty' "$CACHE" 2>/dev/null || true)
                if [ -n "$last_claude_time" ]; then
                    local gap_seconds=$(( (export_time - last_claude_time) / 60 ))
                    if [ "$gap_seconds" -gt 30 ]; then
                        echo "Langfuse: Export-Trace-Session nicht gefunden (Gap > 30 Min) — task devmesh:langfuse:backfill"
                    fi
                fi
            fi
        fi
    fi

    if [ $hook_flag -eq 1 ] && [ ${#msgs[@]} -gt 0 ]; then
        local hook_json='{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"'${msgs[*]}'"}}'
        echo "$hook_json" | jq -c '.'
    fi

    exit 0
}

cmd_refresh() {
    [ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found" >&2; exit 2; }

    source "$ENV_FILE"

    local tool_traces
    tool_traces=$(curl -fsS -m 30 -u "${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}" \
        -G "${LANGFUSE_BASE_URL}/api/public/v2/metrics" \
        --data-urlencode "query=$(jq -cn --arg to \"$(date -u +%FT%TZ)\" '{view:'observations',dimensions:[],metrics:[{measure:'traceId',aggregation:'uniq'}],filters:[{column:'type',operator:'=',value:'TOOL',type:'string'}],fromTimestamp:'2026-09-01T00:00:00Z',toTimestamp:$to}')" \
        | jq -r '.data[0].uniq_traceId // 0' 2>/dev/null || echo "0")

    local last_claude_trace
    last_claude_trace=$(curl -fsS -m 30 -u "${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}" \
        -G "${LANGFUSE_BASE_URL}/api/public/v2/observations" \
        --data-urlencode "limit=1" \
        --data-urlencode "fields=core" \
        --data-urlencode "fromStartTime=2026-09-01T00:00:00Z" \
        --data-urlencode "filter=[{\"type\":\"string\",\"column\":\"traceName\",\"operator\":\"=\",\"value\":\"Claude Code Turn\"}]" \
        | jq -r '.data[0].startTime // empty' 2>/dev/null || true)

    local export_gap_session="null"
    if [ -n "$HOOK_LOG" ] && [ -s "$HOOK_LOG" ]; then
        local last_export
        last_export=$(grep -m1 'Processed [1-9][0-9]* turns' "$HOOK_LOG" 2>/dev/null || true)
        if [ -n "$last_export" ]; then
            local export_time
            export_time=$(date -d "$(echo "$last_export" | sed 's/ .*//')" +%s 2>/dev/null || true)
            if [ -n "$export_time" ]; then
                if [ -n "$last_claude_time" ]; then
                    local gap_seconds=$(( (export_time - last_claude_time) / 60 ))
                    if [ "$gap_seconds" -gt 30 ]; then
                        export_gap_session='"$(echo "$last_export" | grep -oP 'session=\K[^ ]+' | head -1)"'
                    fi
                fi
            fi
        fi
    fi

    if [ -n "$last_claude_time" ]; then
        last_claude_trace="\"$last_claude_time\""
    fi

    local cache_dir
    cache_dir=$(dirname "$CACHE")
    mkdir -p "$cache_dir"

    local tmp_cache
    tmp_cache=$(mktemp)

    jq -n --arg t "$tool_traces" --arg l "$last_claude_trace" --arg e "$export_gap_session" \
        '{refreshed_at:now(),tool_traces:$t,last_claude_trace:$l,export_gap_session:$e}' > "$tmp_cache"

    mv "$tmp_cache" "$CACHE"

    echo "tool_traces=$tool_traces last_claude_trace=$last_claude_trace export_gap_session=$export_gap_session"

    exit 0
}

main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        check)
            cmd_check "$@"
            ;;
        refresh)
            cmd_refresh "$@"
            ;;
        *)
            echo "Usage: $0 check [--hook] | refresh" >&2
            exit 2
            ;;
    esac
}

main "$@"
