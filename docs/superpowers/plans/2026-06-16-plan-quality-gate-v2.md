---
title: Plan-Quality-Gate v2 Implementation Plan
ticket_id: T000910
domains: [factory, pm, infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan-Quality-Gate v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, fail-closed Bash plan-linter (`scripts/plan-lint.sh`) as the first non-bypassable quality gate for implementation plans, enforce the frontmatter schema structurally, and wire the linter into all four plan-producing paths (dev-flow-plan, dev-flow-batch, Factory, dev-flow-chore).

**Architecture:** `plan-lint.sh` is a pure CLI (plan path in → verdict out, no DB/cluster/net) that runs offline in CI. It recomputes every self-reported S1 line-budget against `docs/code-quality/baseline.json` + live `wc -l` and **hard-fails on a contradictory number** (B1a), warns on a zero/negative residual budget without a split step (B1b). The existing DeepSeek LLM-QA (`plan-qa-check.sh`) stays advisory (never breaks). Frontmatter enforcement in `scripts/vda/frontmatter.sh` repairs the silent `plan-context.sh` empty-`title:` injection structurally.

**Tech Stack:** Bash (strict mode), `jq`, `awk`, `grep`, BATS (bats-core submodule), go-task.

---

## Pre-flight: Quality-Gate budgets for files this plan touches

Per `.claude/skills/references/plan-quality-gates.md`, both the live `wc -l` and the baseline-effective threshold were measured for every file this plan changes:

| File | Ext / limit | Ist (wc -l) | Baseline (`S1:<pfad>`) | Effective threshold | Residual budget | Strategy |
|------|-------------|-------------|------------------------|---------------------|-----------------|----------|
| `scripts/plan-lint.sh` (**new**) | `.sh` / 500 | 0 | nicht-baselined | 500 | ≤500 | New file — must finish well under 500 (target ≤ ~360, growth reserve under the 80 %≈400 line). If it would exceed, extract pure helpers into `scripts/plan-lint-lib.sh` (sourced). |
| `scripts/vda/frontmatter.sh` | `.sh` / 500 | 212 | nicht-baselined | 500 | ~283 | Small additive validation block; stays far under limit. |
| `scripts/plan-context.sh` | `.sh` / 500 | 34 | nicht-baselined | 500 | ~466 | **Not modified** — the `title:` bug is fixed structurally by frontmatter enforcement (Component 2). No code change needed. |
| `scripts/factory/pipeline.js` | `.js` / 600 | 599 | **S1-ignored** (gates.yaml `s1.ignore`) | n/a | n/a | pipeline.js is a sanctioned S1 exception (monolithic Workflow script). No line-budget gate, but FA-SF-20 structural-invariant test still applies — keep the shell-out minimal. |
| `Taskfile.yml` | `.yml` | 4662 | not in `s1.limits` (no `.yml` limit) | n/a | n/a | `.yml` has no S1 line limit; only additive task entries. |
| `.claude/skills/dev-flow-plan/SKILL.md` | `.md` | 449 | not in `s1.limits` | n/a | n/a | `.md` has no S1 line limit. Markdown edits only. |
| `.claude/skills/dev-flow-batch/SKILL.md` | `.md` | 252 | not in `s1.limits` | n/a | n/a | Markdown edits only. |
| `.claude/skills/dev-flow-chore/SKILL.md` | `.md` | 120 | not in `s1.limits` | n/a | n/a | Markdown edits only. |
| `tests/unit/plan-lint.bats` (**new**) | `.bats` | 0 | — | — (`.bats` not in `s1.limits`) | — | New test file. |
| `tests/unit/fixtures/plan-lint/*.md` (**new**) | `.md` fixtures | 0 | — | not in S1 scan-paths (`tests/**` excluded) | — | Fixtures live under `tests/` → outside the repo-index scan universe → no S4 orphan risk. |

**S2 (import cycles):** N/A — `plan-lint.sh` is a Bash script; the import-cycle graphs are tsconfig-based (`website`, `arena-server`, `e2e`) and do not include Bash. Helper extraction (if needed) is a sourced pure module with no back-import.

**S3 (hardcoded hostnames):** No `*.mentolder.de` / `*.korczewski.de` literals appear in any snippet below. The linter reads only plan markdown + baseline JSON.

**S4 (orphan scripts/manifests):** `scripts/plan-lint.sh` is referenced by Taskfile (`test:unit:plan-lint` runs the bats which calls it), by `pipeline.js`, and by the three dev-flow SKILL.md files — so it is reachable, not orphaned. `tests/unit/plan-lint.bats` is wired into `task test:unit` (Task 8) so the `unit-coverage-guard.sh` passes.

---

## File Structure

- **Create `scripts/plan-lint.sh`** — the deterministic linter CLI. Single responsibility: read a plan path, run all checks (F1/F2/STRUCT1-3/P1/B1a/B1b/G1), print a table + verdict line, exit 1 on any hard fail. `--json` emits `{verdict, hard, warn}`. The B1 budget computation is an internal pure function `compute_effective_threshold` / `compute_residual_budget`.
- **Modify `scripts/vda/frontmatter.sh`** — add a `--validate` mode that exits 1 when any of `title`/`ticket_id`/`domains`/`status` is missing, and auto-fills a missing `title:` from the first `# ` H1.
- **Create `tests/unit/plan-lint.bats`** — BATS suite (offline-safe) driving the linter against fixtures.
- **Create `tests/unit/fixtures/plan-lint/`** — good + broken plan fixtures.
- **Modify `scripts/factory/pipeline.js`** — Plan phase: shell-out to `plan-lint.sh --json` after plan generation; one fix iteration on FAIL, else block enqueue + ticket comment.
- **Modify three `.claude/skills/dev-flow-*/SKILL.md`** — wire the linter into each path.
- **Modify `Taskfile.yml`** — add `test:unit:plan-lint` and register it in `test:unit`.

---

## Task 1: `plan-lint.sh` skeleton + frontmatter checks (F1, F2)

**Files:**
- Create: `scripts/plan-lint.sh`
- Create: `tests/unit/plan-lint.bats`
- Create: `tests/unit/fixtures/plan-lint/good.md`
- Create: `tests/unit/fixtures/plan-lint/missing-title.md`

- [x] **Step 1: Write the good + missing-title fixtures**

Create `tests/unit/fixtures/plan-lint/good.md`. This is the canonical PASS fixture reused by later tasks — it must satisfy every hard check (F1/F2, STRUCT1-3, P1, B1a):

```markdown
---
title: Good Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Good Plan Implementation Plan

**Goal:** Demonstrate a passing plan.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

**Files:**
- Modify: `scripts/example.sh`

- [x] **Step 1: Write the failing test**

```bash
@test "example" { run bash scripts/example.sh; [ "$status" -eq 0 ]; }
```

- [x] **Step 2: Run test to verify it fails**

Run: `bats tests/unit/example.bats`
Expected: FAIL with "command not found"

## Task 2: Verify

- [ ] **Step 1: Run the full gate**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

Create `tests/unit/fixtures/plan-lint/missing-title.md` — identical body, but the frontmatter omits `title:`:

```markdown
---
ticket_id: T000910
domains: [infra]
status: active
---

# Missing Title Implementation Plan

**Goal:** Demonstrate an F1 failure.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

- [x] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [x] **Step 2: Run test to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

- [ ] **Step 2: Write the failing BATS test**

Create `tests/unit/plan-lint.bats`:

```bash
#!/usr/bin/env bats
# Tests for scripts/plan-lint.sh — the deterministic fail-closed plan linter.
# Offline-safe: reads only plan markdown + docs/code-quality/baseline.json + wc -l.

setup() {
  LINT="$BATS_TEST_DIRNAME/../../scripts/plan-lint.sh"
  FIX="$BATS_TEST_DIRNAME/fixtures/plan-lint"
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "good plan passes (exit 0, PASS verdict)" {
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'PLAN-LINT: PASS'
}

@test "F1: missing title: is a hard fail (exit 1)" {
  run bash "$LINT" "$FIX/missing-title.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'F1'
  echo "$output" | grep -q 'PLAN-LINT: FAIL'
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: FAIL — `scripts/plan-lint.sh` does not exist (`No such file or directory`).

- [ ] **Step 4: Write the minimal linter (skeleton + F1/F2)**

Create `scripts/plan-lint.sh`:

```bash
#!/usr/bin/env bash
# scripts/plan-lint.sh — deterministic, fail-closed implementation-plan linter.
# Usage: scripts/plan-lint.sh [--json] <plan-file>
# Exit 1 = at least one HARD fail (gate). Exit 0 = pass (warnings allowed).
# Pure CLI: reads plan markdown + docs/code-quality/baseline.json + live `wc -l`.
set -euo pipefail

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
```

Make it executable:

```bash
chmod +x scripts/plan-lint.sh
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS (2 tests) — good fixture passes F1/F2, missing-title fixture hard-fails F1.

- [ ] **Step 6: Commit**

```bash
git add scripts/plan-lint.sh tests/unit/plan-lint.bats tests/unit/fixtures/plan-lint/good.md tests/unit/fixtures/plan-lint/missing-title.md
git commit -m "feat(plan-lint): skeleton + F1/F2 frontmatter checks [T000?]"
```

---

## Task 2: Structural checks STRUCT1, STRUCT2, STRUCT3

**Files:**
- Modify: `scripts/plan-lint.sh`
- Modify: `tests/unit/plan-lint.bats`
- Create: `tests/unit/fixtures/plan-lint/missing-verify.md`

- [x] **Step 1: Write the missing-verify fixture**

Create `tests/unit/fixtures/plan-lint/missing-verify.md` — a full plan whose final task omits `task freshness:check`:

```markdown
---
title: No Verify Plan
ticket_id: T000910
domains: [infra]
status: active
---

# No Verify Implementation Plan

**Goal:** Demonstrate a STRUCT3 failure.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

- [x] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [x] **Step 2: Run test to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [x] **Step 1**

```bash
task test:changed
task freshness:regenerate
```
```

- [x] **Step 2: Write the failing BATS tests**

Append to `tests/unit/plan-lint.bats`:

```bash
@test "STRUCT3: missing 'task freshness:check' in verify task is a hard fail" {
  run bash "$LINT" "$FIX/missing-verify.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'STRUCT3'
}

@test "STRUCT3 requires test:changed not test:all (consistency with linter contract)" {
  # good.md uses 'task test:changed' and must pass STRUCT3
  run bash "$LINT" "$FIX/good.md"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 3: Run to verify the STRUCT3 test fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: the `missing-verify` test FAILS (linter still exits 0 — no STRUCT checks yet).

- [x] **Step 4: Add STRUCT1/STRUCT2/STRUCT3 to `scripts/plan-lint.sh`**

Insert before the `# === verdict ===` block:

```bash
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
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS (4 tests).

- [x] **Step 6: Commit**

```bash
git add scripts/plan-lint.sh tests/unit/plan-lint.bats tests/unit/fixtures/plan-lint/missing-verify.md
git commit -m "feat(plan-lint): STRUCT1/2/3 structural checks [T000?]"
```

---

## Task 3: Placeholder check P1

**Files:**
- Modify: `scripts/plan-lint.sh`
- Modify: `tests/unit/plan-lint.bats`
- Create: `tests/unit/fixtures/plan-lint/placeholder-todo.md`

- [x] **Step 1: Write the placeholder fixture**

Create `tests/unit/fixtures/plan-lint/placeholder-todo.md` — a full passing-shaped plan but with a `TODO` placeholder in a task body:

```markdown
---
title: Placeholder Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Placeholder Implementation Plan

**Goal:** Demonstrate a P1 failure.

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Do the thing

- [x] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [x] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

- [x] **Step 3: Implement**

TODO: fill in the implementation here

## Task 2: Verify

- [x] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

- [x] **Step 2: Write the failing BATS test**

Append to `tests/unit/plan-lint.bats`:

```bash
@test "P1: a TODO placeholder in a task body is a hard fail" {
  run bash "$LINT" "$FIX/placeholder-todo.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'P1'
}
```

- [x] **Step 3: Run to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: the P1 test FAILS (linter exits 0 — no P1 check yet).

- [x] **Step 4: Add P1 to `scripts/plan-lint.sh`**

Insert before the verdict block. Scan the plan **body** (skip fenced code blocks so a fixture's literal `@test` etc. are fine, but catch placeholders in prose). Match the placeholder tokens case-sensitively where they are conventionally upper-case:

```bash
# === P1: no open placeholders in the plan body (outside code fences) ===
# Strip fenced code blocks first so example snippets don't false-positive,
# then look for placeholder tokens.
PLAN_PROSE="$(awk 'BEGIN{inf=0}/^```/{inf=!inf;next}inf==0{print}' "$PLAN")"
if grep -nE '\b(TBD|TODO|FIXME)\b|\?\?\?|<ausfüllen>|similar to Task [0-9]' <<<"$PLAN_PROSE" >/dev/null; then
  hard "P1: open placeholder found (TBD/TODO/FIXME/???/'similar to Task N')"
fi
```

> Note: stripping code fences means a placeholder hidden *inside* a code block is intentionally not flagged — the goal is to catch unfinished prose/steps, and code-block contents are real code an engineer will paste.

- [x] **Step 5: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS (5 tests) — note the `good.md` fixture must still pass (it has no bare placeholder tokens in prose; "good fixture passes" test stays green).

- [x] **Step 6: Commit**

```bash
git add scripts/plan-lint.sh tests/unit/plan-lint.bats tests/unit/fixtures/plan-lint/placeholder-todo.md
git commit -m "feat(plan-lint): P1 placeholder check [T000?]"
```

---

## Task 4: B1 budget computation — pure, individually tested function

This is the **core** of the linter. The budget math is its own function so it can be unit-tested in isolation, exactly as the spec demands.

**B1 contract (from the spec + plan-quality-gates.md):**
- `limit` = static extension limit (parsed from baseline `detail` if the file is baselined, else from `gates.yaml` extension table; the linter hardcodes the same table — see note below).
- `effektive_schwelle = max(limit, baseline.metric)` — the ratchet freezes on the grown value.
- `restbudget = effektive_schwelle − wc -l(<datei>)`.
- **B1a (hard):** a plan that self-reports a budget number contradicting the linter's computed value → FAIL with the diff.
- **B1b (warn):** `restbudget ≤ 0` and no split/shrink step → warning.

**Files:**
- Modify: `scripts/plan-lint.sh`
- Modify: `tests/unit/plan-lint.bats`
- Create: `tests/unit/fixtures/plan-lint/wrong-budget.md`
- Create: `tests/unit/fixtures/plan-lint/over-threshold.md`

- [x] **Step 1: Add the testable budget function to `scripts/plan-lint.sh`**

Insert near the top (after `BASELINE=` is defined, before the checks). Note: the extension-limit table mirrors `docs/code-quality/gates.yaml` `s1.limits`; if it drifts, the FA-SF-style contract is that gates.yaml is the SSOT — keep them in sync (a follow-up could parse gates.yaml, but YAGNI for now since the table is stable):

```bash
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
```

Add a self-test hook at the very top of the script (right after `set -euo pipefail`) so the pure functions can be exercised without running the whole linter:

```bash
# Self-test hook: `PLAN_LINT_SELFTEST=1 plan-lint.sh <fn> <args...>` runs one
# pure function and prints its result — keeps the budget math unit-testable.
if [[ "${PLAN_LINT_SELFTEST:-0}" == "1" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  BASELINE="$REPO_ROOT/docs/code-quality/baseline.json"
  fn="$1"; shift
  "$fn" "$@"
  exit $?
fi
```

> The self-test hook must appear **before** the argument parsing that consumes `$1` as the plan path, and the `_ext_limit`/`effective_threshold`/`residual_budget` definitions must be sourced before it can call them. Place the function definitions immediately after `set -euo pipefail`, then the self-test hook, then the normal `--json`/plan-path parsing.

- [x] **Step 2: Write the failing budget-math BATS tests**

Append to `tests/unit/plan-lint.bats`. These call the pure functions directly:

```bash
@test "B1 math: ungated extension (.md) -> effective threshold 0" {
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "docs/foo.md"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "B1 math: unbaselined .sh -> effective threshold = static 500" {
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "scripts/never-baselined-xyz.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "500" ]
}

@test "B1 math: baselined file uses max(limit, baseline.metric)" {
  # scripts/backup-restore.sh is baselined at 1037 (> 500 .sh limit) in baseline.json
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" effective_threshold "scripts/backup-restore.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "1037" ]
}

@test "B1 math: residual_budget = threshold - wc -l on a live file" {
  # plan-context.sh is 34 lines, unbaselined .sh -> 500 - 34 = 466
  run env PLAN_LINT_SELFTEST=1 bash "$LINT" residual_budget "scripts/plan-context.sh"
  [ "$status" -eq 0 ]
  [ "$output" = "466" ]
}
```

- [x] **Step 3: Run to verify the budget tests pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS — the four math tests now pass (functions exist + self-test hook works). The B1a/B1b *integration* fixtures don't exist yet; that's the next step.

> If the `residual_budget` test is brittle because `scripts/plan-context.sh` line count changes, recompute the expected value with `wc -l scripts/plan-context.sh` and update the literal — but per this plan `plan-context.sh` is **not** modified, so 34→466 holds.

- [x] **Step 4: Write the B1a + B1b integration fixtures**

Create `tests/unit/fixtures/plan-lint/wrong-budget.md` — claims a budget for a real file that contradicts the computed value. Use `scripts/plan-context.sh` (34 lines, threshold 500 → real budget 466). The plan lies and says budget 999:

```markdown
---
title: Wrong Budget Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Wrong Budget Implementation Plan

**Goal:** Demonstrate a B1a failure.

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/plan-context.sh` | 34 | 999 |

## Task 1: Edit

- [x] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [x] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [x] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

Create `tests/unit/fixtures/plan-lint/over-threshold.md` — references a file whose live size already exceeds its effective threshold (residual ≤ 0) and provides **no** split step. Use `scripts/backup-restore.sh` (1037 lines, baseline 1037 → residual 0):

```markdown
---
title: Over Threshold Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Over Threshold Implementation Plan

**Goal:** Demonstrate a B1b warning (still exit 0).

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/backup-restore.sh` | 1037 | 0 |

## Task 1: Edit

- [x] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [x] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [x] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

- [x] **Step 5: Write the failing B1a/B1b integration tests**

Append to `tests/unit/plan-lint.bats`:

```bash
@test "B1a: a self-reported budget contradicting the computed value is a hard fail" {
  run bash "$LINT" "$FIX/wrong-budget.md"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q 'B1a'
}

@test "B1b: file over its effective threshold without a split step warns (exit 0)" {
  run bash "$LINT" "$FIX/over-threshold.md"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'B1b'
  echo "$output" | grep -qE 'PLAN-LINT: PASS \([0-9]+ hard, [1-9]'
}
```

- [x] **Step 6: Run to verify they fail**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: the B1a + B1b tests FAIL (no B1 integration scanning yet).

- [x] **Step 7: Add the B1a/B1b plan-scan logic to `scripts/plan-lint.sh`**

Insert before the verdict block. Parse claimed budgets from `File`/`Files:` lines and S1 tables. The recognised forms are a markdown table row `| \`<path>\` | <ist> | <budget> |` and a prose form `<path> … Budget <N>`:

```bash
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
```

> The `grep`/`sed` path-escaping handles the `.`/`/` in paths. The claimed-budget regex tolerates both the table form and the prose form; `tail -1` takes the last number on the matched fragment (the budget column). If parsing a claimed budget is ambiguous, the linter only fails on a clear contradiction — when no number is parsed, B1a stays silent (the missing-budget case is a G1/manual concern, not a hard fail).

- [x] **Step 8: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS — B1a fixture hard-fails, B1b fixture warns (exit 0, warn ≥ 1). Verify `good.md` still PASSes (it references `scripts/example.sh` which does **not** exist on disk → skipped, so no false B1a).

- [x] **Step 9: Commit**

```bash
git add scripts/plan-lint.sh tests/unit/plan-lint.bats tests/unit/fixtures/plan-lint/wrong-budget.md tests/unit/fixtures/plan-lint/over-threshold.md
git commit -m "feat(plan-lint): B1a budget-integrity hard-fail + B1b strategy warning [T000?]"
```

---

## Task 5: Granularity warning G1 + `--json` verification

**Files:**
- Modify: `scripts/plan-lint.sh`
- Modify: `tests/unit/plan-lint.bats`

- [ ] **Step 1: Write the failing tests (G1 + JSON shape)**

Append to `tests/unit/plan-lint.bats`:

```bash
@test "--json emits a parseable verdict object for a passing plan" {
  run bash "$LINT" --json "$FIX/good.md"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="PASS"; assert isinstance(d["hard"],list); assert isinstance(d["warn"],list)'
}

@test "--json emits FAIL verdict with hard array for a broken plan" {
  run bash "$LINT" --json "$FIX/missing-title.md"
  [ "$status" -eq 1 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="FAIL"; assert len(d["hard"])>=1'
}
```

- [ ] **Step 2: Run to verify**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: the two JSON tests PASS already (the `--json` path was built in Task 1). If they pass, G1 is the only remaining check — proceed to add it. (This step confirms the JSON contract Factory relies on is stable.)

- [ ] **Step 3: Add G1 (granularity warning) to `scripts/plan-lint.sh`**

Insert before the verdict block. G1 is a soft heuristic — count `target_files`/`Files:` entries per task and warn if a task lists >3 files. Keep it conservative to avoid false positives:

```bash
# === G1: granularity warning — a single task touching >3 files (warn only) ===
# Count `path` tokens inside each "## Task" block; warn if any block lists >3.
awk '
  /^#+ +Task /{ if (n>3) print "G1:" task " touches " n " files"; task=$0; n=0; next }
  /`[A-Za-z0-9_./-]+\.[a-z]+`/{ for(i=1;i<=NF;i++) if($i ~ /`.*\..*`/) n++ }
  END{ if (n>3) print "G1:" task " touches " n " files" }
' "$PLAN" | while IFS= read -r g; do warn "${g/G1:/G1: }"; done
```

> G1 is `warn` only — it never changes the exit code. The awk pass is best-effort; over-counting a few inline path mentions is acceptable for a warning.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats`
Expected: PASS (all tests). `good.md` still PASS (its tasks list ≤3 files).

- [ ] **Step 5: Commit**

```bash
git add scripts/plan-lint.sh tests/unit/plan-lint.bats
git commit -m "feat(plan-lint): G1 granularity warning + --json contract tests [T000?]"
```

---

## Task 6: Frontmatter-schema enforcement (Component 2)

Repair the silent `plan-context.sh` empty-`title:` injection at the source: `scripts/vda/frontmatter.sh` gets a `--validate` mode that auto-fills a missing `title:` from the first `# ` H1 and exits 1 on any still-missing required key.

**Files:**
- Modify: `scripts/vda/frontmatter.sh`
- Create: `tests/unit/fixtures/plan-lint/fm-no-title.md` (reuse the existing `frontmatter` bats? — add to `plan-frontmatter-hook.bats` instead, see below)
- Modify: `tests/unit/plan-frontmatter-hook.bats`

- [ ] **Step 1: Write the failing BATS tests**

Append to `tests/unit/plan-frontmatter-hook.bats` (the existing suite already exercises `frontmatter.sh` via the `plan-frontmatter-hook.sh` shim, so reuse `$HOOK`):

```bash
@test "--validate auto-fills a missing title from the first H1" {
  cat > "$TMP/v-no-title.md" <<'EOF'
---
ticket_id: T000910
domains: [infra]
status: active
---

# Derived Title Plan

Touches k3d/ manifests.
EOF
  run bash "$HOOK" --validate "$TMP/v-no-title.md"
  [ "$status" -eq 0 ]
  grep -q '^title: Derived Title Plan$' "$TMP/v-no-title.md"
}

@test "--validate exits 1 when domains is missing and cannot be derived to non-empty" {
  cat > "$TMP/v-no-domains.md" <<'EOF'
---
title: Has Title
ticket_id: T000910
status: active
domains: []
---

# Has Title

Prose with no routing signals whatsoever zzz.
EOF
  run bash "$HOOK" --validate "$TMP/v-no-domains.md"
  [ "$status" -eq 1 ]
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-frontmatter-hook.bats`
Expected: FAIL — `--validate` is not a recognised flag yet (it would be treated as the file path → "file not found").

- [ ] **Step 3: Add `--validate` mode to `scripts/vda/frontmatter.sh`**

After the existing `--activate`/`--spec` flag parsing (around line 16-18), add:

```bash
VALIDATE_MODE=0
if [[ "${1:-}" == "--validate" ]]; then VALIDATE_MODE=1; shift; fi
```

Then, immediately after `FILE="${1:?...}"` and the `_fm_field`/`_has_frontmatter`/`title` derivation helpers are defined (i.e. near the end of the script, before the no-frontmatter `Case A`), add a `--validate` short-circuit:

```bash
# ── --validate: structural schema gate (used by the plan paths) ──
if [[ "$VALIDATE_MODE" -eq 1 ]]; then
  if ! _has_frontmatter; then
    echo "VALIDATE: $FILE has no frontmatter block" >&2; exit 1
  fi
  # Auto-fill a missing title from the first H1 (fixes the plan-context.sh empty-header bug).
  if [[ -z "$(_fm_field title)" ]]; then
    h1="$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || true)"
    [[ -n "$h1" ]] || h1="$(basename "$FILE" .md)"
    tmp="$(mktemp)"
    awk -v t="$h1" 'BEGIN{f=0;done=0}{sub(/\r$/,"")}
      NR==1 && $0=="---"{print;f=1;next}
      f==1 && $0=="---" && done==0{print "title: " t; done=1; print; f=0; next}
      {print}' "$FILE" > "$tmp"
    mv "$tmp" "$FILE"
  fi
  rc=0
  for key in title ticket_id domains status; do
    v="$(_fm_field "$key" | tr -d ' \t\r')"
    case "$v" in ""|"null") [[ "$key" == "ticket_id" ]] || { echo "VALIDATE: $FILE missing/empty '$key'" >&2; rc=1; } ;; esac
    [[ "$key" == "domains" && ( "$v" == "[]" ) ]] && { echo "VALIDATE: $FILE has empty domains []" >&2; rc=1; }
  done
  exit $rc
fi
```

> `ticket_id: null` is explicitly allowed (a slug-less plan deliberately keeps it null) — only `title`/`domains`/`status` must be non-empty/non-`[]`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-frontmatter-hook.bats`
Expected: PASS — including all pre-existing tests (the `--validate` branch is additive and short-circuits before the existing logic).

- [ ] **Step 5: Commit**

```bash
git add scripts/vda/frontmatter.sh tests/unit/plan-frontmatter-hook.bats
git commit -m "feat(frontmatter): --validate mode auto-fills title + fails closed on schema gaps [T000?]"
```

---

## Task 7: Wire the linter into the four plan-producing paths (Component 3)

These are markdown/JS edits (no S1 line-budget gate on `.md`; `pipeline.js` is S1-ignored). Each path calls `plan-lint.sh` and reacts to the exit code — no logic duplication.

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md:169-182` (Schritt 3.8)
- Modify: `.claude/skills/dev-flow-batch/SKILL.md` (Schritt 5 / Workflow plan-gen)
- Modify: `scripts/factory/pipeline.js:280-301` (Plan phase)
- Modify: `.claude/skills/dev-flow-chore/SKILL.md` (S1-Gate-Guard section ~line 73)

- [ ] **Step 1: dev-flow-plan Schritt 3.8 — linter before LLM-QA**

In `.claude/skills/dev-flow-plan/SKILL.md`, replace the Schritt 3.8 heading + intro (lines 169-175) so the deterministic linter is the hard gate and the DeepSeek QA runs after it as advisory. Edit the section to:

```markdown
### Schritt 3.8: Plan-Qualitäts-Gate (deterministischer Linter + advisory LLM-QA)

Führe ZUERST den deterministischen, fail-closed Linter auf den Plan-Pfad aus, den der
Subagent zurückgegeben hat — das ist das **harte Gate**:

```bash
bash scripts/plan-lint.sh docs/superpowers/plans/<date>-<slug>.md
```

- **PASS (Exit 0):** weiter — danach optional die advisory LLM-QA (bricht nie):
  ```bash
  bash scripts/plan-qa-check.sh docs/superpowers/plans/<date>-<slug>.md || true
  ```
- **FAIL (Exit 1):** der Linter listet die Hard-Fails (F1/F2/STRUCT/P1/B1a). Delegiere
  erneut an einen Plan-Subagenten (Schritt 3.7) mit den Hard-Fails als Korrektur-Hinweis,
  bis `plan-lint.sh` PASS liefert. KEIN Weitergehen mit rotem Linter.
```

- [ ] **Step 2: dev-flow-batch — lint each generated plan**

In `.claude/skills/dev-flow-batch/SKILL.md`, in Schritt 5 (Workflow-Script generieren), add a per-plan lint step to the Workflow pipeline instruction. After the plan-generation + frontmatter-hook step, insert:

```markdown
Nach `plan-frontmatter-hook.sh` für jeden generierten Plan das **harte Gate** laufen lassen:

```bash
bash scripts/plan-lint.sh "$plan_path"   # Exit 1 = Plan verwerfen/nachbessern, nicht stagen
```

Pläne mit rotem Linter werden NICHT in die Kommissionierung gestellt (als SKIPPED melden).
```

- [ ] **Step 3: Factory pipeline.js — `--json` shell-out + one fix iteration**

In `scripts/factory/pipeline.js`, after the Plan phase produces `planFilePath` (right after line 300 `planFilePath = plan.plan_path`), insert a lint gate. Keep it minimal (pipeline.js is the S1 exception — don't bloat it):

```javascript
  // Deterministic plan-lint gate (T000?) — fail-closed, no LLM. One fix iteration.
  const lintOnce = async (note) => agent(
    `Run the deterministic plan linter and return ONLY its stdout:
     bash ${REPO}/scripts/plan-lint.sh --json ${planFilePath}` + (note || ''),
    { label: 'plan:lint', phase: 'Plan' },
  )
  let lintOut = await lintOnce('')
  if (/"verdict"\s*:\s*"FAIL"/.test(lintOut)) {
    await agent(
      `The plan ${planFilePath} failed plan-lint with: ${String(lintOut).slice(0, 400)}.
       Fix ONLY the reported hard-fails (frontmatter/STRUCT/P1/B1a) in place, then re-run.`,
      { label: 'plan:lint-fix', phase: 'Plan' },
    )
    lintOut = await lintOnce(' (after fix iteration)')
  }
  if (/"verdict"\s*:\s*"FAIL"/.test(lintOut)) {
    await agent(
      `Plan still fails plan-lint after one fix. Block enqueue + comment the ticket:
       bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
       bash ${REPO}/scripts/ticket.sh comment --id ${A.ticket_id} --body "plan-lint FAIL: ${String(lintOut).replace(/"/g,"'").slice(0, 300)}"`,
      { label: 'plan:lint-block', phase: 'Plan' },
    )
    phaseEvent('plan', 'blocked', 'plan-lint-fail')
    return { status: 'blocked', reason: 'plan-lint-fail', lint: lintOut }
  }
```

> Verify `ticket.sh comment` exists; if the subcommand differs, use the same notify pattern as the conflict path (lines 263-273). Check with `bash scripts/ticket.sh --help` before finalising the snippet.

- [ ] **Step 4: dev-flow-chore — S1 diff-preview for code-touching chores**

In `.claude/skills/dev-flow-chore/SKILL.md`, augment the existing **S1-Gate-Guard** callout (~line 73). Chores have no plan, so lint the *diff*, not a plan. Append:

```markdown
> **Plan-Linter gibt es für Chores nicht** (kein Plan) — aber das S1-Budget der berührten
> Code-Dateien lässt sich vor dem Commit prüfen: für jede geänderte Datei den Restbudget-Wert
> mit der gleichen Mathematik wie der Linter ermitteln:
> ```bash
> for f in $(git diff --name-only); do
>   bash scripts/plan-lint.sh --json /dev/null >/dev/null 2>&1 || true   # linter is plan-scoped; for chores use the math directly:
>   PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget "$f" 2>/dev/null \
>     | awk -v f="$f" '{print f": Restbudget "$0}'
> done
> ```
> Bei Restbudget ≤ 0 die Datei **echt verkleinern**, nicht kosmetisch zusammenziehen.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-batch/SKILL.md .claude/skills/dev-flow-chore/SKILL.md scripts/factory/pipeline.js
git commit -m "feat(plan-lint): wire deterministic gate into dev-flow-plan/batch/chore + Factory [T000?]"
```

---

## Task 8: Wire BATS into go-task + verify coverage-guard (Component 4)

**Files:**
- Modify: `Taskfile.yml:249-294` (test:unit aggregation), and add an internal `test:unit:plan-lint` task

- [ ] **Step 1: Add the internal task + register it in `test:unit`**

In `Taskfile.yml`, add a new internal task next to the other `test:unit:*` entries (e.g. after `test:unit:plan-frontmatter-hook` block, near line ~444). The existing pattern is:

```yaml
  test:unit:plan-lint:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
```

Then register it in the `test:unit` task's `cmds:` list (lines 253-294) by adding under the existing entries:

```yaml
      - task: test:unit:plan-lint
```

- [ ] **Step 2: Verify the coverage-guard passes (the new bats is tracked)**

The `unit-coverage-guard.sh` fails if any `tests/unit/*.bats` is run by no task. Verify:

Run: `bash scripts/tests/unit-coverage-guard.sh`
Expected: PASS — `plan-lint.bats` is now wired (`grep -qF "plan-lint.bats" Taskfile.yml` matches).

- [ ] **Step 3: Run the full unit suite to confirm wiring**

Run: `task test:unit:plan-lint && task test:unit:coverage-guard`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "test(plan-lint): wire plan-lint.bats into task test:unit [T000?]"
```

---

## Task 9: Final verification (MANDATORY gate steps)

**Files:** none (verification only)

- [ ] **Step 1: Self-lint the plan with the new linter (dogfood)**

Run: `bash scripts/plan-lint.sh docs/superpowers/plans/2026-06-16-plan-quality-gate-v2.md`
Expected: `PLAN-LINT: PASS` (this plan satisfies F1/F2/STRUCT/P1/B1a; B1b/G1 warnings are acceptable, exit 0).

- [ ] **Step 2: Run the targeted tests for changed domains**

Run: `task test:changed`
Expected: runs `task test:unit` (scripts/ changed) + `task test:factory` (scripts/factory/ changed) + `task test:code-quality` — all PASS. `plan-lint.bats` and `plan-frontmatter-hook.bats` green.

- [ ] **Step 3: Regenerate freshness artifacts (new script enters repo-index)**

Run: `task freshness:regenerate`
Expected: updates `docs/code-quality/repo-index.json` (the new `scripts/plan-lint.sh` is added) and any test-inventory entries.

- [ ] **Step 4: Run the CI-equivalent freshness + quality gate**

Run: `task freshness:check`
Expected: PASS — S1 ratchet green (`plan-lint.sh` ≤ 500 lines, S4 sees it referenced by Taskfile/pipeline.js/SKILLs → no orphan), baseline key-count unchanged (no new baseline entries added).

- [ ] **Step 5: Regenerate the test inventory (a test file was added) + commit it**

Run: `task test:inventory`
Then: `git add website/src/data/test-inventory.json docs/code-quality/repo-index.json`
Expected: `plan-lint.bats` appears in the inventory; CI inventory-check will match.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(plan-lint): regenerate freshness + test inventory [T000?]"
```

- [ ] **Step 7: Verify nothing is left uncommitted**

Run: `git status --porcelain`
Expected: empty output.

---

## Self-Review notes

- **Spec coverage:** Component 1 (linter F1/F2/STRUCT1-3/P1/B1a/B1b/G1 + `--json`) → Tasks 1-5. Component 2 (frontmatter `--validate` auto-title) → Task 6. Component 3 (four wiring points) → Task 7. Component 4 (BATS + Taskfile + inventory) → Tasks 1-5 (tests), 8 (wiring), 9 (inventory). The B1 budget math is a standalone, individually-tested function (Task 4, `effective_threshold`/`residual_budget` via `PLAN_LINT_SELFTEST`) — exactly as required.
- **Order:** linter+BATS first (Tasks 1-5), then frontmatter enforcement (Task 6), then the four wiring points (Task 7), then tests/inventory wiring (Tasks 8-9). Matches the mandated sequence.
- **STRUCT3 consistency:** the linter checks for `task test:changed` (not `test:all`) — Task 2 Step 4 + the explicit consistency test enforce this.
- **Quality-gates self-compliance:** `plan-lint.sh` targets ≤ ~360 lines (< 80 % of the 500 `.sh` limit); `frontmatter.sh` 212→~250 (< 500); `plan-context.sh` untouched; `pipeline.js` is S1-ignored; `.md`/`.yml` have no S1 limit. No brand-domain literals. Helpers are pure sourced/inline Bash (no import cycles). New script is referenced (not orphaned). Fixtures live under `tests/` (outside the S4 scan universe).
- **Placeholder scan:** the `T000?` ticket markers in commit messages are deliberate (filled in when the ticket is created); they are in commit-message text, not plan task bodies, so they do not trip the plan's own P1 self-lint (P1 scans plan prose outside code fences — commit snippets are inside ```bash``` fences).
