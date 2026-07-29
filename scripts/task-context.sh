#!/usr/bin/env bash
# scripts/task-context.sh — gemeinsamer Kontext-Assembler für Factory und dev-flow-execute
# Usage: scripts/task-context.sh <slug> [--partial pX] [--plan-base <ref>]
# Gibt einen stabilen Markdown-Block auf stdout aus (H2-Header).
# Hart: statischer Kern aus intel.json (fehlt es → exit 1).
# Weich: frische Signale mit 5s Timeout, WARN: bei Fehlschlag.
set -euo pipefail

SLUG="${1:?Usage: task-context.sh <slug> [--partial pX] [--plan-base <ref>]}"
shift

PARTIAL=""
PLAN_BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --partial) shift; PARTIAL="$1" ;;
    --plan-base) shift; PLAN_BASE="$1" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILTER="$REPO_ROOT/scripts/plan-intel-filter.sh"
INTEL="$REPO_ROOT/openspec/changes/$SLUG/intel.json"

# ── Statischer Kern (hart) ─────────────────────────────
# Fehlt intel.json → sofort abbrechen, kein teilweiser Kontext.
# Ein Agent, der weiss, dass er blind ist, verhaelt sich anders als einer, der
# Blindheit fuer Abwesenheit von Gefahr haelt — siehe _role_allowlist() in
# plan-context.sh (T002322).
if [[ ! -f "$INTEL" ]]; then
  echo "ERROR: intel.json not found at $INTEL — cannot assemble context for slug '$SLUG'" >&2
  echo "Run: bash scripts/plan-intel.sh $SLUG" >&2
  exit 1
fi

# Validate completeness (I1 rules)
if ! jq -e '.meta and .impact_files and .symbols' "$INTEL" >/dev/null 2>&1; then
  echo "ERROR: intel.json at $INTEL is incomplete — meta/impact_files/symbols required" >&2
  exit 1
fi
if [[ "$(jq '.impact_files | length' "$INTEL")" -eq 0 ]]; then
  echo "ERROR: intel.json impact_files is empty at $INTEL" >&2
  exit 1
fi

# ── Target-Files fuer Partial ermitteln ────────────────
TASKS_MD="$REPO_ROOT/openspec/changes/$SLUG/tasks.md"
TARGET_FILES=""
ALL_TARGET_FILES=""
if [[ -f "$TASKS_MD" ]]; then
  ALL_TARGET_FILES="$(awk '/^##[[:space:]]+Partials/{f=1;next} f&&/^##[[:space:]]/{exit} f&&/^\|/{print}' "$TASKS_MD" \
    | grep 'tasks\.d/' \
    | while IFS='|' read -r _ _ _ _ targets _; do echo "$targets"; done \
    | tr -d ' `' | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | sort -u \
    | paste -sd ' ' -)"
fi
if [[ -n "$PARTIAL" ]]; then
  if [[ -f "$TASKS_MD" ]]; then
    TARGET_FILES="$(awk -v pid="$PARTIAL" '
      /^##[[:space:]]+Partials/{f=1;next} f&&/^##[[:space:]]/{exit} f&&/^\|/{print}
    ' "$TASKS_MD" \
      | grep "tasks\.d/" \
      | while IFS='|' read -r _ id _ _ targets _; do
          id="$(printf '%s' "$id" | tr -d ' `')"
          if [[ "$id" == "$PARTIAL" ]]; then
            echo "$targets"
          fi
        done \
      | tr -d ' `' | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' \
      | paste -sd ' ' -)"
  fi
fi

# ── Intel-Kern via Filter ──────────────────────────────
if [[ -n "$TARGET_FILES" ]]; then
  IFS=' ' read -ra TF <<<"$TARGET_FILES"
  INTEL_JSON="$("$FILTER" "$SLUG" "${TF[@]}" 2>/dev/null || jq -c . "$INTEL")"
else
  INTEL_JSON="$(jq -c . "$INTEL")"
fi

# ── Markdown-Block ausgeben ────────────────────────────
HEADER_LINE="## Intel-Bundle: $SLUG"
[[ -n "$PARTIAL" ]] && HEADER_LINE="$HEADER_LINE (partial: $PARTIAL)"
echo "$HEADER_LINE"
echo ""

# Meta section
echo "### Meta"
SLUG_VAL="$(echo "$INTEL_JSON" | jq -r '.meta.slug // "?"')"
TICKET_VAL="$(echo "$INTEL_JSON" | jq -r '.meta.ticket_id // "?"')"
GEN_VAL="$(echo "$INTEL_JSON" | jq -r '.meta.generated_from // "?"')"
echo "- slug: $SLUG_VAL"
echo "- ticket_id: $TICKET_VAL"
echo "- generated_from: $GEN_VAL"
echo ""

# Impact Files section
echo "### Impact Files"
echo '| path | language | loc | s1_limit | s1_baseline | s1_budget |'
echo '|------|----------|-----|----------|-------------|-----------|'
echo "$INTEL_JSON" | jq -r '.impact_files[] | [.path,.language,(.loc|tostring),(.s1_limit|tostring),(.s1_baseline // "null"|tostring),(.s1_budget // "null"|tostring)] | join("|")' \
  | while IFS='|' read -r a b c d e f; do
      echo "|$a|$b|$c|$d|$e|$f|"
    done
