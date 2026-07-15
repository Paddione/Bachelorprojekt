#!/usr/bin/env bash
# brain-ingest-transform.sh — LLM-assisted transformation of source files
# into brain wiki pages. Calls local LM Studio API (OpenAI-compatible).
#
# Usage: brain-ingest-transform.sh <source_file> <type> <slug> <slugs_json> <tag_defaults_json>
#
# Args:
#   source_file      — Path to the source markdown file
#   type             — Brain page type (note|moc|entity|decision|runbook)
#   slug             — Target slug for the wiki page
#   slugs_json       — JSON array of all available slugs (for wikilinks)
#   tag_defaults_json — JSON array of default tags for the group
#
# Env:
#   LM_STUDIO_URL    — LM Studio API URL (default: http://localhost:1234)
#   LM_MODEL         — Model to use (default: qwen3.6-14b-a3b-fablevibes)
#   MAX_SOURCE_CHARS — Max source chars to send to LLM (default: 4000)
#
# Output: Transformed markdown with frontmatter to stdout
# Exit: 0 on success, 1 on failure
set -euo pipefail

SOURCE="${1:?source file path required}"
TYPE="${2:?page type required}"
SLUG="${3:?page slug required}"
SLUGS_JSON="${4:?slugs json required}"
TAG_DEFAULTS="${5:?tag defaults json required}"

LM_URL="${LM_STUDIO_URL:-http://localhost:1234}"
LM_MODEL="${LM_MODEL:-qwen3.6-14b-a3b-fablevibes}"
MAX_SOURCE_CHARS="${MAX_SOURCE_CHARS:-4000}"

# Validate source file exists
[ -f "$SOURCE" ] || { echo "error: source file not found: $SOURCE" >&2; exit 1; }

# Read source content (truncated to keep prompt manageable)
CONTENT="$(head -c "$MAX_SOURCE_CHARS" "$SOURCE")"
SRC_LEN="$(wc -c < "$SOURCE")"
if [ "$SRC_LEN" -gt "$MAX_SOURCE_CHARS" ]; then
  CONTENT="${CONTENT}

[...truncated at ${MAX_SOURCE_CHARS} chars of ${SRC_LEN} total...]"
fi

# Read source path relative to repo root
SRC_PATH="$(echo "$SOURCE" | sed -E 's|.*/Bachelorprojekt/||')"

# Compact prompt — less tokens = faster generation
PROMPT="Transformiere diese Quelldatei in eine brain-Wiki-Seite.

Regeln:
- Frontmatter: type: ${TYPE}, tags: [...], status: active
- Deutsch-Prosa, englische Fachbegriffe
- Wikilinks: [[slug]] zu verwandten Seiten (aus Slug-Liste)
- source:: Rückverweis: Bachelorprojekt ${SRC_PATH}
- Max 1500 Wörter, destilliere Kernaussagen
- NUR fertiges Markdown ausgeben

Tags: 2-5 Tags. Grund: ${TAG_DEFAULTS}. Füge 1-3 spezifische hinzu.

Slugs: ${SLUGS_JSON}

Quelle (${SRC_PATH}):
---
${CONTENT}
---

Gib NUR das fertige Markdown aus:"

# Call LM Studio API with optimized settings
RESPONSE="$(curl -sf --max-time 90 "${LM_URL}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg model "$LM_MODEL" \
    --arg prompt "$PROMPT" \
    '{model: $model, messages: [{role: "user", content: $prompt}], temperature: 0.2, max_tokens: 2048, top_p: 0.9}')" 2>&1)" || {
  echo "error: LM Studio API call failed" >&2
  echo "$RESPONSE" >&2
  exit 1
}

# Extract content from response
OUTPUT="$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')"

if [ -z "$OUTPUT" ]; then
  echo "error: empty response from LM Studio" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

# Validate output has frontmatter
if ! echo "$OUTPUT" | head -5 | grep -q '^---'; then
  echo "error: output missing frontmatter delimiter" >&2
  echo "$OUTPUT" | head -10 >&2
  exit 1
fi

# Output the transformed content
echo "$OUTPUT"
