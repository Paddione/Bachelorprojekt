#!/usr/bin/env bash
# scripts/factory/usage-report.sh — Cross-Tool-CLI Token/Kosten-Überblick.
# Liest Claude-Code + OpenClaw Usage-JSONL, aggregiert pro Tag/Modell/Tool.
# Read-only. --json für maschinenlesbar, --otel für OTLP-Gauges.
# Defaults: ~/.claude/usage*.jsonl, ~/.openclaw/usage*.jsonl (überschreibbar via Env).
set -uo pipefail

CLAUDE_USAGE_DIR="${CLAUDE_USAGE_DIR:-$HOME/.claude}"
OPENCLAW_USAGE_DIR="${OPENCLAW_USAGE_DIR:-$HOME/.openclaw}"

MODE="text"
OTEL=false
for arg in "$@"; do
  case "$arg" in
    --json) MODE="json" ;;
    --otel) OTEL=true ;;
  esac
done

declare -A tokens_in tokens_out cost_usd
declare -A model_set tool_set

aggregate_dir() {
  local dir="$1" tool_name="$2"
  [[ ! -d "$dir" ]] && return 0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local ts model tin tout cost
    ts=$(echo "$line" | jq -r '(.timestamp // .created_at // .ts // "")[:10]' 2>/dev/null)
    [[ -z "$ts" || "$ts" == "null" ]] && continue
    model=$(echo "$line" | jq -r '(.model // .model_id // "")' 2>/dev/null)
    [[ -z "$model" || "$model" == "null" ]] && model="unknown"
    tin=$(echo "$line" | jq -r '(.tokens_in // .input_tokens // .prompt_tokens // 0)' 2>/dev/null)
    tout=$(echo "$line" | jq -r '(.tokens_out // .output_tokens // .completion_tokens // 0)' 2>/dev/null)
    cost=$(echo "$line" | jq -r '(.cost_usd // .cost // 0)' 2>/dev/null)
    [[ "$tin" == "null" ]] && tin=0
    [[ "$tout" == "null" ]] && tout=0
    [[ "$cost" == "null" ]] && cost=0
    local key="${ts}|${model}|${tool_name}"
    tokens_in["$key"]=$(( ${tokens_in["$key"]:-0} + tin ))
    tokens_out["$key"]=$(( ${tokens_out["$key"]:-0} + tout ))
    cost_usd["$key"]=$(awk "BEGIN { printf \"%.6f\", ${cost_usd["$key"]:-0} + $cost }")
    model_set["$model"]=1
    tool_set["$tool_name"]=1
  done < <(find "$dir" -name 'usage*.jsonl' -type f -exec cat {} + 2>/dev/null)
}

aggregate_dir "$CLAUDE_USAGE_DIR" "claude-code"
aggregate_dir "$OPENCLAW_USAGE_DIR" "openclaw"

if [[ "$MODE" == "json" ]]; then
  echo "["
  first=true
  for key in "${!tokens_in[@]}"; do
    $first || echo ","
    first=false
    IFS='|' read -r ts model tool <<< "$key"
    printf '  {"date":"%s","model":"%s","tool":"%s","tokens_in":%s,"tokens_out":%s,"cost_usd":%s}' \
      "$ts" "$model" "$tool" "${tokens_in[$key]}" "${tokens_out[$key]}" "${cost_usd[$key]}"
  done
  echo ""
  echo "]"
else
  printf "%-14s %-14s %-12s %10s %10s %12s\n" "DATE" "MODEL" "TOOL" "TOKENS_IN" "TOKENS_OUT" "COST_USD"
  printf "%s\n" "----------------------------------------------------------------------------"
  for key in "${!tokens_in[@]}"; do
    IFS='|' read -r ts model tool <<< "$key"
    printf "%-14s %-14s %-12s %10d %10d %12.6f\n" \
      "$ts" "$model" "$tool" "${tokens_in[$key]}" "${tokens_out[$key]}" "${cost_usd[$key]}"
  done
fi

if $OTEL && [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for key in "${!tokens_in[@]}"; do
    IFS='|' read -r ts model tool <<< "$key"
    bash "${script_dir}/otel-emit.sh" gauge tokscale.tokens.daily "${tokens_in[$key]}" \
      "date=$ts,model=$model,tool=$tool,direction=in" 2>/dev/null || true
    bash "${script_dir}/otel-emit.sh" gauge tokscale.tokens.daily "${tokens_out[$key]}" \
      "date=$ts,model=$model,tool=$tool,direction=out" 2>/dev/null || true
    bash "${script_dir}/otel-emit.sh" gauge tokscale.cost.daily.usd "${cost_usd[$key]}" \
      "date=$ts,model=$model,tool=$tool" 2>/dev/null || true
  done
fi
