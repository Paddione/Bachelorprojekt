#!/usr/bin/env bash
# scripts/factory/scout-llm-fallback.sh — deepseek LLM fallback for file discovery.
#
# Called by scout.sh when deterministic discovery finds < SCOUT_LLM_MIN_FILES files.
# Resolves a DeepSeek provider via route-provider.sh, calls the LLM for likely
# touched files, filters hallucinations (only real files that exist on disk).
# Fail-soft: every error path exits 0 with empty output so deterministic scout
# result remains untainted.
#
# Usage (same subset as scout.sh):
#   bash scripts/factory/scout-llm-fallback.sh \
#     --title "Feature title" --slug "feature-slug" \
#     --description "..." --repo /path/to/repo
#
# Output: one absolute file path per line on stdout, empty on failure/skip.
set -uo pipefail

TITLE=""; SLUG=""; DESCRIPTION=""; REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)       TITLE="${2:-}"; shift 2 ;;
    --slug)        SLUG="${2:-}"; shift 2 ;;
    --description) DESCRIPTION="${2:-}"; shift 2 ;;
    --repo)        REPO="${2:-}"; shift 2 ;;
    *)             shift ;;
  esac
done

if [[ -z "$TITLE" ]]; then exit 0; fi
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Opt-out check
if [[ "${SCOUT_LLM_ENABLED:-}" == "false" ]]; then exit 0; fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTE="$HERE/route-provider.sh"

if [[ ! -x "$ROUTE" ]]; then
  echo "scout-llm-fallback: route-provider.sh not found or not executable, skipping." >&2
  exit 0
fi

# Resolve DeepSeek provider via route-provider (S3: no brand literals).
provider_json="$(bash "$ROUTE" factory-scout cheap 2>/dev/null)" || {
  echo "scout-llm-fallback: route-provider failed, skipping." >&2
  exit 0
}

# Release the claimed provider slot on exit.
release_slot() {
  local prov slot_id
  prov="$(printf '%s' "$provider_json" | jq -r '.provider // empty' 2>/dev/null)"
  slot_id="$(printf '%s' "$provider_json" | jq -r '.slotId // empty' 2>/dev/null)"
  [[ -z "$prov" || -z "$slot_id" ]] && return 0
  # shellcheck source=/dev/null
  source "$HERE/lib.sh" 2>/dev/null && factory_resolve 2>/dev/null
  factory_psql -v prov="$prov" <<'SQL' 2>/dev/null || true
UPDATE tickets.provider_health
SET active_agents = GREATEST(active_agents - 1, 0), updated_at = now()
WHERE provider = :'prov';
SQL
}
trap release_slot EXIT
provider="$(printf '%s' "$provider_json" | jq -r '.provider // empty' 2>/dev/null)"
model="$(printf '%s' "$provider_json" | jq -r '.modelId // empty' 2>/dev/null)"
base_url="$(printf '%s' "$provider_json" | jq -r '.baseUrl // empty' 2>/dev/null)"

if [[ -z "$provider" || -z "$model" ]]; then
  echo "scout-llm-fallback: no provider resolved, skipping." >&2
  exit 0
fi

# Build llm call: prefer direct curl with the provider's base URL and model ID.
# We target OpenAI-compatible /v1/chat/completions (works for deepseek/openai-compat).
API_URL="${base_url%/}/v1/chat/completions"
if [[ -z "$base_url" ]]; then
  echo "scout-llm-fallback: no base_url in provider config, skipping." >&2
  exit 0
fi

# Look up API key from env: use provider-specific key if set, else fallback to a
# generic one. Local providers (localhost/127.0.0.1) skip key check — LM Studio
# etc. accept any value or none.
if [[ "$base_url" != http://127.0.0.1* && "$base_url" != http://localhost* ]]; then
  key_var="$(echo "$provider" | tr '[:lower:]' '[:upper:]')_API_KEY"
  api_key="${!key_var:-${FACTORY_LLM_API_KEY:-}}"
  if [[ -z "$api_key" ]]; then
    echo "scout-llm-fallback: no API key found for provider $provider (${key_var} or FACTORY_LLM_API_KEY unset), skipping." >&2
    exit 0
  fi
fi

# Build prompt: include repo file tree so the LLM can suggest existing paths.
FILE_TREE=$(find "$REPO" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.svelte' -o -name '*.astro' -o -name '*.yaml' -o -name '*.yml' -o -name '*.sh' \) ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/dist/*' 2>/dev/null | sed "s|^$REPO/||" | head -200)
slug_line=""
[[ -n "$SLUG" ]] && slug_line="Feature Slug: $SLUG\n"
prompt="You are a software factory scout. Given a feature ticket, list the likely files (relative paths) that will be touched during implementation. Output ONLY one file path per line, no commentary, no markdown, no code fences. Choose paths that actually exist on disk from the repo file listing below.\n\nRepo file listing:\n$FILE_TREE\n\n---\n\nTitle: $TITLE\n${slug_line}Description: $DESCRIPTION\n\nLikely changed files:"

tmp_req="$(mktemp)"
tmp_resp="$(mktemp)"
trap 'rm -f "$tmp_req" "$tmp_resp"' EXIT

jq -n \
  --arg model "$model" \
  --arg prompt "$prompt" \
  '{model:$model, messages:[{role:"system",content:"You are a precise codebase navigator that outputs only file paths."},{role:"user",content:$prompt}], temperature:0.1, max_tokens:8192, chat_template_kwargs:{enable_thinking:false}}' \
  > "$tmp_req"

curl -sS --max-time 60 \
  -H "Content-Type: application/json" \
  ${api_key:+-H "Authorization: Bearer $api_key"} \
  -d "@$tmp_req" \
  "$API_URL" > "$tmp_resp" 2>/dev/null || {
  echo "scout-llm-fallback: LLM call timed out or failed, skipping." >&2
  exit 0
}

content="$(jq -r '.choices[0].message.content // empty' "$tmp_resp" 2>/dev/null)"
if [[ -z "$content" ]]; then
  echo "scout-llm-fallback: empty LLM response, skipping." >&2
  exit 0
fi

# Parse lines, filter hallucinated paths, emit absolute paths.
seen=()
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  [[ "$line" == '```'* || "$line" == '#'* ]] && continue
  # Allow relative or absolute; resolve to absolute via REPO.
  if [[ "$line" == /* ]]; then
    normalized="$line"
  else
    normalized="$REPO/$line"
  fi
  if [[ -f "$normalized" ]]; then
    seen+=("$normalized")
  fi
done <<< "$content"

if [[ ${#seen[@]} -gt 0 ]]; then
  printf '%s\n' "${seen[@]}"
fi
