#!/usr/bin/env bash
# tracing-status.sh — Langfuse-Tracing-Status am Sessionstart [T900750]
# Zweck: meldet fehlende Harness-Configs, Finetune-Schwelle (D5) und Exportluecken (D6).
# Aufruf: bash scripts/langfuse/tracing-status.sh check [--hook] | refresh
# Exit-Codes: check immer 0 (blockiert den Sessionstart nie), refresh 0 ok / 1 API-Fehler / 2 Konfig fehlt.
# [T900750]
set -euo pipefail

ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/langfuse/tracing-status.json"
HOOK_LOG="$HOME/.claude/state/langfuse_hook.log"
HOOK_STATE="$HOME/.claude/state/langfuse_state.json"
RUNBOOK="docs/runbooks/qwen35-mtp-subagent-finetuning.md"
THRESHOLD="${LANGFUSE_FINETUNE_THRESHOLD:-3000}"

cmd_check() {
  local hook=0 arg
  for arg in "$@"; do
    case "$arg" in
      --hook) hook=1 ;;
      *) echo "Usage: $0 check [--hook]" >&2; exit 2 ;;
    esac
  done

  local -a msgs=()
  local h
  for h in claude opencode pi codex; do
    command -v "$h" >/dev/null 2>&1 || continue
    case "$h" in
      claude)
        if [ ! -f "$HOME/.claude/settings.json" ] || ! jq -e '.enabledPlugins["langfuse-observability@langfuse-observability"] == true' "$HOME/.claude/settings.json" >/dev/null 2>&1; then
          msgs+=("Langfuse: $h tracet nicht (Config fehlt) — task devmesh:langfuse:setup")
        fi
        ;;
      opencode)
        [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode-langfuse.json" ] || msgs+=("Langfuse: $h tracet nicht (Config fehlt) — task devmesh:langfuse:setup")
        ;;
      pi)
        [ -f "$HOME/.pi/agent/langfuse.json" ] || msgs+=("Langfuse: $h tracet nicht (Config fehlt) — task devmesh:langfuse:setup")
        ;;
      codex)
        [ -f "$HOME/.codex/langfuse.json" ] || msgs+=("Langfuse: $h tracet nicht (Config fehlt) — task devmesh:langfuse:setup")
        ;;
    esac
  done
  [ -f "$ENV_FILE" ] || msgs+=("Langfuse: Credentials fehlen — task devmesh:langfuse:setup")

  if [ -f "$CACHE" ]; then
    tool_traces=$(jq -r '.tool_traces // 0' "$CACHE" 2>/dev/null || echo 0)
    gap=$(jq -r '.export_gap_session // empty' "$CACHE" 2>/dev/null || true)
    if [ "${tool_traces:-0}" -ge "$THRESHOLD" ] 2>/dev/null; then
      msgs+=("Finetune-Schwelle erreicht ($tool_traces Tool-Traces ≥ $THRESHOLD): $RUNBOOK durchgehen.")
    fi
    if [ -n "${gap:-}" ]; then
      msgs+=("Langfuse: Claude-Turns nicht angekommen (Session $gap) — task devmesh:langfuse:backfill SESSION=$gap")
    fi
  fi

  if { [ ! -f "$CACHE" ] || [ $(( $(date +%s) - $(stat -c %Y "$CACHE") )) -gt 86400 ]; } && [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC2317
    nohup bash "${BASH_SOURCE[0]}" refresh >/dev/null 2>&1 &
  fi

  if [ "$hook" -eq 1 ]; then
    if [ "${#msgs[@]}" -gt 0 ]; then
      joined=$(printf '%s | ' "${msgs[@]}"); joined=${joined% | }
      jq -n --arg c "$joined" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$c}}'
    fi
  else
    if [ "${#msgs[@]}" -gt 0 ]; then
      printf '%s\n' "${msgs[@]}"
    fi
  fi
  exit 0
}

cmd_refresh() {
  [ $# -eq 0 ] || { echo "Usage: $0 refresh" >&2; exit 2; }
  [ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found" >&2; exit 2; }
  # shellcheck disable=SC1090
  . "$ENV_FILE"

  local q tool_traces last_claude gap_session=""
  q=$(jq -cn --arg to "$(date -u +%FT%TZ)" '{view:"observations",dimensions:[],
    metrics:[{measure:"traceId",aggregation:"uniq"}],
    filters:[{column:"type",operator:"=",value:"TOOL",type:"string"}],
    fromTimestamp:"2026-09-01T00:00:00Z",toTimestamp:$to}')
  if ! tool_traces=$(curl -fsS -m 30 -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" -G "$LANGFUSE_BASE_URL/api/public/v2/metrics" \
      --data-urlencode "query=$q" | jq -r '.data[0].uniq_traceId // 0'); then
    echo "Error: Langfuse metrics API failed, cache unchanged" >&2; exit 1
  fi
  if ! last_claude=$(curl -fsS -m 30 -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" -G "$LANGFUSE_BASE_URL/api/public/v2/observations" \
      --data-urlencode 'limit=1' --data-urlencode 'fields=core' \
      --data-urlencode 'fromStartTime=2026-09-01T00:00:00Z' \
      --data-urlencode 'filter=[{"type":"string","column":"traceName","operator":"=","value":"Claude Code Turn"}]' \
      | jq -r '.data[0].startTime // empty'); then
    echo "Error: Langfuse observations API failed, cache unchanged" >&2; exit 1
  fi

  if [ -f "$HOOK_LOG" ]; then
    last_line=$(grep -E 'Processed [1-9][0-9]* turns' "$HOOK_LOG" 2>/dev/null | tail -1 || true)
    if [ -n "${last_line:-}" ]; then
      hook_ts=$(awk '{print $1" "$2}' <<<"$last_line")
      hook_epoch=$(date -d "$hook_ts" +%s 2>/dev/null || echo "")
      sess=$(sed -n 's/.*session=\([0-9a-f-]\{36\}\).*/\1/p' <<<"$last_line")
      if [ -n "${hook_epoch:-}" ] && [ -n "${sess:-}" ]; then
        if [ -z "${last_claude:-}" ]; then
          gap_session="$sess"
        else
          claude_epoch=$(date -d "$last_claude" +%s 2>/dev/null || echo "")
          if [ -z "${claude_epoch:-}" ] || [ "$hook_epoch" -gt $(( claude_epoch + 1800 )) ]; then
            gap_session="$sess"
          fi
        fi
      fi
    fi
  fi

  mkdir -p "$(dirname "$CACHE")"
  tmp=$(mktemp)
  jq -n --arg rt "$(date -u +%FT%TZ)" --argjson tt "${tool_traces:-0}" --arg lc "${last_claude:-}" --arg gap "$gap_session" \
    '{refreshed_at:$rt,tool_traces:$tt,last_claude_trace:(if $lc == "" then null else $lc end),export_gap_session:(if $gap == "" then null else $gap end)}' > "$tmp"
  mv "$tmp" "$CACHE"

  last_out=${last_claude:-none}; [ -n "$last_out" ] || last_out=none
  gap_out=${gap_session:-none}; [ -n "$gap_out" ] || gap_out=none
  echo "tool_traces=${tool_traces:-0} last_claude_trace=$last_out export_gap_session=$gap_out"
  exit 0
}

case "${1:-}" in
  check) shift; cmd_check "$@" ;;
  refresh) shift; cmd_refresh "$@" ;;
  *) echo "Usage: $0 check [--hook] | refresh" >&2; exit 2 ;;
esac
