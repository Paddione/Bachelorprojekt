#!/usr/bin/env bash
# brain-ingest-transform.sh — LLM-assisted transformation of source files
# into brain wiki pages. Calls any OpenAI-compatible chat endpoint: a local
# llama-server from scripts/llm/loadouts.json, or a hosted provider such as
# DeepSeek when LM_API_KEY is set.
#
# Es gibt bewusst KEINE Vorgabe-Adresse mehr. Die frühere Vorgabe zeigte auf
# einen Ingest-Pool (localhost:8093, qwen3.6-14b-a3b-fablevibes), der mit dem
# Loadout-Umbau entfallen ist — samt des hier einmal genannten Startskripts
# start-qwen36-ingest-pool.ps1. Weil das Skript trotzdem startete, meldete es
# 92-mal einzeln "LLM failed" statt einmal zu sagen, dass es kein Ziel hat.
# LM_STUDIO_URL und LM_MODEL sind deshalb Pflicht. [T002533]
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
#   LM_STUDIO_URL    — REQUIRED. OpenAI-compatible base URL, e.g.
#                      http://127.0.0.1:8091 or https://api.deepseek.com
#                      (var name kept for backward compat, it's not LM Studio)
#   LM_MODEL         — REQUIRED. Model id, e.g. deepseek-chat
#   LM_API_KEY       — Optional. Sent as `Authorization: Bearer`. Leer lassen
#                      für lokale llama-server, die keine Auth erwarten.
#   LM_DISABLE_THINKING — Optional (1). Schaltet die Denkphase ab. Pflicht bei
#                      DeepSeek v4: sonst verbraucht das Modell das gesamte
#                      Token-Budget in `reasoning_content` und liefert leeres
#                      `content`. Mehr max_tokens hilft nicht — das Denken
#                      waechst mit. Bei DeepSeek wirkt `thinking.type=disabled`;
#                      `enable_thinking:false` wird dort ignoriert. [T002533]
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