echo ""

# Symbols section
SYM_COUNT="$(echo "$INTEL_JSON" | jq '.symbols | length')"
echo "### Symbols ($SYM_COUNT)"
echo "$INTEL_JSON" | jq -r '.symbols[] | "- `\(.qualified_name)` — \(.signature) (\(.source))"' 2>/dev/null || echo "(none)"
echo ""

# Database Tables section
DB_COUNT="$(echo "$INTEL_JSON" | jq '.db_tables | length')"
echo "### Database Tables ($DB_COUNT)"
if [[ "$DB_COUNT" -gt 0 ]]; then
  echo "$INTEL_JSON" | jq -r '.db_tables[] | "- \(.name) (\(.columns | length) columns)"' 2>/dev/null
else
  echo "(none)"
fi
echo ""

# API Contracts section
AC_COUNT="$(echo "$INTEL_JSON" | jq '.api_contracts | length')"
echo "### API Contracts ($AC_COUNT)"
if [[ "$AC_COUNT" -gt 0 ]]; then
  echo "$INTEL_JSON" | jq -r '.api_contracts[] | "- \(.method) \(.route)"' 2>/dev/null
else
  echo "(none)"
fi
echo ""

# Risks section
RISK_COUNT="$(echo "$INTEL_JSON" | jq '.risks | length')"
echo "### Risks ($RISK_COUNT)"
if [[ "$RISK_COUNT" -gt 0 ]]; then
  echo "$INTEL_JSON" | jq -r '.risks[] | "- [\(.severity)] \(.note)"' 2>/dev/null
else
  echo "(none)"
fi
echo ""

# ── Frische Signale (weich) ───────────────────────────
echo "### Fresh Signals"
echo ""

# Signal 1: Parallel work detection
_signal_parallel_work() {
  local lock_list
  lock_list="$(timeout 5 bash "$REPO_ROOT/scripts/agent-lock.sh" list 2>/dev/null || true)"
  if [[ -z "$lock_list" ]]; then
    echo "> WARN: Parallele Arbeit nicht erreichbar — Konflikte mit anderen Sessions bleiben unerkannt"
    echo ""
    return
  fi
  if echo "$lock_list" | grep -qi "no locks\|nothing\|empty"; then
    echo "Keine parallelen Locks erkannt."
    echo ""
    return
  fi
  echo "Aktive Locks:"
  echo '```'
  echo "$lock_list" | head -20
  echo '```'
  echo ""
}

# Signal 2: main-Drift
_signal_main_drift() {
  local base="${PLAN_BASE:-origin/main}"
  local drift_files="${TARGET_FILES:-$ALL_TARGET_FILES}"
  local diff_out=""
  if [[ -n "$drift_files" ]]; then
    IFS=' ' read -ra DF <<<"$drift_files"
    diff_out="$(timeout 5 git -C "$REPO_ROOT" diff --stat "$base..origin/main" -- "${DF[@]}" 2>/dev/null || true)"
  else
    diff_out="$(timeout 5 git -C "$REPO_ROOT" diff --stat "$base..origin/main" -- "openspec/changes/$SLUG/" 2>/dev/null || true)"
  fi
  if [[ -z "$diff_out" ]]; then
    echo "Keine Drift (${base}..origin/main) — keine Aenderungen an target_files."
    echo ""
    return
  fi
  if echo "$diff_out" | grep -q "file changed\|files changed"; then
    echo "Drift erkannt (${base}..origin/main):"
    echo '```'
    echo "$diff_out"
    echo '```'
    echo ""
  else
    echo "Keine Drift."
    echo ""
  fi
}

# Signal 3: Similar changes via OpenSpec search
_signal_similar_changes() {
  local base_url="${OPENSPEC_SEARCH_URL:-http://localhost:4321}"
  local search_url="${base_url}/api/openspec/search"
  local query=""
  if [[ -f "$TASKS_MD" ]]; then
    query="$(head -20 "$TASKS_MD" | grep -E 'title:' | head -1 | sed 's/.*title:[[:space:]]*//; s/\"//g' || echo "$SLUG")"
  else
    query="$SLUG"
  fi
  local similar=""
  similar="$(timeout 5 curl -sf "${search_url}?q=$(echo "$query" | jq -sRr @uri)&limit=3" 2>/dev/null || true)"
  if [[ -z "$similar" ]]; then
    echo "> WARN: OpenSpec-Suche nicht erreichbar — ahnliche Changes bleiben unbekannt"
    echo ""
    return
  fi
  local results_count
  results_count="$(echo "$similar" | jq '.results | length' 2>/dev/null || echo "0")"
  if [[ "$results_count" -eq 0 ]]; then
    echo "Keine ahnlichen Changes gefunden."
    echo ""
    return
  fi
  echo "Ahnliche Changes (Top $results_count):"
  echo "$similar" | jq -r '.results[] | "- \(.slug) (\(.ticket_id // "?"))"' 2>/dev/null
  echo ""
}

# All signals with individual 5s timeouts
_signal_parallel_work
_signal_main_drift
_signal_similar_changes
