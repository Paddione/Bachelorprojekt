#!/usr/bin/env bash
# scripts/plan-lint.sh — deterministic, fail-closed implementation-plan linter.
# Usage: scripts/plan-lint.sh [--json] <plan-file>
# Exit 1 = at least one HARD fail (gate). Exit 0 = pass (warnings allowed).
# Pure CLI: reads plan markdown + docs/code-quality/baseline.json + live `wc -l`.
set -euo pipefail

# --- B1 budget math (pure; unit-tested via the PLAN_LINT_SELFTEST hook) ---
# Static per-extension line limits — mirror of docs/code-quality/gates.yaml s1.limits.
_ext_limit() {  # _ext_limit <path> -> static limit (0 = ungated extension)
  case "$1" in
    *.astro|*.tsx|*.java|*.php) echo 400 ;;
    *.ts|*.js|*.jsx|*.py)       echo 600 ;;
    *.svelte|*.sh|*.mjs|*.mts)  echo 500 ;;
    *.bash)                     echo 300 ;;
    *.cjs)                      echo 200 ;;
    *)                          echo 0   ;;
  esac
}

# effective_threshold <path> -> max(static_limit, baseline.metric); 0 if ungated & unbaselined
effective_threshold() {
  local path="$1" limit base
  limit="$(_ext_limit "$path")"
  base="$(jq -r --arg k "S1:$path" '.[$k].metric // empty' "$BASELINE")"
  if [[ -n "$base" ]]; then
    (( base > limit )) && echo "$base" || echo "$limit"
  else
    echo "$limit"
  fi
}

# residual_budget <path> -> effective_threshold − live wc -l ; empty if file absent
residual_budget() {
  local path="$1" thr cur
  [[ -f "$REPO_ROOT/$path" ]] || { echo ""; return 0; }
  thr="$(effective_threshold "$path")"
  cur="$(wc -l < "$REPO_ROOT/$path" | tr -d ' ')"
  echo $(( thr - cur ))
}

