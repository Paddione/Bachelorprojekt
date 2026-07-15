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
#   LM_MODEL         — Model to use (default: qwen3-14b)
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
LM_MODEL="${LM_MODEL:-qwen3-14b}"

# Validate source file exists
[ -f "$SOURCE" ] || { echo "error: source file not found: $SOURCE" >&2; exit 1; }

# Read source content
CONTENT="$(cat "$SOURCE")"

# Read source path relative to repo root (for source:: reference)
# Strip everything up to and including the repo root marker
SRC_PATH="$(echo "$SOURCE" | sed -E 's|.*/Bachelorprojekt/||')"

# Build prompt
PROMPT="Du bist ein technischer Dokumentations-Editor. Transformiere die folgende Quelldatei in eine brain-Wiki-Seite.

## Konventionen (SCHEMA.md)
- Frontmatter: type (${TYPE}), tags (nicht-leere Liste), status: active
- Sprache: Deutsch-Prosa, englische Fachbegriffe
- Wikilinks: [[slug]] Format zu verwandten Seiten (aus der Slug-Liste unten)
- source:: Rückverweis auf die Quelldatei
- Max. 2000 Wörter, keine Volltext-Kopie — destilliere die Kernaussagen
- Behalte die technische Präzision bei, aber formuliere für Wiki-Leser

## Tags
Generiere 2-5 relevante Tags. Grund-Tags für diese Gruppe: ${TAG_DEFAULTS}.
Füge 1-3 inhaltspezifische Tags hinzu (z.B. den Spec-Namen, das Thema).
Antworte NUR mit dem fertigen Markdown — keine Erklärungen, keine Metainfos.

## Verfügbare Slugs (für Wikilinks — verwende 2-5 davon)
${SLUGS_JSON}

## Quelldatei: ${SRC_PATH}
---
${CONTENT}
---

## Aufgabe
Erstelle eine brain-Wiki-Seite mit:
1. Korrektem Frontmatter (type: ${TYPE}, tags: [...], status: active)
2. Transformiertem Inhalt (Deutsch, technisch-präzise, max. 2000 Wörter)
3. 2-5 Wikilinks zu verwandten Seiten aus der Liste oben
4. source:: Rückverweis: Bachelorprojekt ${SRC_PATH}

Gib NUR das fertige Markdown aus:"

# Call LM Studio API
RESPONSE="$(curl -sf --max-time 120 "${LM_URL}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg model "$LM_MODEL" \
    --arg prompt "$PROMPT" \
    '{model: $model, messages: [{role: "user", content: $prompt}], temperature: 0.3, max_tokens: 4096}')" 2>&1)" || {
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
