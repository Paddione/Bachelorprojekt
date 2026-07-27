#!/usr/bin/env bash
# scripts/factory/scout.sh — deterministic Software Factory Scout.
#
# Replaces the LLM scout agent. Discovers which files a feature will touch via
# grep/find, classifies complexity, tags risk areas, and (fail-soft) looks up
# similar tickets. Emits SCOUT_SCHEMA-conformant JSON to stdout.
#
# Usage:
#   bash scripts/factory/scout.sh \
#     --ticket-id T000XXX --title "Feature title" --slug "feature-slug" \
#     --description "..." --repo /home/patrick/Bachelorprojekt
#
# Exit 0 on success (JSON on stdout). Exit 2 on bad CLI usage (Usage on stderr).
set -uo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scout.sh --ticket-id <id> --title <title> [--slug <slug>]
                [--description <desc>] [--repo <path>]

Emits SCOUT_SCHEMA JSON to stdout:
  { complexity, touched_files, risk_areas, similar_tickets, estimated_slots }
EOF
}

# ── CLI parsing ──────────────────────────────────────────────────────────────
TICKET_ID=""; TITLE=""; SLUG=""; DESCRIPTION=""; REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket-id)   TICKET_ID="${2:-}"; shift 2 ;;
    --title)       TITLE="${2:-}";     shift 2 ;;
    --slug)        SLUG="${2:-}";      shift 2 ;;
    --description) DESCRIPTION="${2:-}"; shift 2 ;;
    --repo)        REPO="${2:-}";      shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *)             echo "scout.sh: unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

# --title is the only hard requirement (slug/description/repo have defaults).
if [[ -z "$TITLE" ]]; then
  echo "scout.sh: --title is required." >&2
  usage
  exit 2
fi
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# ── Phase 1: Keyword extraction ──────────────────────────────────────────────
# Title: meaningful words >3 chars, lowercased.
# Slug:  parts >2 chars (split on '-').
mapfile -t TITLE_WORDS < <(
  printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' \
    | awk 'length>3'
)
mapfile -t SLUG_PARTS < <(
  printf '%s' "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' \
    | awk 'length>2'
)