# Self-test hook: `PLAN_LINT_SELFTEST=1 plan-lint.sh <fn> <args...>` runs one
# pure function and prints its result — keeps the budget math unit-testable.
if [[ "${PLAN_LINT_SELFTEST:-0}" == "1" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  BASELINE="$REPO_ROOT/docs/code-quality/baseline.json"
  fn="$1"; shift
  "$fn" "$@"
  exit $?
fi

JSON=0
if [[ "${1:-}" == "--json" ]]; then JSON=1; shift; fi
PLAN="${1:?Usage: plan-lint.sh [--json] <plan-file>}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$REPO_ROOT/docs/code-quality/baseline.json"

HARD=()   # human-readable hard-fail messages
WARN=()   # human-readable warnings
hard() { HARD+=("$1"); }
warn() { WARN+=("$1"); }

# Fail-closed: a missing plan or missing baseline is a HARD fail, not a skip.
[[ -f "$PLAN" ]]     || { echo "PLAN-LINT: FAIL — plan not found: $PLAN" >&2; exit 1; }
[[ -f "$BASELINE" ]] || { echo "PLAN-LINT: FAIL — baseline.json not found: $BASELINE" >&2; exit 1; }

# --- frontmatter extraction (first --- … --- block) ---
fm_field() {  # fm_field <key> -> value (empty if absent)
  awk -v k="$1" 'BEGIN{f=0}/^---$/{f++;next}f==1 && $0 ~ "^"k":"{sub("^"k":[ \t]*","",$0);print;exit}' "$PLAN" | tr -d '\r'
}

# === F1/F2: frontmatter completeness ===
for key in title ticket_id domains status; do
  [[ -n "$(fm_field "$key")" ]] || hard "F1: frontmatter missing required key '$key'"
done
dom="$(fm_field domains | tr -d ' \t\r')"
case "$dom" in ""|"[]"|"null") hard "F2: domains is empty (role injection needs it)";; esac

# === STRUCT1: plan-shaped (Implementation Plan header + File Structure section) ===
grep -qE '^#.*Implementation Plan' "$PLAN" || hard "STRUCT1: missing '# … Implementation Plan' header"
grep -qiE '^#+ +File Structure' "$PLAN" || hard "STRUCT1: missing 'File Structure' section"

# === STRUCT2: at least one failing-test step (test invocation + expect FAIL) ===
# Look for a step that runs a test AND a line asserting failure (FAIL/rot/exit 1).
if grep -qiE 'expected:? *fail|verify (it|test).*fail|to verify (it|they) fail' "$PLAN"; then
  :
else
  hard "STRUCT2: no task contains a failing-test step (run a test + expect FAIL)"
fi

# === STRUCT3: final verify task lists the three mandatory gate commands ===
# Per the linter contract: test:changed (NOT test:all), freshness:regenerate, freshness:check.
grep -qE 'task[[:space:]]+test:changed'         "$PLAN" || hard "STRUCT3: verify task missing 'task test:changed'"
grep -qE 'task[[:space:]]+freshness:regenerate' "$PLAN" || hard "STRUCT3: verify task missing 'task freshness:regenerate'"
grep -qE 'task[[:space:]]+freshness:check'      "$PLAN" || hard "STRUCT3: verify task missing 'task freshness:check'"

# === P1: no open placeholders in the plan body (outside code fences) ===
# Strip fenced code blocks first so example snippets don't false-positive,
# then look for placeholder tokens.
PLAN_PROSE="$(awk 'BEGIN{inf=0}/^```/{inf=!inf;next}inf==0{print}' "$PLAN")"
if grep -nE '\b(TBD|TODO|FIXME)\b|\?\?\?|<ausfüllen>|similar to Task [0-9]' <<<"$PLAN_PROSE" >/dev/null; then
  hard "P1: open placeholder found (TBD/TODO/FIXME/???/'similar to Task N')"
fi

# === B1a/B1b: per-file budget integrity + strategy ===
# Extract (path, claimed_budget) pairs from table rows and 'Budget <N>' prose.
# Table row:  | `path` | <ist> | <budget> |
# Prose:      `path` ... Budget <N>
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  # skip files that don't exist on disk (planned-new files have no live wc -l)
  [[ -f "$REPO_ROOT/$path" ]] || continue
  computed="$(residual_budget "$path")"
  # find a claimed budget for this exact path anywhere in the plan
  claimed="$(grep -oE "\`$(printf '%s' "$path" | sed 's/[.[*^$/]/\\&/g')\`[^|]*\|[^|]*\| *-?[0-9]+ *\||\`$(printf '%s' "$path" | sed 's/[.[*^$/]/\\&/g')\`[^0-9]*Budget *-?[0-9]+" "$PLAN" 2>/dev/null | grep -oE -- '-?[0-9]+' | tail -1 || true)"
  if [[ -n "$claimed" && -n "$computed" && "$claimed" != "$computed" ]]; then
    hard "B1a: $path claims budget $claimed but computed effective budget is $computed"
  fi
  if [[ -n "$computed" && "$computed" -le 0 ]]; then
    # B1b: only warn when no split/shrink step is planned for this file.
    if ! grep -qiE "split|extract|verkleiner|shrink|aufteil" "$PLAN"; then
      warn "B1b: $path residual budget $computed ≤ 0 and no split/shrink step planned"
    fi
  fi
done < <(grep -oE '`[A-Za-z0-9_./-]+\.(sh|bash|ts|tsx|js|jsx|mjs|mts|cjs|py|svelte|astro|java|php)`' "$PLAN" | tr -d '`' | sort -u)

# === verdict ===
emit_verdict() {
  local n_hard=${#HARD[@]} n_warn=${#WARN[@]}
  if [[ $JSON -eq 1 ]]; then
    printf '{"verdict":"%s","hard":[' "$([[ $n_hard -eq 0 ]] && echo PASS || echo FAIL)"
    local first=1 m
    for m in "${HARD[@]:-}"; do [[ -z "$m" ]] && continue; [[ $first -eq 1 ]] || printf ','; printf '%s' "$(printf '%s' "$m" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; first=0; done
    printf '],"warn":['
    first=1
    for m in "${WARN[@]:-}"; do [[ -z "$m" ]] && continue; [[ $first -eq 1 ]] || printf ','; printf '%s' "$(printf '%s' "$m" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; first=0; done
    printf ']}\n'
  else
    local m
    for m in "${HARD[@]:-}"; do [[ -n "$m" ]] && echo "✗ $m"; done
    for m in "${WARN[@]:-}"; do [[ -n "$m" ]] && echo "⚠ $m"; done
    echo "PLAN-LINT: $([[ $n_hard -eq 0 ]] && echo PASS || echo FAIL) ($n_hard hard, $n_warn warn)"
  fi
  [[ $n_hard -eq 0 ]]
}

emit_verdict