LM_URL="${LM_STUDIO_URL:?LM_STUDIO_URL required (OpenAI-compatible base URL, e.g. https://api.deepseek.com)}"
LM_MODEL="${LM_MODEL:?LM_MODEL required (model id, e.g. deepseek-chat)}"
LM_API_KEY="${LM_API_KEY:-}"
# Gehostete Anbieter antworten spuerbar langsamer als ein lokaler llama-server;
# 90 s reichen dort nicht zuverlaessig fuer 3072 Ausgabe-Tokens.
LM_TIMEOUT="${LM_TIMEOUT:-180}"
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
- Sprachregel: durchgängig deutsche Prosa ODER englische Original-Passagen unverändert belassen — NIEMALS Wort-für-Wort-Mischübersetzung (Denglisch)
- Wikilinks: [[slug]] zu verwandten Seiten (aus Slug-Liste)
- source:: Rückverweis: Bachelorprojekt ${SRC_PATH}
- Max 1500 Wörter, destilliere Kernaussagen
- \`\`\`mermaid-Codeblöcke UNVERÄNDERT (verbatim) übernehmen — nicht in Prosa auflösen
- NUR fertiges Markdown ausgeben

Tags: 2-5 Tags. Grund: ${TAG_DEFAULTS}. Füge 1-3 spezifische hinzu.

Slugs: ${SLUGS_JSON}

Quelle (${SRC_PATH}):
---
${CONTENT}
---

Gib NUR das fertige Markdown aus:"

# Call the OpenAI-compatible chat endpoint, populating $OUTPUT.
#
# Der API-Schluessel geht ueber `curl --config -` (stdin), NICHT als -H-Argument:
# alles in argv ist auf dem Host per `ps` fuer jeden anderen Prozess lesbar. Ohne
# Schluessel bleibt die Konfiguration leer und das Verhalten unveraendert.
call_llm() {
  local prompt="$1" response curl_cfg="" think='{}'
  [ -n "$LM_API_KEY" ] && curl_cfg="$(printf 'header = "Authorization: Bearer %s"' "$LM_API_KEY")"
  [ "${LM_DISABLE_THINKING:-0}" = "1" ] && think='{"thinking":{"type":"disabled"}}'
  response="$(printf '%s\n' "$curl_cfg" | curl -sf --config - --max-time "$LM_TIMEOUT" "${LM_URL}/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg model "$LM_MODEL" \
      --arg prompt "$prompt" \
      --argjson think "$think" \
      '{model: $model, messages: [{role: "user", content: $prompt}], temperature: 0.2, max_tokens: 3072, top_p: 0.9} + $think')" 2>&1)" || {
    echo "error: chat completion request failed (${LM_URL}, model ${LM_MODEL})" >&2
    echo "$response" >&2
    exit 1
  }

  OUTPUT="$(echo "$response" | jq -r '.choices[0].message.content // empty')"
  if [ -z "$OUTPUT" ]; then
    # Leeres content bei gefuelltem reasoning_content ist kein Anbieterfehler,
    # sondern ein Reasoning-Modell, das sein ganzes Budget verdacht hat. Diese
    # Unterscheidung gehoert in die Meldung — ohne sie sieht der Fall aus wie
    # ein toter Endpunkt und man sucht an der falschen Stelle. [T002533]
    local reason_len finish
    reason_len="$(echo "$response" | jq -r '(.choices[0].message.reasoning_content // "") | length' 2>/dev/null || echo 0)"
    finish="$(echo "$response" | jq -r '.choices[0].finish_reason // "?"' 2>/dev/null || echo '?')"
    if [ "${reason_len:-0}" -gt 0 ]; then
      echo "error: leeres content, aber ${reason_len} Zeichen reasoning_content (finish_reason=${finish})." >&2
      echo "       Das Modell hat sein Token-Budget im Denken verbraucht. Setze LM_DISABLE_THINKING=1." >&2
      echo "       Mehr max_tokens hilft nicht — die Denkphase waechst mit." >&2
    else
      echo "error: empty response from ${LM_URL} (model ${LM_MODEL}, finish_reason=${finish})" >&2
      echo "$response" >&2
    fi
    exit 1
  fi

  # Strip markdown code fences if present (LLM sometimes wraps output)
  OUTPUT="$(echo "$OUTPUT" | sed '/^```markdown$/d; /^```$/d')"

  # Validate output has frontmatter
  if ! echo "$OUTPUT" | head -5 | grep -q '^---'; then
    echo "error: output missing frontmatter delimiter" >&2
    echo "$OUTPUT" | head -10 >&2
    exit 1
  fi
}

# Fail-closed validation (D3, T001963): every page must carry a source::
# back-reference and at least one [[wikilink]] in its body.
validate_output() {
  local out="$1"
  if ! echo "$out" | grep -q '^source:: '; then
    echo "validation: missing source:: line" >&2
    return 1
  fi
  local body
  body="$(echo "$out" | awk 'BEGIN{fm=0} /^---[[:space:]]*$/{fm++; next} fm>=2{print}')"
  if ! echo "$body" | grep -q '\[\['; then
    echo "validation: no [[wikilink]] in body" >&2
    return 1
  fi
}

call_llm "$PROMPT"
if ! validate_output "$OUTPUT"; then
  RETRY_HINT="

WICHTIG — dein vorheriger Versuch war ungültig. Pflicht: eine Zeile 'source:: Bachelorprojekt ${SRC_PATH}' UND mindestens ein [[wikilink]] aus der Slug-Liste im Fließtext."
  call_llm "${PROMPT}${RETRY_HINT}"
  if ! validate_output "$OUTPUT"; then
    echo "error: output invalid after retry (source::/wikilink)" >&2
    exit 1
  fi
fi

# Output the transformed content
echo "$OUTPUT"
