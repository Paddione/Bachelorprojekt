#!/usr/bin/env bash
# brain-verify-claims.sh — LLM-Widerspruchs-Spotcheck Seite vs. Quelle (T900403).
#
# Report-only: Exit ist immer 0 (außer Bedienfehler/LLM-Ausfall → 2).
# Chunket die Quelle neu, ordnet jedem Chunk über den State seine Wiki-Seite
# zu und fragt das lokale LLM, ob die Zusammenfassung der Quelle
# widerspricht oder unbelegte Tatsachenbehauptungen enthält. Stil, Kürzung
# und Umformulierung sind ausdrücklich KEINE Befunde.
#
# Usage: brain-verify-claims.sh --source <relpath> --wiki-dir <dir>
#          [--root <dir>] [--state <file>] [--max-pairs N]
# --max-pairs begrenzt die LLM-Aufrufe (Default 10, 0 = unbegrenzt).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$HERE/.." && pwd)"
CHUNK_SCRIPT="$HERE/brain-chunk.sh"

SRC=""
WIKI_DIR=""
ROOT="$DEFAULT_ROOT"
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
MAX_PAIRS=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)   SRC="${2:?--source requires a path}"; shift ;;
    --wiki-dir) WIKI_DIR="${2:?--wiki-dir requires a path}"; shift ;;
    --root)     ROOT="${2:?--root requires a path}"; shift ;;
    --state)    STATE_FILE="${2:?--state requires a path}"; shift ;;
    --max-pairs) MAX_PAIRS="${2:?--max-pairs requires a number}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$SRC" ] || { echo "error: --source required" >&2; exit 2; }
[ -n "$WIKI_DIR" ] || { echo "error: --wiki-dir required" >&2; exit 2; }
[ -f "$ROOT/$SRC" ] || { echo "error: source not found: $ROOT/$SRC" >&2; exit 2; }
[ -d "$WIKI_DIR" ] || { echo "error: wiki dir not found: $WIKI_DIR" >&2; exit 2; }
[ -f "$STATE_FILE" ] || { echo "error: state file not found: $STATE_FILE" >&2; exit 2; }
case "$MAX_PAIRS" in ''|*[!0-9]*) echo "error: --max-pairs must be a number" >&2; exit 2 ;; esac

LM_URL="${LM_STUDIO_URL:-http://127.0.0.1:1919}"
LM_MODEL="${LM_MODEL:-Muse-Glimmer-30B}"
LM_TIMEOUT="${LM_TIMEOUT:-180}"
LM_MAX_TOKENS="${LM_MAX_TOKENS:-1024}"
LM_API_KEY="${LM_API_KEY:-}"

if ! curl -sf -m 10 "$LM_URL/health" >/dev/null 2>&1; then
  echo "error: LLM endpoint unreachable ($LM_URL) — cannot verify, refusing to report clean" >&2
  exit 2
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

SLUG_BASE="$(echo "${SRC%.*}" | tr '/_ ' '---' | tr '[:upper:]' '[:lower:]')"
MANIFEST_TSV="$TMPDIR/manifest.tsv"
bash "$CHUNK_SCRIPT" --source "$ROOT/$SRC" --slug "$SLUG_BASE" \
  --out-dir "$TMPDIR/chunks" > "$MANIFEST_TSV" 2>/dev/null \
  || { echo "error: chunker failed for $SRC" >&2; exit 2; }

page_body() {
  awk '/^---$/{n++; if (n==2) {body=1; next}} body' "$1"
}

