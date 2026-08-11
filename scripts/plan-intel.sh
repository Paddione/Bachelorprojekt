#!/usr/bin/env bash
# scripts/plan-intel.sh — deterministic intel.json generator
# Usage: scripts/plan-intel.sh <slug> [--target-files <f1> [<f2> ...]] [--out <pfad>]
# Generates a schema-conformant Plan Intel Bundle at openspec/changes/<slug>/intel.json.
# Deterministic: same inputs produce identical output (git SHA aside).
set -euo pipefail

SLUG="${1:?Usage: plan-intel.sh <slug> [--target-files <f1> [<f2> ...]] [--out <pfad>]}"
shift

TARGET_FILES=""
OUT_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    # [T003623] --target-files ist variadisch: alle folgenden Argumente bis zum
    # naechsten --Flag werden als Pfade gesammelt und komma-vereinigt — der
    # Datei-Split unten laeuft bereits `IFS=',' read -ra FILES`.
    --target-files)
      shift
      _paths=""
      while [[ $# -gt 0 && "$1" != --* ]]; do
        _paths="${_paths:+$_paths,}$1"
        shift
      done
      TARGET_FILES="$_paths"
      ;;
    --out) shift; OUT_PATH="$1"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGE_DIR="$REPO_ROOT/openspec/changes/$SLUG"

_resolve_target_files() {
  local tasks_md="$CHANGE_DIR/tasks.md"
  [[ -f "$tasks_md" ]] || { echo "tasks.md not found: $tasks_md" >&2; return 1; }
  # Table columns: | id | file | role | target_files | depends_on |
  # Leading | creates empty field 0. So read order: _0 _1(id) _2(file) _3(role) _4(targets) _5(deps)
  awk '/^##[[:space:]]+Partials/{f=1;next} f&&/^##[[:space:]]/{exit} f&&/^\|/{print}' "$tasks_md" \
    | grep 'tasks\.d/' \
    | while IFS='|' read -r _ _ _ _ targets _; do
        echo "$targets"
      done \
    | tr -d ' `' | tr ',' '\n' | sed 's/^ *//; s/ *$//' | sort -u | grep -v '^$' \
    | paste -sd ',' -
}

if [[ -z "$TARGET_FILES" ]]; then
  TARGET_FILES="$(_resolve_target_files)" || TARGET_FILES=""
fi

OUT_PATH="${OUT_PATH:-$CHANGE_DIR/intel.json}"
mkdir -p "$(dirname "$OUT_PATH")"

EXISTING_INTEL="${OUT_PATH:-$CHANGE_DIR/intel.json}"
API_CONTRACTS="[]"
EXTERNAL_TYPES="[]"
RISKS_EXTRA="[]"
if [[ -f "$EXISTING_INTEL" ]]; then
  API_CONTRACTS="$(jq -c '.api_contracts // []' "$EXISTING_INTEL")"
  EXTERNAL_TYPES="$(jq -c '.external_types // []' "$EXISTING_INTEL")"
  RISKS_EXTRA="$(jq -c '.risks // []' "$EXISTING_INTEL")"
fi

# [T002498-M2] Bezugspunkt ist origin/main, NICHT HEAD. Die intel.json behauptet
# mit "generated_from: main@<sha>" einen main-Stand zu messen. Lief der Generator
# im Hauptcheckout auf einem Feature-Branch, wurde dort HEAD als "main" verbucht
# und das Artefakt eines fremden Changes trug einen Feature-Commit samt falscher
# LOC-Zahlen (beobachtet bei T002493, Feature-Commit 364742268). origin/main ist
# der einzige main, den das Feld ehrlich bezeugen darf. Fallback auf HEAD nur,
# wenn kein origin/main existiert (z.B. detached, erster Push).
GIT_SHA="$(cd "$REPO_ROOT" && { git rev-parse --short origin/main 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo "unknown"; })"
GENERATED_FROM="${GIT_SHA:+main@$GIT_SHA}"
[[ "$GIT_SHA" == "unknown" ]] && GENERATED_FROM="unknown"

IMPACT_FILES="[]"
SYMBOLS="[]"
CALL_GRAPH='{"entrypoints":[],"edges":[]}'
DB_TABLES="[]"
RISKS="[]"
SOURCES=""

_path_language() {
  local p="$1"
  local ext="${p##*.}"
  case "$ext" in
    sh|bash) echo "bash" ;;
    mjs|mts) echo "javascript" ;;
    js|ts|jsx|tsx) echo "javascript" ;;
    md) echo "markdown" ;;
    json|yaml|yml|toml) echo "config" ;;
    py) echo "python" ;;
    svelte) echo "svelte" ;;
    astro) echo "astro" ;;
    css|scss) echo "css" ;;
    bats) echo "bash" ;;
    java) echo "java" ;;
    php) echo "php" ;;
    cjs) echo "javascript" ;;
    *) echo "text" ;;
  esac
}

