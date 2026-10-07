#!/usr/bin/env bash
# backfill-claude.sh — verlorene Claude-Code-Turns erneut an Langfuse senden [T900750]
# Zweck: loescht den State-Eintrag einer Session und ruft den Plugin-Hook mit dem
# Transcript erneut auf (Trace-IDs sind deterministisch, Doppellauf überschreibt).
# Aufruf: bash scripts/langfuse/backfill-claude.sh <session-id>
# Exit-Codes: 0 ok, 2 Usage/fehlender Transcript/Hook/State.
# [T900750]
set -euo pipefail

ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env"
HOOK_LOG="$HOME/.claude/state/langfuse_hook.log"
HOOK_STATE="$HOME/.claude/state/langfuse_state.json"

[ $# -eq 1 ] || { echo "Usage: $0 <session-id>" >&2; exit 2; }
id="$1"
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || { echo "Usage: $0 <session-id>" >&2; exit 2; }

transcript=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$id.jsonl" 2>/dev/null | head -1 || true)
[ -n "${transcript:-}" ] || { echo "transcript für $id nicht gefunden" >&2; exit 2; }

hook=$(ls -d "$HOME"/.claude/plugins/cache/langfuse-observability/langfuse-observability/*/hooks/langfuse_hook.py 2>/dev/null | sort -V | tail -1 || true)
[ -n "${hook:-}" ] || { echo "Error: Plugin-Hook langfuse_hook.py nicht gefunden" >&2; exit 2; }

key=$(printf '%s' "$id::$transcript" | sha256sum | cut -d' ' -f1)
if ! jq -e --arg k "$key" 'has($k)' "$HOOK_STATE" >/dev/null 2>&1; then
  echo "kein Plugin-State für $id (Plugin-Format geändert?)" >&2
  exit 2
fi
tmp=$(mktemp)
jq --arg k "$key" 'del(.[$k])' "$HOOK_STATE" > "$tmp" && mv "$tmp" "$HOOK_STATE"

[ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found" >&2; exit 2; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

jq -cn --arg s "$id" --arg t "$transcript" '{session_id:$s,transcript_path:$t,hook_event_name:"SessionEnd"}' \
  | if command -v uv >/dev/null 2>&1; then uv run --quiet --script "$hook"; else python3 "$hook"; fi

grep "session=$id" "$HOOK_LOG" 2>/dev/null | tail -1 || true
exit 0
