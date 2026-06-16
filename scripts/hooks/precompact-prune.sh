#!/usr/bin/env bash
# scripts/hooks/precompact-prune.sh — Claude Code PreCompact hook: prune obsolete
# tool_result blocks before /compact to reduce context-bloat.
#
# Opt-in: add to .claude/settings.json (gitignored, per-machine):
#   { "hooks": { "PreCompact": [{ "command": "bash scripts/hooks/precompact-prune.sh" }] } }
# Env: PRUNE_MIN_AGE_TURNS (default 3), OTEL_EXPORTER_OTLP_ENDPOINT (opt telemetry)
#
# Fail-open: no transcript path, unparseable JSONL, missing tools → exit 0, original untouched.
# Idempotent: [pruned: …] markers are never re-pruned.
set -uo pipefail

PRUNE_MIN_AGE="${PRUNE_MIN_AGE_TURNS:-3}"

transcript_path="$(jq -r '.transcript_path // empty' 2>/dev/null)" || exit 0
[[ -z "$transcript_path" || ! -f "$transcript_path" ]] && exit 0

tmp_out="$(mktemp)"
trap 'rm -f "$tmp_out"' EXIT

total_pruned=0
line_num=0
declare -a turns=()
declare -A refs=()

while IFS= read -r line || [[ -n "$line" ]]; do
  turns+=("$line")
done < "$transcript_path"

n_turns="${#turns[@]}"

for (( i = 0; i < n_turns; i++ )); do
  if echo "${turns[$i]}" | jq -e '.type == "assistant" and .content != null' >/dev/null 2>&1; then
    while IFS= read -r block; do
      [[ -z "$block" ]] && continue
      refs["$(echo "$block" | jq -r '.tool_use_id // empty')"]=1
    done < <(echo "${turns[$i]}" | jq -c '.content[]? | select(.type == "tool_use" or .type == "reasoning")' 2>/dev/null)
  fi
done

has_refs=false
if [[ "${#refs[@]}" -gt 0 ]]; then
  has_refs=true
fi

for (( i = 0; i < n_turns; i++ )); do
  line="${turns[$i]}"
  if echo "$line" | jq -e '.type == "tool_result" and (.content | type == "string")' >/dev/null 2>&1; then
    tool_use_id=$(echo "$line" | jq -r '.tool_use_id // empty' 2>/dev/null)
    origin_tool=$(echo "$line" | jq -r '.metadata.original_tool // empty' 2>/dev/null)
    [[ -z "$origin_tool" ]] && origin_tool="$tool_use_id"
    is_readonly=false
    if echo "$origin_tool" | grep -qiE '^(Bash|Read|Grep|Glob|ls)$' 2>/dev/null; then
      is_readonly=true
    fi

    already_pruned=false
    if echo "$line" | jq -e '.content | startswith("[pruned:")' >/dev/null 2>&1; then
      already_pruned=true
    fi

    is_recent=false
    turn_distance=$((n_turns - i))
    [[ "$turn_distance" -le "$PRUNE_MIN_AGE" ]] && is_recent=true

    is_referenced=false
    if $has_refs; then
      [[ -n "$tool_use_id" && -n "${refs[$tool_use_id]:-}" ]] && is_referenced=true
      [[ -n "${refs[$origin_tool]:-}" ]] && is_referenced=true
    fi

    if ! $already_pruned && $is_readonly && ! $is_recent && ! $is_referenced; then
      orig_len=$(echo "$line" | jq '.content | length' 2>/dev/null || echo 0)
      marker="[pruned: ${origin_tool} output, ${orig_len} chars, see turn ${i}]"
      turns[$i]=$(echo "$line" | jq --arg m "$marker" '.content = $m' 2>/dev/null || echo "$line")
      total_pruned=$((total_pruned + orig_len))
    fi
  fi
done

printf '%s\n' "${turns[@]}" | jq -c . > "$tmp_out" 2>/dev/null
if [[ $? -eq 0 ]] && [[ -s "$tmp_out" ]]; then
  output_count=$(jq -c . < "$tmp_out" | wc -l)
  input_count=$(jq -c . < "$transcript_path" | wc -l)
  if [[ "$output_count" -eq "$input_count" ]]; then
    cp "$tmp_out" "$transcript_path"
  fi
fi

if [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" && "$total_pruned" -gt 0 ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "${script_dir}/../factory/otel-emit.sh" metric factory.context.pruned_chars "$total_pruned" 2>/dev/null || true
fi

exit 0