IFS=',' read -ra FILES <<<"$TARGET_FILES"
[[ -z "${FILES[*]:-}" ]] && { echo "No target files found for slug: $SLUG" >&2; exit 1; }

for path in "${FILES[@]}"; do
  path="$(printf '%s' "$path" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [[ -z "$path" ]] && continue
  full_path="$REPO_ROOT/$path"
  lang="$(_path_language "$path")"

  loc=0
  [[ -f "$full_path" ]] && loc="$(wc -l < "$full_path" | tr -d ' ')"

  s1_limit="0"
  s1_baseline="null"
  s1_budget="null"

  if PLAN_LINT_SELFTEST=1 bash "$REPO_ROOT/scripts/plan-lint.sh" _ext_limit "$path" >/dev/null 2>&1; then
    s1_limit="$(PLAN_LINT_SELFTEST=1 bash "$REPO_ROOT/scripts/plan-lint.sh" _ext_limit "$path" 2>/dev/null || echo "0")"
  fi
  if [[ -f "$REPO_ROOT/docs/code-quality/baseline.json" ]]; then
    lcl_base="$(jq -r --arg k "S1:$path" '.[$k].metric // empty' "$REPO_ROOT/docs/code-quality/baseline.json" 2>/dev/null || true)"
    [[ -n "$lcl_base" ]] && s1_baseline="$lcl_base"
  fi
  if PLAN_LINT_SELFTEST=1 bash "$REPO_ROOT/scripts/plan-lint.sh" residual_budget "$path" >/dev/null 2>&1; then
    s1_budget_raw="$(PLAN_LINT_SELFTEST=1 bash "$REPO_ROOT/scripts/plan-lint.sh" residual_budget "$path" 2>/dev/null || true)"
    if [[ -n "$s1_budget_raw" ]]; then
      s1_budget="$s1_budget_raw"
    else
      s1_budget="null"
    fi
  fi

  SOURCES="${SOURCES:+$SOURCES,}wc -l,plan-lint"

  entry="$(jq -n \
    --arg path "$path" \
    --arg lang "$lang" \
    --argjson loc "$loc" \
    --argjson s1_limit "$s1_limit" \
    --argjson s1_baseline "${s1_baseline:-null}" \
    --argjson s1_budget "${s1_budget:-null}" \
    '{path:$path,language:$lang,loc:$loc,s1_limit:$s1_limit,s1_baseline:$s1_baseline,s1_budget:$s1_budget}')"
  IMPACT_FILES="$(echo "$IMPACT_FILES" | jq --argjson e "$entry" '. + [$e]')"

  if [[ -f "$full_path" ]]; then
    while IFS='' read -r line; do
      [[ -z "$line" ]] && continue
      name="$(echo "$line" | sed -E 's/^[[:space:]]*(function[[:space:]]+)?([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(.*/\2/')"
      [[ -z "$name" ]] && continue
      echo "$line" | grep -qE '(function|\(\)|\(.*\))' || continue
      qname="$path:$name"
      sym="$(jq -n \
        --arg qn "$qname" --arg f "$path" --arg n "$name" \
        '{qualified_name:$qn,kind:"function",file:$f,signature:($n+"(...)"),type_text:($n+"(...)"),source:"grep"}')"
      SYMBOLS="$(echo "$SYMBOLS" | jq --argjson s "$sym" '. + [$s]')"
      SOURCES="${SOURCES},grep"
    done < <(grep -nE '^\s*(function\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(|[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*\))' "$full_path" 2>/dev/null || true)
  fi

  if echo "$path" | grep -qE '\.sql$|migrations/|schema\.'; then
    DB_TABLES_DETECTED=1
  fi
