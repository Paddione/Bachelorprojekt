#!/usr/bin/env bash
# scripts/plan-lint.sh — deterministic, fail-closed implementation-plan linter.
# Usage: scripts/plan-lint.sh [--json] <plan-file>
# Exit 1 = at least one HARD fail (gate). Exit 0 = pass (warnings allowed).
# Pure CLI: reads plan markdown + docs/code-quality/baseline.json + live `wc -l`.
set -euo pipefail

# --- B1 budget math (pure; unit-tested via the PLAN_LINT_SELFTEST hook) ---
# Per-extension line limits come from docs/code-quality/gates.yaml (s1.limits) — the
# SAME source the CI quality gate reads, so the linter and the gate can never drift
# (T001791 #1). A hardcoded map remains only as a fail-safe fallback for environments
# where yq or the file is unavailable; gates.yaml wins whenever it is present.
declare -A _S1_LIMITS
_load_s1_limits() {
  [[ "${_S1_LIMITS_LOADED:-0}" == "1" ]] && return 0
  _S1_LIMITS_LOADED=1
  local gates="${REPO_ROOT:-.}/docs/code-quality/gates.yaml" ext lim
  if [[ -f "$gates" ]] && command -v yq >/dev/null 2>&1; then
    while IFS=$'\t' read -r ext lim; do
      [[ -n "$ext" ]] && _S1_LIMITS["$ext"]="$lim"
    done < <(yq -r '.s1.limits | to_entries | .[] | [.key, .value] | @tsv' "$gates" 2>/dev/null)
  fi
  # Fail-safe fallback — only fills extensions gates.yaml did not provide.
  local kv k v
  for kv in .astro=400 .tsx=400 .java=400 .php=400 \
            .ts=600 .js=600 .jsx=600 .py=600 \
            .svelte=500 .sh=500 .mjs=500 .mts=500 \
            .bash=300 .cjs=200; do
    k="${kv%%=*}"; v="${kv#*=}"
    [[ -z "${_S1_LIMITS[$k]:-}" ]] && _S1_LIMITS["$k"]="$v"
  done
  return 0  # the final [[ ]] above may be false; never let that fail the loader under set -e
}
_ext_limit() {  # _ext_limit <path> -> static limit (0 = ungated extension)
  _load_s1_limits
  local ext=".${1##*.}"
  echo "${_S1_LIMITS[$ext]:-0}"
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

# === STRUCT2: at least one failing-test step (fail phrase + a real test-runner) ===
# The phrase alone is cheap to fake and is pre-seeded by the `openspec propose`
# skeleton, so we ALSO require an actual test-runner invocation (bats/vitest/pytest/…).
# The final `task test:*` gate does NOT count — every plan has it for STRUCT3 (T001791 #2).
if grep -qiE 'expected:? *fail|verify (it|test).*fail|to verify (it|they) fail' "$PLAN"; then
  if grep -qiE '\b(bats|vitest|pytest|jest|mocha|go test|playwright test)\b' "$PLAN"; then
    :
  else
    hard "STRUCT2: failing-test phrase present but no test-runner invocation (bats/vitest/pytest/…) — the final 'task test:*' gate does not count as the failing test"
  fi
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
# then look for placeholder tokens. Inline-code spans (`...`) are also stripped so
# a literal token quoted as code (e.g. a `TODO` placeholder mentioned in prose) is
# not flagged — only an UNQUOTED placeholder left in real prose is a hard fail.
PLAN_PROSE="$(awk 'BEGIN{inf=0}/^```/{inf=!inf;next}inf==0{print}' "$PLAN")"
PLAN_PROSE_NOCODE="$(sed 's/`[^`]*`//g' <<<"$PLAN_PROSE")"
if grep -nE '\b(TBD|TODO|FIXME)\b|\?\?\?|<ausfüllen>|similar to Task [0-9]' <<<"$PLAN_PROSE_NOCODE" >/dev/null; then
  hard "P1: open placeholder found (TBD/TODO/FIXME/???/'similar to Task N')"
fi

# === B1a/B1b: per-file budget integrity + strategy ===
# Scanned on FENCE-STRIPPED prose so reproduced fixture tables inside ```code```
# blocks never count as a real self-reported budget. A claimed budget is only read
# from a DELIBERATE, unambiguous form:
#   - simple 3-column table row:  | `path` | <ist-num> | <budget-num> |
#       (the wide Pre-flight table has non-numeric cells after the path → no match)
#   - explicit labelled prose:    `path` … (Budget|Restbudget|budget) <N>
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  # skip files that don't exist on disk (planned-new files have no live wc -l)
  [[ -f "$REPO_ROOT/$path" ]] || continue
  computed="$(residual_budget "$path")"
  esc="$(printf '%s' "$path" | sed 's/[.[*^$/]/\\&/g')"
  # 3-column table form: capture the LAST numeric cell on a row that is exactly
  # `| \`path\` | <num> | <num> |` (ist then budget). The wide Pre-flight table
  # row begins `| \`path\` | \`.sh\` / 500 | …` → 2nd cell non-numeric → no match.
  claimed="$(grep -oE "\| *\`$esc\` *\| *-?[0-9]+ *\| *-?[0-9]+ *\|" <<<"$PLAN_PROSE" 2>/dev/null \
            | grep -oE -- '-?[0-9]+' | tail -1 || true)"
  # explicit labelled prose form (only if no table claim found)
  if [[ -z "$claimed" ]]; then
    claimed="$(grep -oE "\`$esc\`.{0,60}(Budget|Restbudget|budget) *-?[0-9]+" <<<"$PLAN_PROSE" 2>/dev/null \
              | grep -oE -- '-?[0-9]+' | tail -1 || true)"
  fi
  if [[ -n "$claimed" && -n "$computed" && "$claimed" != "$computed" ]]; then
    hard "B1a: $path claims budget $claimed but computed effective budget is $computed"
  fi
  if [[ -n "$computed" && "$computed" -le 0 ]]; then
    # B1b: only warn when no split/shrink step is planned for this file.
    if ! grep -qiE "split|extract|verkleiner|shrink|aufteil" "$PLAN"; then
      warn "B1b: $path residual budget $computed ≤ 0 and no split/shrink step planned"
    fi
  fi
done < <(grep -oE '`[A-Za-z0-9_./-]+\.(sh|bash|ts|tsx|js|jsx|mjs|mts|cjs|py|svelte|astro|java|php)`' <<<"$PLAN_PROSE" | tr -d '`' | sort -u)

# === W1: Vitest advisory — website/src .ts/.svelte/.astro files without a test mention ===
# If the plan lists website/src lib or API files but never mentions vitest/test, warn.
if grep -qE '`website/src/(lib|pages/api)/[^`]+\.(ts|svelte|astro)`' <<<"$PLAN_PROSE"; then
  if ! grep -qiE 'vitest|\.test\.ts|__tests__|test:inventory' <<<"$PLAN_PROSE"; then
    warn "W1: plan touches website/src lib/api files but mentions no Vitest test — add a test task or a '<!-- vitest: kein neuer Test nötig, weil … -->' comment"
  fi
fi

# === W2: CQ02 advisory — new `any` usage planned in website/src ===
# Warn if the plan's prose or code snippets suggest introducing `: any` / `as any`.
if grep -qE ': any\b|as any\b|<any>' "$PLAN"; then
  warn "W2: plan contains explicit 'any' usage — review CQ02 gate (limit ≤200 in website/src); ensure no net increase"
fi

# === W3: File-Structure ↔ tasks cross-check (advisory) ===
# A source file listed in `## File Structure` that no later task references is drift —
# a stale entry, or a task that forgot to name its file (T001791 #3). One direction only
# (File Structure → tasks); the reverse is noisy (tasks name incidental helpers/runners).
# Section boundary is the next H2 (`## `), so H3 sub-groupings inside File Structure
# (### New files / ### Changed files) stay part of the section.
FS_SECTION="$(awk '/^##[[:space:]]+File Structure/{f=1;next} f&&/^##[[:space:]]/{exit} f{print}' "$PLAN")"
PLAN_OUTSIDE_FS="$(awk '/^##[[:space:]]+File Structure/{infs=1;next} infs&&/^##[[:space:]]/{infs=0} infs{next} {print}' "$PLAN")"
while IFS= read -r ftok; do
  [[ -n "$ftok" ]] || continue
  # Match by BASENAME: File Structure lists full paths, but task prose idiomatically
  # references the same file by its basename (e.g. FS `website/src/x/Foo.svelte`, task
  # "migrate `Foo.svelte`"). A full-path match would false-positive on nearly every plan.
  grep -qF -- "${ftok##*/}" <<<"$PLAN_OUTSIDE_FS" || warn "W3: \`$ftok\` is listed in File Structure but no task references it"
done < <(grep -oE '`[A-Za-z0-9_./-]+\.(sh|bash|ts|tsx|js|jsx|mjs|mts|cjs|py|svelte|astro|java|php|css)`' <<<"$FS_SECTION" | tr -d '`' | sort -u)

# === G1: granularity warning — a single task touching >3 files (warn only) ===
# Count `path` tokens inside each "## Task" block; warn if any block lists >3. Only
# count AFTER the first Task heading (started==1) so the `## File Structure` list — which
# legitimately enumerates every changed file — is never mistaken for a phantom task
# (T001791 #5: the old version emitted a spurious empty-titled G1 for that list).
while IFS= read -r g; do warn "${g/G1:/G1: }"; done < <(awk '
  BEGIN{ n=0; task=""; started=0 }
  /^#+[[:space:]]+Task /{ if (started && n>3) print "G1:" task " touches " n " files"; task=$0; n=0; started=1; next }
  started && /`[A-Za-z0-9_./-]+\.[a-z]+`/{ for(i=1;i<=NF;i++) if($i ~ /`.*\..*`/) n++ }
  END{ if (started && n>3) print "G1:" task " touches " n " files" }
' "$PLAN")

# === verdict ===
# Pure-bash JSON string escaper (no python3 fork). Escapes \ and " and the few
# control chars that can appear; valid UTF-8 (e.g. ≤) passes through unchanged.
_json_str() {
  local s="$1"
  s="${s//\\/\\\\}"   # backslash first
  s="${s//\"/\\\"}"   # double quote
  s="${s//$'\t'/\\t}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  printf '"%s"' "$s"
}

emit_verdict() {
  local n_hard=${#HARD[@]} n_warn=${#WARN[@]}
  if [[ $JSON -eq 1 ]]; then
    printf '{"verdict":"%s","hard":[' "$([[ $n_hard -eq 0 ]] && echo PASS || echo FAIL)"
    local first=1 m
    for m in "${HARD[@]:-}"; do [[ -z "$m" ]] && continue; [[ $first -eq 1 ]] || printf ','; _json_str "$m"; first=0; done
    printf '],"warn":['
    first=1
    for m in "${WARN[@]:-}"; do [[ -z "$m" ]] && continue; [[ $first -eq 1 ]] || printf ','; _json_str "$m"; first=0; done
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