# ── Phase 1b: N-gram generation (T002241) ────────────────────────────────────
# Bigrams: consecutive word pairs from title, max 20.
BIGRAMS=()
if [[ ${#TITLE_WORDS[@]} -ge 2 ]]; then
  for ((i=0; i<${#TITLE_WORDS[@]}-1 && i<20; i++)); do
    BIGRAMS+=("${TITLE_WORDS[i]}-${TITLE_WORDS[i+1]}")
  done
fi

# Trigrams: consecutive word triples from title, max 10, only if ≥3 words.
TRIGRAMS=()
if [[ ${#TITLE_WORDS[@]} -ge 3 ]]; then
  for ((i=0; i<${#TITLE_WORDS[@]}-2 && i<10; i++)); do
    TRIGRAMS+=("${TITLE_WORDS[i]}-${TITLE_WORDS[i+1]}-${TITLE_WORDS[i+2]}")
  done
fi

# CamelCase splitting: detect camelCase/PascalCase in title and split.
# E.g. "OIDCClientConfig" → "OIDC", "Client", "Config"
CAMEL_PARTS=()
for word in $(printf '%s' "$TITLE" | tr '[:space:]' '\n'); do
  if printf '%s' "$word" | grep -qE '[a-z][A-Z]|[A-Z]{2,}[a-z]'; then
    # Split on camelCase boundaries
    while IFS= read -r -d '' part; do
      [[ -n "$part" ]] && CAMEL_PARTS+=("$(printf '%s' "$part" | tr '[:upper:]' '[:lower:]')")
    done < <(printf '%s' "$word" | sed 's/\([a-z]\)\([A-Z]\)/\1\n\2/g; s/\([A-Z]\)\([A-Z][a-z]\)/\1\n\2/g' | tr '\n' '\0')
  fi
done
# Deduplicate camel parts
if [[ ${#CAMEL_PARTS[@]} -gt 0 ]]; then
  mapfile -t CAMEL_PARTS < <(printf '%s\n' "${CAMEL_PARTS[@]}" | sort -u)
fi

# Filename-stem matching: extract filenames without extension from title words.
# E.g. title "scout-drift setup" matches file "scout-drift.cjs" via stem "scout-drift"
FILENAME_STEMS=()
for word in $(printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]'); do
  [[ ${#word} -gt 2 ]] && FILENAME_STEMS+=("$word")
done

# ── Phase 1c: Drift-cache read (T002241) — before file discovery ─────────────
# Read brand-keyed drift from /tmp/scout-drift-cache.json.
# If drift > 0.5, switch grep to -E regex mode for broader matching.
# If drift > 0.7, apply 1.5× file-count multiplier before complexity.
# When no cache exists, drift defaults to 0 (first run / evicted cache).
SCOUT_DRIFT=0
SCOUT_GREP_FLAGS="-rliFi"
SCOUT_FILE_MULTIPLIER=1.0
DRIFT_CACHE_FILE="/tmp/scout-drift-cache.json"
DRIFT_BRAND="${BRAND:-mentolder}"
if [[ -f "$DRIFT_CACHE_FILE" ]]; then
  cached_drift="$(jq -r --arg b "$DRIFT_BRAND" '.[$b] // 0' "$DRIFT_CACHE_FILE" 2>/dev/null || echo 0)"
  if [[ -n "$cached_drift" ]] && awk "BEGIN {exit !($cached_drift > 0)}" 2>/dev/null; then
    SCOUT_DRIFT="$cached_drift"
    if awk "BEGIN {exit !($SCOUT_DRIFT > 0.5)}" 2>/dev/null; then
      # Drift > 0.5: expand grep to regex -E mode for broader matching
      SCOUT_GREP_FLAGS="-rliE"
      echo "scout.sh: drift=$SCOUT_DRIFT > 0.5, using -E regex mode" >&2
    fi
    if awk "BEGIN {exit !($SCOUT_DRIFT > 0.7)}" 2>/dev/null; then
      # Drift > 0.7: apply 1.5× file-count multiplier before complexity
      SCOUT_FILE_MULTIPLIER=1.5
      echo "scout.sh: drift=$SCOUT_DRIFT > 0.7, applying 1.5× multiplier" >&2
    fi
  fi
else
  # No cache file: drift defaults to 0 (T002241 4.5)
  SCOUT_DRIFT=0
fi

# ── Phase 2: File discovery (three strategies) ───────────────────────────────
SRC_DIRS=("$REPO/website/src" "$REPO/scripts" "$REPO/brett" "$REPO/k3d" "$REPO/environments" "$REPO/tests" "$REPO/docs" "$REPO/openspec")
tmp_hits="$(mktemp)"
trap 'rm -f "$tmp_hits"' EXIT

# Strategy A — keyword grep (semantic proximity). One keyword at a time so a
# missing keyword doesn't blank the whole result. Flags adapt to drift:
#   SCOUT_GREP_FLAGS="-rliFi" (default, fixed-string)
#   SCOUT_GREP_FLAGS="-rliE" (drift > 0.5, regex mode for broader matching)
ALL_KEYWORDS=("${TITLE_WORDS[@]}" "${BIGRAMS[@]}" "${TRIGRAMS[@]}" "${CAMEL_PARTS[@]}")
for kw in "${ALL_KEYWORDS[@]:-}"; do
  [[ -z "$kw" ]] && continue
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    grep $SCOUT_GREP_FLAGS \
      --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
      --include="*.svelte" --include="*.astro" \
      --include="*.yaml" --include="*.yml" --include="*.sh" \
      --include="*.spec.ts" --include="*.test.ts" \
      --exclude-dir=node_modules --exclude-dir=dist \
      -- "$kw" "$d" 2>/dev/null | head -20
  done
done >> "$tmp_hits"

# Strategy B — filename pattern (structural proximity).
FNAME_PARTS=("${SLUG_PARTS[@]}" "${FILENAME_STEMS[@]}")
if [[ ${#FNAME_PARTS[@]} -gt 0 ]]; then
  fname_re="$(printf '%s|' "${FNAME_PARTS[@]}")"; fname_re="${fname_re%|}"
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    find "$d" -type f \
      \( -name "*.ts" -o -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \
         -o -name "*.svelte" -o -name "*.astro" \) \
      -not \( -path '*/node_modules/*' -o -path '*/dist/*' \) \
      2>/dev/null | grep -iE -- "$fname_re" | head -20
  done >> "$tmp_hits"
fi

# Strategy C — infra/manifest scan, only when title/slug imply infra work.
INFRA_HAYSTACK="$(printf '%s ' "${TITLE_WORDS[@]:-}" "${SLUG_PARTS[@]:-}")"
if printf '%s' "$INFRA_HAYSTACK" | grep -qiE 'deploy|manifest|config|secret|cert'; then
  for kw in "${TITLE_WORDS[@]:-}"; do
    [[ -z "$kw" ]] && continue
    for d in "$REPO/k3d" "$REPO/environments"; do
      [[ -d "$d" ]] || continue
      grep -rliF --exclude-dir=node_modules --exclude-dir=dist -- "$kw" "$d" 2>/dev/null | head -10
    done
  done >> "$tmp_hits"
fi

# Deduplicate, drop blanks, absolutise (hits are already absolute since we grep
# absolute dirs; resolve any stragglers defensively).
mapfile -t TOUCHED < <(
  sort -u "$tmp_hits" | sed '/^$/d' | while IFS= read -r f; do
    if [[ "$f" = /* ]]; then printf '%s\n' "$f"; else printf '%s\n' "$REPO/$f"; fi
  done
)

# Limit total to 30 files
if [[ ${#TOUCHED[@]} -gt 30 ]]; then
  TOUCHED=("${TOUCHED[@]:0:30}")
fi

# ── Phase 2b: LLM fallback (hybrid scout) ─────────────────────────────────────
# When deterministic discovery finds fewer than SCOUT_LLM_MIN_FILES (default 2,
# lowered from 4 in T002241) and the fallback is not explicitly disabled, invoke
# DeepSeek for additional paths.
# Fail-soft: on any error the deterministic result stays untainted.
SCOUT_LLM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Build discovered paths list and keyword stats for LLM context (T002241 2.2-2.3)
DISCOVERED_PATHS_ARG=""
if [[ ${#TOUCHED[@]} -gt 0 ]]; then
  DISCOVERED_PATHS_ARG="--discovered-paths $(printf '%s\n' "${TOUCHED[@]}" | head -5 | tr '\n' '|')"
fi
# Keyword stats: how many hits per keyword (from tmp_hits if available)
KEYWORD_STATS_ARG=""
if [[ -f "$tmp_hits" ]]; then
  total_hits=$(wc -l < "$tmp_hits" 2>/dev/null || echo 0)
  KEYWORD_STATS_ARG="--keyword-stats \"${#ALL_KEYWORDS[@]} keywords, ${total_hits} total matches\""
fi
if [[ ${#TOUCHED[@]} -lt ${SCOUT_LLM_MIN_FILES:-2} && "${SCOUT_LLM_ENABLED:-}" != "false" ]]; then
  if [[ -x "$SCOUT_LLM_ROOT/scout-llm-fallback.sh" ]]; then
    mapfile -t LLM_PATHS < <(
      bash "$SCOUT_LLM_ROOT/scout-llm-fallback.sh" \
        --title "$TITLE" --slug "$SLUG" --description "$DESCRIPTION" --repo "$REPO" \
        $DISCOVERED_PATHS_ARG $KEYWORD_STATS_ARG \
        2>/dev/null || true
    )
    for llm_p in "${LLM_PATHS[@]:-}"; do
      [[ -z "$llm_p" ]] && continue
      TOUCHED+=("$llm_p")
    done
    # Re-deduplicate after merge
    if [[ ${#TOUCHED[@]} -gt 0 ]]; then
      mapfile -t TOUCHED < <(printf '%s\n' "${TOUCHED[@]}" | sort -u)
    fi
    # Re-cap at 30
    if [[ ${#TOUCHED[@]} -gt 30 ]]; then
      TOUCHED=("${TOUCHED[@]:0:30}")
    fi
  fi
fi

# ── Phase 3: Complexity classification ───────────────────────────────────────
FILE_COUNT=${#TOUCHED[@]}
# Apply drift-based file-count multiplier (T002241 4.4)
if awk "BEGIN {exit !($SCOUT_FILE_MULTIPLIER > 1.0)}" 2>/dev/null; then
  FILE_COUNT=$(awk "BEGIN {printf \"%d\", $FILE_COUNT * $SCOUT_FILE_MULTIPLIER}" 2>/dev/null || echo "$FILE_COUNT")
fi
if [[ $FILE_COUNT -gt 0 ]]; then
  SUBSYSTEMS=$(printf '%s\n' "${TOUCHED[@]}" | sed "s|^$REPO/||" | cut -d/ -f1 \
    | sort -u | grep -c .)
else
  SUBSYSTEMS=0
fi
HAS_MIGRATION=0; HAS_K8S=0
if [[ $FILE_COUNT -gt 0 ]]; then
  printf '%s\n' "${TOUCHED[@]}" | grep -qE 'migration|\.sql$' && HAS_MIGRATION=1
  printf '%s\n' "${TOUCHED[@]}" | grep -qE "^$REPO/(k3d|prod|environments)/" && HAS_K8S=1
fi

if [[ $FILE_COUNT -eq 0 ]]; then
  # No discovery hits → ambiguous size; bias high so the implementer model is
  # not downgraded to haiku. (Spec Phase 3 fallback.)
  COMPLEXITY="medium"; SLOTS=2
elif [[ $FILE_COUNT -le 3 && $SUBSYSTEMS -le 1 && $HAS_MIGRATION -eq 0 && $HAS_K8S -eq 0 ]]; then
  COMPLEXITY="simple"; SLOTS=1
elif [[ $FILE_COUNT -le 10 && $SUBSYSTEMS -le 2 && $HAS_MIGRATION -eq 0 ]]; then
  COMPLEXITY="medium"; SLOTS=2
else
  COMPLEXITY="complex"; SLOTS=4
fi

# ── Phase 4: Risk areas from path patterns ───────────────────────────────────
RISKS=()
if [[ $FILE_COUNT -gt 0 ]]; then
  blob="$(printf '%s\n' "${TOUCHED[@]}")"
  printf '%s' "$blob" | grep -qE "^$REPO/k3d/"        && RISKS+=("k8s-manifests")
  printf '%s' "$blob" | grep -qE 'migration|\.sql$'    && RISKS+=("db-migration")
  printf '%s' "$blob" | grep -qiE 'keycloak|realm'     && RISKS+=("sso-oidc")
  printf '%s' "$blob" | grep -qiE 'secret|credentials' && RISKS+=("secrets-handling")
  printf '%s' "$blob" | grep -qE 'pipeline\.js|/factory/' && RISKS+=("factory-pipeline")
  printf '%s' "$blob" | grep -qE "^$REPO/environments/" && RISKS+=("env-config")
  printf '%s' "$blob" | grep -qiE '/auth/'             && RISKS+=("authentication")
fi

# ── Phase 5: Similar tickets (fail-soft) ─────────────────────────────────────
# find-similar prints an array of row objects; SCOUT_SCHEMA wants string IDs.
# Map to .external_id; on any failure → [].
SIMILAR="[]"
if command -v npx >/dev/null 2>&1 && [[ -f "$REPO/website/scripts/find-similar-tickets.mjs" ]]; then
  raw="$(cd "$REPO/website" \
    && timeout 15 npx tsx scripts/find-similar-tickets.mjs "$TITLE $DESCRIPTION" 5 \
       2>/dev/null)" || raw=""
  if [[ -n "$raw" ]]; then
    mapped="$(printf '%s' "$raw" | jq -c 'if type=="array" then [.[] | .external_id | select(. != null and (. | tostring | startswith("T"))) | tostring] else [] end' 2>/dev/null)" || mapped=""
    [[ -n "$mapped" ]] && SIMILAR="$mapped"
  fi
fi

# ── Phase 6: JSON output ─────────────────────────────────────────────────────
if command -v jq >/dev/null 2>&1; then
  touched_json="$( ( [[ $FILE_COUNT -gt 0 ]] && printf '%s\n' "${TOUCHED[@]}" || true ) | jq -R . | jq -s . )"
  risks_json="$(  ( [[ ${#RISKS[@]}  -gt 0 ]] && printf '%s\n' "${RISKS[@]}"  || true ) | jq -R . | jq -s . )"
  jq -n \
    --argjson touched  "$touched_json" \
    --arg     complexity "$COMPLEXITY" \
    --argjson risks    "$risks_json" \
    --argjson similar  "$SIMILAR" \
    --argjson slots    "$SLOTS" \
    '{complexity:$complexity, touched_files:$touched, risk_areas:$risks,
      similar_tickets:$similar, estimated_slots:$slots}'
else
  # Pure-bash JSON fallback (jq absent). Minimal escaping: backslash + quote.
  json_arr() {
    local first=1; printf '['
    local x
    for x in "$@"; do
      x="${x//\\/\\\\}"; x="${x//\"/\\\"}"
      [[ $first -eq 1 ]] && first=0 || printf ','
      printf '"%s"' "$x"
    done
    printf ']'
  }
  printf '{"complexity":"%s","touched_files":%s,"risk_areas":%s,"similar_tickets":%s,"estimated_slots":%s}\n' \
    "$COMPLEXITY" \
    "$( [[ $FILE_COUNT -gt 0 ]] && json_arr "${TOUCHED[@]}" || printf '[]' )" \
    "$( [[ ${#RISKS[@]} -gt 0 ]] && json_arr "${RISKS[@]}" || printf '[]' )" \
    "$SIMILAR" \
    "$SLOTS"
fi
