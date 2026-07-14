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

# ── Phase 2: File discovery (three strategies) ───────────────────────────────
SRC_DIRS=("$REPO/website/src" "$REPO/scripts" "$REPO/brett" "$REPO/k3d" "$REPO/environments" "$REPO/tests" "$REPO/docs" "$REPO/openspec")
tmp_hits="$(mktemp)"
trap 'rm -f "$tmp_hits"' EXIT

# Strategy A — keyword grep (semantic proximity). One keyword at a time so a
# missing keyword doesn't blank the whole result. -F = fixed string, safe.
for kw in "${TITLE_WORDS[@]:-}"; do
  [[ -z "$kw" ]] && continue
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    grep -rliFi \
      --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
      --include="*.svelte" --include="*.astro" \
      --include="*.yaml" --include="*.yml" --include="*.sh" \
      --include="*.spec.ts" --include="*.test.ts" \
      -- "$kw" "$d" 2>/dev/null | head -20
  done
done >> "$tmp_hits"

# Strategy B — filename pattern (structural proximity).
if [[ ${#SLUG_PARTS[@]} -gt 0 ]]; then
  slug_re="$(printf '%s|' "${SLUG_PARTS[@]}")"; slug_re="${slug_re%|}"
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    find "$d" -type f \
      \( -name "*.ts" -o -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \
         -o -name "*.svelte" -o -name "*.astro" \) \
      2>/dev/null | grep -iE -- "$slug_re" | head -20
  done >> "$tmp_hits"
fi

# Strategy C — infra/manifest scan, only when title/slug imply infra work.
INFRA_HAYSTACK="$(printf '%s ' "${TITLE_WORDS[@]:-}" "${SLUG_PARTS[@]:-}")"
if printf '%s' "$INFRA_HAYSTACK" | grep -qiE 'deploy|manifest|config|secret|cert'; then
  for kw in "${TITLE_WORDS[@]:-}"; do
    [[ -z "$kw" ]] && continue
    for d in "$REPO/k3d" "$REPO/environments"; do
      [[ -d "$d" ]] || continue
      grep -rliF -- "$kw" "$d" 2>/dev/null | head -10
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
# When deterministic discovery finds fewer than SCOUT_LLM_MIN_FILES (default 4)
# and the fallback is not explicitly disabled, invoke DeepSeek for additional paths.
# Fail-soft: on any error the deterministic result stays untainted.
SCOUT_LLM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ${#TOUCHED[@]} -lt ${SCOUT_LLM_MIN_FILES:-4} && "${SCOUT_LLM_ENABLED:-}" != "false" ]]; then
  if [[ -x "$SCOUT_LLM_ROOT/scout-llm-fallback.sh" ]]; then
    mapfile -t LLM_PATHS < <(
      bash "$SCOUT_LLM_ROOT/scout-llm-fallback.sh" \
        --title "$TITLE" --slug "$SLUG" --description "$DESCRIPTION" --repo "$REPO" \
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