call_llm() {
  local prompt="$1" response curl_cfg="" think='{}' out reason_len finish
  [ -n "$LM_API_KEY" ] && curl_cfg="$(printf 'header = "Authorization: Bearer %s"' "$LM_API_KEY")"
  [ "${LM_DISABLE_THINKING:-1}" = "1" ] && think='{"thinking":{"type":"disabled"},"chat_template_kwargs":{"enable_thinking":false,"reasoning_strength":"low"}}'
  response="$(jq -n --rawfile prompt /dev/fd/4 \
      --arg model "$LM_MODEL" \
      --argjson max_tokens "$LM_MAX_TOKENS" \
      --argjson think "$think" \
      '{model: $model, messages: [{role: "user", content: $prompt}], temperature: 0, max_tokens: $max_tokens, top_p: 1.0} + $think' \
      4<<<"$prompt" \
    | curl -s -S --config /dev/fd/3 --max-time "$LM_TIMEOUT" "$LM_URL/v1/chat/completions" \
        -H "Content-Type: application/json" --data-binary @- 3<<<"$curl_cfg" 2>&1)" || {
    echo "error: chat completion request failed ($LM_URL, model $LM_MODEL)" >&2
    echo "$response" >&2
    return 1
  }
  out="$(echo "$response" | jq -r '.choices[0].message.content // empty')"
  if [ -z "$out" ]; then
    reason_len="$(echo "$response" | jq -r '(.choices[0].message.reasoning_content // "") | length' 2>/dev/null || echo 0)"
    finish="$(echo "$response" | jq -r '.choices[0].finish_reason // "?"' 2>/dev/null || echo '?')"
    echo "error: empty LLM content (finish_reason=$finish, reasoning_chars=${reason_len:-0})" >&2
    return 1
  fi
  printf '%s' "$out"
}

PROMPT_HEAD='Du prüfst eine Wiki-Zusammenfassung gegen ihre Quelle (Ground Truth).

QUELLE (wahr):
---'
PROMPT_MID='---

ZUSAMMENFASSUNG (zu prüfen):
---'
PROMPT_TAIL='---

Regeln:
- Liste NUR Tatsachenbehauptungen der Zusammenfassung, die der Quelle WIDERSPRECHEN oder dort KEINE Stütze haben.
- Stil, Kürzung, Umformulierung und Weglassen sind KEINE Befunde.
- Jede Zeile: WIDERSPRUCH: <Zitat Zusammenfassung> || <Zitat Quelle>
- Keine Befunde? Antworte mit exakt: OK'

CHECKED=0
FINDINGS=0
SKIPPED=0
TRUNCATED=0

while IFS=$'\t' read -r chunk_file chunk_slug idx heading; do
  [ -n "${chunk_file:-}" ] || continue
  [ "$idx" != "0" ] || continue
  if [ "$MAX_PAIRS" -gt 0 ] && [ "$CHECKED" -ge "$MAX_PAIRS" ]; then
    TRUNCATED=$((TRUNCATED + 1))
    continue
  fi
  slug="$(jq -r --arg k "$SRC#$idx" '.[$k].slug // ""' "$STATE_FILE")"
  if [ -z "$slug" ] || [ ! -f "$WIKI_DIR/$slug.md" ]; then
    echo "NOTE: kein State-Eintrag/keine Seite für $SRC#$idx — übersprungen"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  body="$(page_body "$WIKI_DIR/$slug.md")"
  chunk="$(cat "$chunk_file")"
  # Konkatenation statt Pattern-Substitution: Chunk/Body können Backslashes
  # enthalten, die ${var//...} verstümmeln würde.
  prompt="$PROMPT_HEAD
$chunk
$PROMPT_MID
$body
$PROMPT_TAIL"
  if ! verdict="$(call_llm "$prompt")"; then
    echo "error: LLM-Prüfung scheiterte für $slug — Abbruch (kein Clean-Bericht)" >&2
    exit 2
  fi
  CHECKED=$((CHECKED + 1))
  if [ "$(echo "$verdict" | tr -d '[:space:]')" = "OK" ]; then
    echo "CLAIMS-OK: $slug ($SRC#$idx)"
  else
    echo "CLAIMS-FINDING: $slug ($SRC#$idx)"
    echo "$verdict" | sed 's/^/    /'
    FINDINGS=$((FINDINGS + 1))
  fi
done < "$MANIFEST_TSV"

echo "Verify-claims: $SRC — $CHECKED geprüft, $FINDINGS mit Befund, $SKIPPED übersprungen, $TRUNCATED durch max-pairs gekappt"
exit 0