done

DETECTED_SOURCES=""
for s in $(echo "$SOURCES" | tr ',' '\n' | sort -u | grep -v '^$'); do
  DETECTED_SOURCES="${DETECTED_SOURCES:+$DETECTED_SOURCES,}\"$s\""
done
DETECTED_SOURCES="[$DETECTED_SOURCES]"

RISK_CODEBASE='{"note":"codebase-memory and LSP were not queried for this bundle — symbols/call_graph come from grep and may be incomplete.","severity":"warn"}'
RISKS="$(echo "[]" | jq --argjson r "$RISK_CODEBASE" '. + [$r]')"

if [[ -n "${RISKS_EXTRA:-}" && "$RISKS_EXTRA" != "[]" ]]; then
  # [T002515] unique_by, weil der Generator RISK_CODEBASE bei JEDEM Lauf neu erzeugt und
  # RISKS_EXTRA den risks[]-Block des vorherigen Laufs traegt — inklusive derselben
  # Meldung. Ohne Dedupe waechst risks[] um genau einen Eintrag pro Lauf und jeder
  # Testlauf hinterlaesst eine geaenderte, committbare Datei.
  # Der Schluessel ist (note, severity): manuell ergaenzte Risiken mit abweichendem note
  # ueberleben, nur die Generator-Duplikate fallen weg.
  RISKS="$(echo "$RISKS" | jq --argjson re "$RISKS_EXTRA" '. + $re | unique_by([.note, .severity])')"
fi

mkdir -p "$(dirname "$OUT_PATH")"

# Ticket-ID aus .ticket lesen (Fallback: leer), nicht hartkodieren — die
# hardkodierte T002420 stammte aus einem Einzelticket und wanderte in jedes
# generierte intel.json.
TICKET_PATH="$(dirname "$OUT_PATH")/.ticket"
if [[ ! -f "$TICKET_PATH" ]]; then
  TICKET_PATH="$CHANGE_DIR/.ticket"
fi
TICKET_ID="$(cat "$TICKET_PATH" 2>/dev/null || echo "")"

OUTPUT="$(jq -n \
  --arg slug "$SLUG" \
  --arg ticket_id "$TICKET_ID" \
  --arg generated_from "$GENERATED_FROM" \
  --argjson impact_files "$IMPACT_FILES" \
  --argjson symbols "$SYMBOLS" \
  --argjson call_graph "$CALL_GRAPH" \
  --argjson db_tables "$DB_TABLES" \
  --argjson api_contracts "$API_CONTRACTS" \
  --argjson external_types "$EXTERNAL_TYPES" \
  --argjson risks "$RISKS" \
  --argjson intel_sources "$DETECTED_SOURCES" \
  '{
    meta: {
      slug: $slug,
      ticket_id: $ticket_id,
      generated_from: $generated_from,
      domains: ["plan-authoring","dev-tooling","factory"],
      intel_sources: $intel_sources
    },
    impact_files: $impact_files,
    symbols: $symbols,
    call_graph: $call_graph,
    db_tables: $db_tables,
    api_contracts: $api_contracts,
    external_types: $external_types,
    risks: $risks
  }')"

echo "$OUTPUT" > "$OUT_PATH"
echo "intel.json written to $OUT_PATH" >&2
