---
title: Tiered AI Code Review Orchestration Implementation Plan
ticket_id: T000549
domains: [website, infra, db, test, security]
status: active
pr_number: null
---

# Tiered AI Code Review Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a risk-tiered AI code-review system with two entry points (Factory pipeline + a new CI job on every PR) that share a prompt library and helper scripts, scaling review effort (1–5 lenses + coordinator) by diff size/risk, filtering noise, and deduplicating findings.

**Architecture:** Two bash helpers (`filter-diff.sh`, `classify-risk.sh`) produce a clean diff and a tier verdict. Five lens prompts + one coordinator prompt form a shared prompt library under `scripts/factory/`. The Factory `pipeline.js` Verify-phase and a new Node ESM CI orchestrator (`ci-review.mjs`, driven by `.github/workflows/ai-review.yml`) both consume the same helpers and prompts. Lens selection is tier-driven; the full tier runs a coordinator agent that dedups/calibrates findings into a single verdict.

**Tech Stack:** Bash (POSIX-ish, run under `bash`), Node.js ESM + `@anthropic-ai/sdk` (DeepSeek-compatible `baseURL`), GitHub Actions, `gh` CLI, BATS (`tests/local/FA-AR-*.bats`), go-task (`task test:factory`).

---

<!--
IMPLEMENTATION CONTEXT FOR THE AGENT — READ FIRST

Worktree: all work happens in /tmp/wt-tiered-fresh on branch feature/tiered-ai-review.
  - Run git as: git -C /tmp/wt-tiered-fresh ...
  - All file paths below are repo-relative; resolve them under /tmp/wt-tiered-fresh.

Existing code you build on (already read during planning — do NOT re-derive):
  - scripts/factory/classify-paths.sh defines `paths_are_escalate_class <csv>` (exit 0 if
    ANY path is escalate-class: prefix in shared-state-allowlist.txt, OR contains "secret",
    OR basename matches realm*.json, OR ends in .sql). classify-risk.sh REUSES this for the
    security-file escalation rule — do not reimplement that logic.
  - scripts/factory/shared-state-allowlist.txt holds the prefixes (k3d/, prod, environments/,
    Taskfile). The spec also lists auth/ and scripts/factory/ as security prefixes — those are
    NOT in the allowlist, so classify-risk.sh adds them explicitly on top of paths_are_escalate_class.
  - scripts/factory/pipeline.js Verify-phase is currently lines 376–418 (3 lenses: bug/security/
    pattern via parallel(); blocking = findings with severity high|critical; on block it sets the
    ticket blocked + PushNotification, returns {status:'blocked',...}). The Workflow harness exposes
    agent(), parallel(), phase(), phaseEvent(), log(), provision(), consumeInjections(), and the
    consts REPO, WORK_WT, WORK_BRANCH, REVIEW_SCHEMA, DRY_RUN, A (ticket), brand, slug. There is NO
    setInterval in the harness — heartbeat = a log() after each completed agent() call.
  - Existing lens prompts: review-bug-hunter.prompt.md, review-security-auditor.prompt.md,
    review-pattern-enforcer.prompt.md. The security one currently says
    "Flag anything that COULD be a vulnerability, even if exploitation seems unlikely" (line 42)
    and "Prefer false positives" — these get replaced by Cloudflare discipline.
  - BATS tests: tests/local/*.bats, each `setup() { load 'test_helper.bash'; }`. The bats binary is
    ./tests/unit/lib/bats-core/bin/bats. test_helper.bash sets PROJECT_DIR and loads bats-assert/support.
  - Taskfile.yml `test:factory` (lines 460–464) currently globs ONLY tests/local/FA-SF-*.bats.
    It must be widened to also run FA-AR-*.bats or the new tests never run in CI (test:all → test:factory).

Conventions:
  - Commit format: Conventional Commits. Plan/scaffolding commits use chore(...); code uses feat(...)/fix(...).
  - TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
  - The two bash helpers must be offline-safe and deterministic so FA-AR BATS run in CI with no cluster.
  - ci-review.mjs is advisory: a DeepSeek/API failure must exit non-zero WITHOUT blocking the PR merge
    (the job is not a required check). Verify-phase blocking only happens inside the Factory pipeline.
-->

## File Structure

| File | Type | Responsibility |
|------|------|----------------|
| `scripts/factory/filter-diff.sh` | new | Strip noise files (lockfiles, minified, sourcemaps, generated) from a diff; keep `.sql`. |
| `scripts/factory/classify-risk.sh` | new | Emit `{tier,linesChanged,fileCount,securityFiles,reason}` JSON for a branch ref. |
| `scripts/factory/review-perf-reviewer.prompt.md` | new | Performance lens (DB N+1, sync I/O in async, missing index). |
| `scripts/factory/review-agents-md-staleness.prompt.md` | new | AGENTS.md/CLAUDE.md staleness materiality lens. |
| `scripts/factory/review-coordinator.prompt.md` | new | Cross-lens dedup + severity calibration + verdict. |
| `scripts/factory/ci-review.mjs` | new | Node ESM: read tier → run lenses (Promise.all) → coordinator → `gh pr review`. |
| `.github/workflows/ai-review.yml` | new | PR-triggered CI job wiring the helpers + ci-review.mjs. |
| `scripts/factory/review-bug-hunter.prompt.md` | modify | Add `## What NOT to Flag`; drop "prefer false positives". |
| `scripts/factory/review-security-auditor.prompt.md` | modify | Add `## What NOT to Flag`; remove "even if unlikely". |
| `scripts/factory/review-pattern-enforcer.prompt.md` | modify | Add `## What NOT to Flag`. |
| `scripts/factory/pipeline.js` | modify | Verify-phase: filter → tier → tiered lenses → coordinator (full) → verdict block + heartbeat. |
| `tests/local/FA-AR-01-filter-diff.bats` | new | BATS for filter-diff.sh. |
| `tests/local/FA-AR-02-classify-risk.bats` | new | BATS for classify-risk.sh. |
| `Taskfile.yml` | modify | Widen `test:factory` glob to include `FA-AR-*.bats`. |

---

## Task 1: Diff noise filter (`filter-diff.sh`) — TDD

**Files:**
- Create: `scripts/factory/filter-diff.sh`
- Test: `tests/local/FA-AR-01-filter-diff.bats`

<!--
filter-diff.sh contract (from spec §A):
  Usage:  filter-diff.sh <ref>     → runs `git diff <ref>` then filters
          filter-diff.sh -         → reads a diff from stdin then filters
  Output: filtered unified diff on stdout. Exit 0 ALWAYS. Empty stdout = all-noise.
  Filtering operates per-file-section of a unified diff (split on lines starting "diff --git ").
  A file section is DROPPED if the file path matches a noise rule UNLESS path ends in .sql.
  Noise rules:
    - lockfiles (exact basename): pnpm-lock.yaml package-lock.json bun.lock yarn.lock
      go.sum Cargo.lock poetry.lock flake.lock
    - glob: *.min.js *.min.css *.bundle.js *.map
    - generated marker: among the first 5 ADDED/context lines of the section body, a line
      containing @generated, auto-generated, Code generated, or DO NOT EDIT (case-sensitive
      as written; match the literal substrings).
  SQL exception: if the file path ends in .sql, NEVER drop it (even with a generated marker).
The file path of a section = the b-path on the "diff --git a/X b/Y" line (use Y).
-->

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-AR-01-filter-diff.bats`:

```bash
#!/usr/bin/env bats
# FA-AR-01: filter-diff.sh strips noise file sections from a unified diff.
setup() { load 'test_helper.bash'; }

FD="scripts/factory/filter-diff.sh"

# Helper: build a minimal one-file diff section for path $1 with body lines $2..
_section() {
  local path="$1"; shift
  printf 'diff --git a/%s b/%s\n' "$path" "$path"
  printf 'index 0000000..1111111 100644\n'
  printf -- '--- a/%s\n' "$path"
  printf -- '+++ b/%s\n' "$path"
  printf '@@ -1,1 +1,2 @@\n'
  local l
  for l in "$@"; do printf '+%s\n' "$l"; done
}

@test "FA-AR-01: pnpm-lock.yaml section is stripped" {
  run bash "$FD" - <<< "$(_section pnpm-lock.yaml 'resolution stuff')"
  [ "$status" -eq 0 ]
  [[ "$output" != *"pnpm-lock.yaml"* ]]
}

@test "FA-AR-01: go.sum section is stripped" {
  run bash "$FD" - <<< "$(_section go.sum 'h1:abc')"
  [ "$status" -eq 0 ]
  [[ "$output" != *"go.sum"* ]]
}

@test "FA-AR-01: *.min.js section is stripped" {
  run bash "$FD" - <<< "$(_section dist/app.min.js 'var a=1')"
  [ "$status" -eq 0 ]
  [[ "$output" != *"app.min.js"* ]]
}

@test "FA-AR-01: *.map section is stripped" {
  run bash "$FD" - <<< "$(_section dist/app.js.map '{"version":3}')"
  [ "$status" -eq 0 ]
  [[ "$output" != *"app.js.map"* ]]
}

@test "FA-AR-01: generated marker in first 5 lines strips the section" {
  run bash "$FD" - <<< "$(_section src/types.ts '// @generated by codegen' 'export type X = 1')"
  [ "$status" -eq 0 ]
  [[ "$output" != *"src/types.ts"* ]]
}

@test "FA-AR-01: SQL migration with generated marker is NOT stripped" {
  run bash "$FD" - <<< "$(_section migrations/001_init.sql '-- Code generated DO NOT EDIT' 'CREATE TABLE x();')"
  [ "$status" -eq 0 ]
  [[ "$output" == *"migrations/001_init.sql"* ]]
}

@test "FA-AR-01: a normal source file is kept" {
  run bash "$FD" - <<< "$(_section src/app.ts 'const a = 1')"
  [ "$status" -eq 0 ]
  [[ "$output" == *"src/app.ts"* ]]
}

@test "FA-AR-01: mixed diff keeps source and drops lockfile" {
  local diff
  diff="$(_section src/app.ts 'const a = 1')
$(_section pnpm-lock.yaml 'resolution')"
  run bash "$FD" - <<< "$diff"
  [ "$status" -eq 0 ]
  [[ "$output" == *"src/app.ts"* ]]
  [[ "$output" != *"pnpm-lock.yaml"* ]]
}

@test "FA-AR-01: empty input gives empty output, exit 0" {
  run bash "$FD" - <<< ""
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "FA-AR-01: all-noise input gives empty output, exit 0" {
  run bash "$FD" - <<< "$(_section yarn.lock 'foo@1.0.0')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-tiered-fresh && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-AR-01-filter-diff.bats`
Expected: FAIL — `scripts/factory/filter-diff.sh` does not exist (all cases error/fail).

- [ ] **Step 3: Write the implementation**

Create `scripts/factory/filter-diff.sh`:

```bash
#!/usr/bin/env bash
# scripts/factory/filter-diff.sh — strip noise-file sections from a unified diff.
# Usage:
#   filter-diff.sh <ref>   → emits `git diff <ref>` with noise sections removed
#   filter-diff.sh -       → reads a unified diff from stdin, removes noise sections
# Exit 0 ALWAYS. Empty stdout = the whole diff was noise.
# Noise = lockfiles / *.min.js|css / *.bundle.js / *.map / generated-marker files,
# EXCEPT *.sql which is never stripped (schema changes must always be reviewed).
set -uo pipefail

_input_diff() {
  if [[ "${1:-}" == "-" ]]; then
    cat
  elif [[ -n "${1:-}" ]]; then
    git diff "$1"
  else
    echo "usage: filter-diff.sh <ref>|-" >&2
    return 0
  fi
}

# _is_noise_path <path> → exit 0 if the path is a noise file (and not .sql)
_is_noise_path() {
  local p="$1" base
  base="${p##*/}"
  # SQL is always reviewed — never noise.
  [[ "$p" == *.sql ]] && return 1
  case "$base" in
    pnpm-lock.yaml|package-lock.json|bun.lock|yarn.lock|go.sum|Cargo.lock|poetry.lock|flake.lock) return 0 ;;
  esac
  case "$p" in
    *.min.js|*.min.css|*.bundle.js|*.map) return 0 ;;
  esac
  return 1
}

# _has_generated_marker reads section body on stdin, checks first 5 added/context
# lines for a generated marker. Exit 0 if found.
_has_generated_marker() {
  local count=0 line
  while IFS= read -r line && (( count < 5 )); do
    # Only inspect added/context lines (skip diff metadata).
    case "$line" in
      diff\ --git\ *|index\ *|---\ *|+++\ *|@@*) continue ;;
    esac
    count=$((count + 1))
    case "$line" in
      *@generated*|*auto-generated*|*"Code generated"*|*"DO NOT EDIT"*) return 0 ;;
    esac
  done
  return 1
}

main() {
  local diff section_lines=() path="" base
  diff="$(_input_diff "${1:-}")"
  [[ -z "$diff" ]] && return 0

  # Accumulate per-file sections, flush each through the filter.
  local in_section=0
  flush_section() {
    (( in_section )) || return 0
    local drop=0
    if [[ -n "$path" ]] && _is_noise_path "$path"; then
      drop=1
    elif [[ "$path" != *.sql ]] && printf '%s\n' "${section_lines[@]}" | _has_generated_marker; then
      drop=1
    fi
    if (( ! drop )); then
      printf '%s\n' "${section_lines[@]}"
    fi
    section_lines=()
    in_section=0
    path=""
  }

  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "diff --git "* ]]; then
      flush_section
      in_section=1
      # b-path is the last token "b/<path>"; strip the "b/" prefix.
      path="${line##* b/}"
    fi
    (( in_section )) && section_lines+=("$line")
  done <<< "$diff"
  flush_section
  return 0
}

main "$@"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-tiered-fresh && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-AR-01-filter-diff.bats`
Expected: PASS — all 10 cases green.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/filter-diff.sh tests/local/FA-AR-01-filter-diff.bats
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add filter-diff.sh diff noise filter with BATS"
```

---

## Task 2: Risk tier classifier (`classify-risk.sh`) — TDD

**Files:**
- Create: `scripts/factory/classify-risk.sh`
- Test: `tests/local/FA-AR-02-classify-risk.bats`

<!--
classify-risk.sh contract (spec §B):
  Usage: classify-risk.sh <ref>   → JSON on stdout {tier,linesChanged,fileCount,securityFiles[],reason}
  Counting: use `git diff --numstat <ref>` → sum (added+deleted) for linesChanged, count rows for fileCount.
  Security files: a file is security-sensitive if
    (a) paths_are_escalate_class (from classify-paths.sh) returns 0 for it, OR
    (b) its path starts with auth/ or scripts/factory/  (extra prefixes from spec, NOT in allowlist).
  Tier logic (evaluate in this order):
    - if ANY security file        → full
    - elif lines>100 OR files>15  → full
    - elif lines<=100 AND files<=15 (and lines>10 OR files>5) → lite
    - else (lines<=10 AND files<=5) → trivial
  securityFiles[] lists the offending paths (may be empty).
  To make this UNIT-TESTABLE offline without a git history, the script reads numstat from
  an override env var when set: CLASSIFY_NUMSTAT (literal `git diff --numstat` text). The BATS
  feed numstat via that env var so no real branch/commits are needed.
JSON output must be valid (parseable by jq). Use a here-doc with the computed values.
-->

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-AR-02-classify-risk.bats`:

```bash
#!/usr/bin/env bats
# FA-AR-02: classify-risk.sh emits a tier verdict from a diff numstat.
setup() { load 'test_helper.bash'; }

CR="scripts/factory/classify-risk.sh"

# numstat rows are: <added>\t<deleted>\t<path>
@test "FA-AR-02: trivial tier (5 lines, 3 files)" {
  run env CLASSIFY_NUMSTAT=$'2\t0\tsrc/a.ts\n1\t1\tsrc/b.ts\n0\t1\tsrc/c.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"trivial"'
}

@test "FA-AR-02: lite tier (80 lines, 10 files)" {
  local ns=""
  for i in $(seq 1 10); do ns+=$'8\t0\tsrc/f'"$i"$'.ts\n'; done
  run env CLASSIFY_NUMSTAT="$ns" bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"lite"'
}

@test "FA-AR-02: full tier (150 lines)" {
  run env CLASSIFY_NUMSTAT=$'150\t0\tsrc/big.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
}

@test "FA-AR-02: security escalation — small k3d change is full" {
  run env CLASSIFY_NUMSTAT=$'1\t1\tk3d/website.yaml' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
  echo "$output" | grep -q 'k3d/website.yaml'
}

@test "FA-AR-02: scripts/factory change escalates to full" {
  run env CLASSIFY_NUMSTAT=$'1\t0\tscripts/factory/foo.sh' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
}

@test "FA-AR-02: output is valid JSON with required keys" {
  run env CLASSIFY_NUMSTAT=$'3\t0\tsrc/a.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.tier and (.linesChanged|type=="number") and (.fileCount|type=="number") and (.securityFiles|type=="array")'
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-tiered-fresh && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-AR-02-classify-risk.bats`
Expected: FAIL — `scripts/factory/classify-risk.sh` does not exist.

- [ ] **Step 3: Write the implementation**

Create `scripts/factory/classify-risk.sh`:

```bash
#!/usr/bin/env bash
# scripts/factory/classify-risk.sh — classify the risk tier of a diff.
# Usage: classify-risk.sh <ref>   → JSON {tier,linesChanged,fileCount,securityFiles,reason}
# Tiers: trivial | lite | full. Security-sensitive files force full.
# For offline unit tests, set CLASSIFY_NUMSTAT to the literal `git diff --numstat <ref>` text.
set -uo pipefail

_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_HERE}/classify-paths.sh"

# Extra security prefixes from the spec that are NOT in shared-state-allowlist.txt.
_extra_security_prefix() {
  local p="$1"
  [[ "$p" == auth/* ]] && return 0
  [[ "$p" == scripts/factory/* ]] && return 0
  return 1
}

_json_string_array() {
  # prints a JSON array from newline-separated stdin (no trailing newline issues)
  local first=1 item
  printf '['
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    (( first )) || printf ', '
    first=0
    printf '"%s"' "${item//\"/\\\"}"
  done
  printf ']'
}

main() {
  local ref="${1:-HEAD}" numstat
  if [[ -n "${CLASSIFY_NUMSTAT:-}" ]]; then
    numstat="$CLASSIFY_NUMSTAT"
  else
    numstat="$(git diff --numstat "$ref")"
  fi

  local lines=0 files=0 added deleted path
  local sec_files=""
  while IFS=$'\t' read -r added deleted path; do
    [[ -z "$path" ]] && continue
    files=$((files + 1))
    # binary files show "-" — treat as 0 lines.
    [[ "$added"   == "-" ]] && added=0
    [[ "$deleted" == "-" ]] && deleted=0
    lines=$((lines + added + deleted))
    if paths_are_escalate_class "$path" || _extra_security_prefix "$path"; then
      sec_files+="${path}"$'\n'
    fi
  done <<< "$numstat"

  local sec_json tier reason
  sec_json="$(printf '%s' "$sec_files" | _json_string_array)"

  if [[ -n "${sec_files//[$'\n\t ']/}" ]]; then
    tier="full"; reason="security-sensitive file(s) touched"
  elif (( lines > 100 || files > 15 )); then
    tier="full"; reason="diff exceeds full-tier threshold (>100 lines or >15 files)"
  elif (( lines > 10 || files > 5 )); then
    tier="lite"; reason="moderate diff (<=100 lines, <=15 files)"
  else
    tier="trivial"; reason="small diff (<=10 lines, <=5 files)"
  fi

  cat <<JSON
{
  "tier": "${tier}",
  "linesChanged": ${lines},
  "fileCount": ${files},
  "securityFiles": ${sec_json},
  "reason": "${reason}"
}
JSON
}

main "$@"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-tiered-fresh && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-AR-02-classify-risk.bats`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/classify-risk.sh tests/local/FA-AR-02-classify-risk.bats
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add classify-risk.sh tier classifier with BATS"
```

---

## Task 3: Wire FA-AR tests into `task test:factory`

**Files:**
- Modify: `Taskfile.yml` (the `test:factory` task, lines ~460–464)

<!--
test:factory currently runs ONLY tests/local/FA-SF-*.bats. The new FA-AR tests must run there
so they land in `task test:all` (test:all deps include test:factory) and execute in CI. Widen the
glob to a brace expansion covering both FA-SF and FA-AR. Also update the desc to mention FA-AR.
-->

- [ ] **Step 1: Edit the task glob**

In `Taskfile.yml`, replace the `test:factory` body:

```yaml
  test:factory:
    desc: "Run the offline-safe Software Factory bats (tests/local/FA-SF-* + FA-AR-*). Live-DB cases (FA-SF-04 + live-seed) skip without a reachable cluster, so this is CI-safe."
    cmds:
      - '[ -f ./tests/unit/lib/bats-core/bin/bats ] || git submodule update --init --recursive'
      - ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-*.bats tests/local/FA-AR-*.bats
```

- [ ] **Step 2: Run the task to verify FA-AR tests are picked up**

Run: `cd /tmp/wt-tiered-fresh && task test:factory`
Expected: PASS — output includes the `FA-AR-01:` and `FA-AR-02:` test names alongside `FA-SF-*`.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-tiered-fresh add Taskfile.yml
git -C /tmp/wt-tiered-fresh commit -m "chore(factory): run FA-AR review bats in task test:factory"
```

---

## Task 4: Add "What NOT to Flag" to the three existing lens prompts

**Files:**
- Modify: `scripts/factory/review-bug-hunter.prompt.md`
- Modify: `scripts/factory/review-security-auditor.prompt.md`
- Modify: `scripts/factory/review-pattern-enforcer.prompt.md`

<!--
These are prose-only prompt files; no automated test. The implementation step is the edit itself.
Verification = re-read each file and confirm the section exists. The security prompt must LOSE the
"even if unlikely" / "prefer false positives" framing (Cloudflare discipline: only concretely
exploitable findings).
-->

- [ ] **Step 1: Bug hunter — replace the Rules block**

In `scripts/factory/review-bug-hunter.prompt.md`, replace:

```markdown
## Rules
- If you find ZERO bugs, explain WHY the code is bug-free (don't just say "no bugs found")
- Prefer false positives over missed bugs — flag anything suspicious
- Each finding MUST include a suggested fix (not just "add error handling")
```

with:

```markdown
## What NOT to Flag
- Stylistic preferences (naming, formatting) with no behavioral impact
- Hypothetical bugs in code paths the diff does not change
- "Could theoretically be null" where the surrounding code guarantees non-null
- Missing tests (that is the pattern-enforcer's concern, not a bug)
- Defensive checks for inputs the type system already constrains

## Rules
- Only flag a bug you can describe a concrete reproduction for
- If you find ZERO bugs, explain WHY the code is bug-free (don't just say "no bugs found")
- Each finding MUST include a suggested fix (not just "add error handling")
```

- [ ] **Step 2: Security auditor — replace the Rules block**

In `scripts/factory/review-security-auditor.prompt.md`, replace:

```markdown
## Rules
- Flag anything that COULD be a vulnerability, even if exploitation seems unlikely
- Kubernetes manifests: check for privileged mode, hostNetwork, missing resource limits
- Every finding must include a concrete exploit scenario
```

with:

```markdown
## What NOT to Flag
- Theoretical vulnerabilities with no reachable attack path in this diff
- Defense-in-depth suggestions where an existing control already mitigates the risk
- Secrets that are clearly dev-only placeholders (e.g. k3d/secrets.yaml dev values)
- Generic "consider hardening" notes without a concrete exploit
- hostNetwork/privileged usage that is pre-existing and unchanged by the diff

## Rules
- Only flag a finding when you can describe a concrete, reachable exploit scenario
- Every finding MUST include that exploit scenario and a concrete remediation
- Kubernetes manifests: flag privileged mode, hostNetwork, or missing limits only when the diff INTRODUCES them
```

- [ ] **Step 3: Pattern enforcer — append a What NOT to Flag section**

Read `scripts/factory/review-pattern-enforcer.prompt.md`, then append (before the final Rules block if one exists, otherwise at end of file):

```markdown
## What NOT to Flag
- Pre-existing pattern deviations the diff does not touch
- Deviations the repo itself documents as intentional (e.g. `:latest` tags on website/brett/docs images per CLAUDE.md)
- Personal style preferences not encoded in an existing repo convention
- Missing abstractions that would be premature (YAGNI)
```

- [ ] **Step 4: Verify all three sections exist**

Run: `cd /tmp/wt-tiered-fresh && grep -l "## What NOT to Flag" scripts/factory/review-bug-hunter.prompt.md scripts/factory/review-security-auditor.prompt.md scripts/factory/review-pattern-enforcer.prompt.md`
Expected: all three filenames printed.

Run: `cd /tmp/wt-tiered-fresh && ! grep -q "even if exploitation seems unlikely" scripts/factory/review-security-auditor.prompt.md && echo OK`
Expected: `OK` (the old framing is gone).

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/review-bug-hunter.prompt.md scripts/factory/review-security-auditor.prompt.md scripts/factory/review-pattern-enforcer.prompt.md
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add What-NOT-to-flag discipline to review lens prompts"
```

---

## Task 5: New lens prompt — Performance reviewer

**Files:**
- Create: `scripts/factory/review-perf-reviewer.prompt.md`

<!-- Prose prompt; verification = file exists + has the required sections. Schema mirrors bug-hunter. -->

- [ ] **Step 1: Write the prompt file**

Create `scripts/factory/review-perf-reviewer.prompt.md`:

```markdown
# Performance Reviewer — Adversarial Review Agent

## Role
You are a performance engineer reviewing a code diff for changes that
introduce measurable runtime cost, with a focus on this stack: PostgreSQL,
Astro SSR routes, and Node/TypeScript service code.

## Review Scope
Review the provided git diff. Focus ONLY on changed files.

## Performance Categories to Hunt
1. **DB query patterns**: N+1 queries (a query inside a loop over rows), missing `LIMIT` on
   unbounded result sets, `SELECT *` where only a few columns are used.
2. **Astro route overhead**: synchronous DB calls inside a component render path that block
   the SSR response; per-request work that should be cached or hoisted.
3. **Missing indexes**: a new column or new `WHERE`/`JOIN` predicate with no supporting index
   in the same migration.
4. **Sync I/O in async context**: blocking filesystem/network calls (`fs.readFileSync`, blocking
   loops) on a hot async path.

## Output Schema
Return JSON:
```json
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "exact/file/path.ts",
      "line": 42,
      "description": "The performance problem and its measurable impact",
      "evidence": "Why this is a real cost (row counts, request frequency, loop bounds)",
      "suggested_fix": "Concrete remediation"
    }
  ],
  "summary": "Overall performance assessment in one sentence"
}
```

## What NOT to Flag
- Hypothetical scaling problems with no evidence of real data volume
- Micro-optimizations with no measurable impact (loop unrolling, minor allocations)
- ORM/abstraction overhead without proof it is on a hot path
- Premature caching of cheap, infrequently-called code

## Rules
- Every finding MUST cite concrete evidence of cost (row counts, call frequency, loop bounds)
- If you find ZERO performance issues, say so and name the hot paths you checked
```

- [ ] **Step 2: Verify the file**

Run: `cd /tmp/wt-tiered-fresh && grep -q "## What NOT to Flag" scripts/factory/review-perf-reviewer.prompt.md && grep -q '"findings"' scripts/factory/review-perf-reviewer.prompt.md && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/review-perf-reviewer.prompt.md
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add performance review lens prompt"
```

---

## Task 6: New lens prompt — AGENTS.md staleness reviewer

**Files:**
- Create: `scripts/factory/review-agents-md-staleness.prompt.md`

<!--
Distinct output schema (spec §C): { materialityLevel, recommendedUpdate, specificSections }.
The coordinator and pipeline treat this lens specially (it produces a recommendation, not severities).
-->

- [ ] **Step 1: Write the prompt file**

Create `scripts/factory/review-agents-md-staleness.prompt.md`:

```markdown
# AGENTS.md Staleness Reviewer — Advisory Review Agent

## Role
You assess whether a code diff changes the project in ways that make the
agent guidance files `AGENTS.md` and `CLAUDE.md` stale and in need of an update.

## Review Scope
Review the provided git diff. Judge the MATERIALITY of the changes for agent docs.
You do NOT report bugs or severities — you report an update recommendation.

## Materiality Rubric
- **high** (strongly recommend updating): new k3d services, new env vars in
  `environments/schema.yaml`, Taskfile structural changes, new MCP tools, test-framework changes.
- **medium**: large dependency bumps, new API-route patterns, new agents.
- **low**: bug fixes, CSS, content changes, small refactors.

## Output Schema
Return JSON ONLY:
```json
{
  "materialityLevel": "high|medium|low",
  "recommendedUpdate": true,
  "specificSections": ["AGENTS.md > Services", "CLAUDE.md > Configuration patterns"],
  "rationale": "One sentence on why this materiality level"
}
```
- `recommendedUpdate` is `true` for high and (usually) medium, `false` for low.
- `specificSections` lists the exact doc sections to revisit (empty array if none).

## What NOT to Flag
- Trivial changes that do not alter how an agent operates in the repo
- Doc updates that the diff already includes (no need to recommend what was done)
```

- [ ] **Step 2: Verify the file**

Run: `cd /tmp/wt-tiered-fresh && grep -q '"materialityLevel"' scripts/factory/review-agents-md-staleness.prompt.md && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/review-agents-md-staleness.prompt.md
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add AGENTS.md staleness review lens prompt"
```

---

## Task 7: New prompt — Coordinator agent

**Files:**
- Create: `scripts/factory/review-coordinator.prompt.md`

<!--
The coordinator is fed ALL lens findings as XML (one <lens name="..."> block per lens, each
containing that lens's raw JSON output). It returns ONE consolidated JSON with a `verdict`.
The verdict enum drives both the Factory block decision AND the CI gh-review action, so the
enum MUST be exactly: approved | approved_with_comments | minor_issues | requested_changes.
-->

- [ ] **Step 1: Write the prompt file**

Create `scripts/factory/review-coordinator.prompt.md`:

```markdown
# Review Coordinator — Consolidation Agent

## Role
You are the lead reviewer. Multiple specialist lenses have each reviewed the
same diff. You consolidate their findings into ONE calibrated verdict.

## Input
You receive all lens outputs as XML:
```xml
<reviews>
  <lens name="bug">{ ...bug-hunter JSON... }</lens>
  <lens name="security">{ ...security-auditor JSON... }</lens>
  <lens name="pattern">{ ...pattern-enforcer JSON... }</lens>
  <lens name="perf">{ ...perf-reviewer JSON... }</lens>
  <lens name="agents-md">{ ...staleness JSON... }</lens>
</reviews>
```
Some lenses may be missing (an agent died) — work with what is present.

## Your Job
1. **Deduplicate**: the same file+line+issue reported by multiple lenses appears ONCE,
   placed in the most appropriate category.
2. **Re-categorize**: a performance issue reported by the bug lens belongs in the
   performance section, etc.
3. **Reasonableness filter**: drop speculative findings, nitpicks, and any finding
   pointing at code the diff does not change.
4. **Calibrate severity**: downgrade findings whose stated impact does not match their
   severity; only `critical`/`high` should carry a concrete, reachable exploit/repro.
5. **Decide the verdict** using the table below.

## Verdict Logic
| Condition | verdict |
|-----------|---------|
| No findings, or only trivial suggestions | `approved` |
| Only suggestions/warnings, no production risk | `approved_with_comments` |
| Several warnings that together form a risk pattern | `minor_issues` |
| A real critical/high finding with a concrete exploit/repro | `requested_changes` |

## Output Schema
Return JSON ONLY:
```json
{
  "verdict": "approved|approved_with_comments|minor_issues|requested_changes",
  "summary": "Two-sentence reviewer summary",
  "findings": [
    { "category": "bug|security|performance|pattern", "severity": "critical|high|medium|low",
      "file": "path", "line": 42, "description": "...", "suggested_fix": "..." }
  ],
  "agentsMdRecommendation": { "materialityLevel": "high|medium|low", "recommendedUpdate": false, "specificSections": [] }
}
```
- `verdict` MUST be one of the four exact strings above.
- Fold the agents-md lens output into `agentsMdRecommendation` (default low/false if absent).
```

- [ ] **Step 2: Verify the file**

Run: `cd /tmp/wt-tiered-fresh && grep -q 'requested_changes' scripts/factory/review-coordinator.prompt.md && grep -q '"verdict"' scripts/factory/review-coordinator.prompt.md && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/review-coordinator.prompt.md
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add review coordinator consolidation prompt"
```

---

## Task 8: Factory pipeline Verify-phase — tiered lenses + coordinator + heartbeat

**Files:**
- Modify: `scripts/factory/pipeline.js` (Verify phase, lines 376–418)
- Verify against: `tests/local/FA-SF-20-pipeline-contract.bats` (must stay green)

<!--
Replace the static 3-lens block with a tier-driven block:
  1. Run filter-diff.sh on WORK_BRANCH; if empty → log + phaseEvent('verify','done','noise-only') + skip lenses.
  2. Run classify-risk.sh on WORK_BRANCH → parse tier.
  3. Select lenses by tier:
       trivial → [bug]               (1 generalist; reuse bug lens as generalist)
       lite    → [bug, security, pattern]
       full    → [bug, security, pattern, perf, agents-md]
  4. Run the selected lenses with parallel(), .filter(Boolean) for dead agents.
  5. Heartbeat: after the parallel() resolves, log how many lenses returned; full tier logs
     before starting the coordinator. (Harness has NO setInterval — post-completion log is the heartbeat.)
  6. full tier with >=2 live lenses → run coordinator agent → verdict.
     Otherwise (trivial/lite, or full with <2 live lenses) → fall back to existing raw-finding logic:
       blocking = findings with severity high|critical → block as before.
  7. Blocking decision:
       - coordinator path: verdict === 'requested_changes' blocks.
       - fallback path: any high|critical finding blocks (existing behavior).
  8. The block branch (ticket blocked + PushNotification + return {status:'blocked'}) is UNCHANGED in shape.
  9. Verify-phase external interface unchanged: still returns {status:'blocked',...} on block, falls
     through to Deploy otherwise. DRY-RUN path (lines 423+) references `reviews` — keep a `reviews`
     array in scope holding the lens results so the dry-run summary still works.

IMPORTANT: keep the `reviews` variable name (the Deploy/dry-run code at lines ~428/435 reads
reviews.length and reviews.flatMap). The new code must define `const reviews = ...` (lens results
array) and a separate `coordinatorVerdict` for the full tier.

The pipeline cannot be unit-run offline (it is a Workflow harness script). Verification for this
task = FA-SF-20 contract bats stays green + `node --check scripts/factory/pipeline.js` parses.
Read FA-SF-20 first to learn what structural invariants it asserts and do not break them.
-->

- [ ] **Step 1: Read the contract test and current Verify block**

Run: `cd /tmp/wt-tiered-fresh && sed -n '1,80p' tests/local/FA-SF-20-pipeline-contract.bats`
Note which strings/structure it greps for (e.g. `phase('Verify')`, `phaseEvent('verify'`, `status: 'blocked'`). Preserve every asserted token.

- [ ] **Step 2: Replace the Verify block (lines 376–418)**

Replace the block starting at `// ── ⑤ Verify` through the line `phaseEvent('verify', 'done')` with:

```javascript
// ── ⑤ Verify (tiered adversarial review panel + coordinator) ────────────────
phase('Verify')
phaseEvent('verify', 'entered')

// (a) Filter noise out of the diff; an all-noise diff needs no review.
const verifyT0 = Date.now()
const cleanDiff = await sh(`bash ${REPO}/scripts/factory/filter-diff.sh ${WORK_BRANCH}`, { cwd: WORK_WT }).catch(() => '')
let reviews = []
let coordinatorVerdict = null
if (!cleanDiff || !cleanDiff.trim()) {
  log('Verify: filtered diff is empty (noise-only change) — skipping review lenses.')
  phaseEvent('verify', 'done', 'noise-only')
} else {
  // (b) Classify the risk tier.
  const tierJson = await sh(`bash ${REPO}/scripts/factory/classify-risk.sh ${WORK_BRANCH}`, { cwd: WORK_WT }).catch(() => '{"tier":"full"}')
  let tier = 'full'
  try { tier = (JSON.parse(tierJson).tier) || 'full' } catch { tier = 'full' }
  log(`Verify: risk tier = ${tier}`)

  // (c) Tier-driven lens selection.
  const ALL_LENSES = {
    bug:        'scripts/factory/review-bug-hunter.prompt.md',
    security:   'scripts/factory/review-security-auditor.prompt.md',
    pattern:    'scripts/factory/review-pattern-enforcer.prompt.md',
    perf:       'scripts/factory/review-perf-reviewer.prompt.md',
    'agents-md':'scripts/factory/review-agents-md-staleness.prompt.md',
  }
  const tierLenses =
    tier === 'trivial' ? ['bug'] :
    tier === 'lite'    ? ['bug', 'security', 'pattern'] :
                         ['bug', 'security', 'pattern', 'perf', 'agents-md']
  const lenses = tierLenses.map((key) => ({ key, file: ALL_LENSES[key] }))

  // (d) Run lenses in parallel; drop dead agents.
  reviews = (await parallel(
    lenses.map((l) => () => agent(
      `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
       Read the review prompt at ${REPO}/${l.file} and apply it to the diff of branch
       ${WORK_BRANCH}: git -C ${WORK_WT} diff origin/main...HEAD  (in the WORKTREE — NOT
       in ${REPO} whose HEAD is main → empty diff). Return findings as JSON per the prompt's schema.` + consumeInjections('verify'),
      { label: `review:${l.key}`, phase: 'Verify', schema: REVIEW_SCHEMA, model: provision({ role: l.key === 'security' ? 'security' : 'review' }).model },
    )),
  )).filter(Boolean)
  log(`Verify: ${reviews.length}/${lenses.length} lenses done, elapsed ${Math.round((Date.now() - verifyT0) / 1000)}s`)

  // (e) Full tier with >=2 live lenses → coordinator consolidates into a verdict.
  if (tier === 'full' && reviews.length >= 2) {
    log('Verify: starting coordinator consolidation.')
    const xml = '<reviews>\n' + reviews.map((r, i) =>
      `  <lens name="${(lenses[i] && lenses[i].key) || 'lens' + i}">${JSON.stringify(r)}</lens>`).join('\n') + '\n</reviews>'
    const coord = await agent(
      `Read the coordinator prompt at ${REPO}/scripts/factory/review-coordinator.prompt.md and apply it
       to these lens findings. Return ONE consolidated JSON with a "verdict" field.\n${xml}`,
      { label: 'review:coordinator', phase: 'Verify', model: provision({ role: 'review' }).model },
    )
    if (coord && coord.verdict) coordinatorVerdict = coord.verdict
  }

  await agent(
    `Record a one-line factory status breadcrumb (non-blocking):
     bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory: phase=Verify, tier=' + tier + ', ' + reviews.flatMap(r=>r.findings||[]).length + ' finding(s).')}`,
    { label: 'verify:breadcrumb', phase: 'Verify' },
  )

  // (f) Blocking decision: coordinator verdict (full) OR raw high/critical findings (fallback).
  const rawBlocking = reviews.flatMap((r) => r.findings || []).filter((f) => f && (f.severity === 'high' || f.severity === 'critical'))
  const isBlocked = coordinatorVerdict ? (coordinatorVerdict === 'requested_changes') : (rawBlocking.length > 0)
  if (isBlocked) {
    const blocking = rawBlocking
    await agent(
      `The adversarial review panel found blocking issues (coordinator verdict=${coordinatorVerdict || 'n/a'}).
       Run these commands to record the block:
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
         --body ${JSON.stringify('Factory Verify blocked: ' + JSON.stringify(blocking))}
       Then notify the operator: PushNotification is a DEFERRED tool — run
       \`ToolSearch select:PushNotification\` to load it, then call it once with
         title:   "Factory Verify blocked: ${A.ticket_id} (${brand})"
         message: "${blocking.length} blocking review finding(s) / verdict=${coordinatorVerdict || 'high-severity'}."
       Report the command outputs.`,
      { label: 'verify:escalate', phase: 'Verify' },
    )
    phaseEvent('verify', 'blocked', (blocking.length || 1) + ' blocking finding(s)')
    return { status: 'blocked', reason: 'review-findings', blocking, verdict: coordinatorVerdict }
  }
  phaseEvent('verify', 'done')
}
```

- [ ] **Step 3: Confirm a `sh()` helper exists in the harness**

Run: `cd /tmp/wt-tiered-fresh && grep -nE 'function sh|const sh|sh *=|async function sh' scripts/factory/pipeline.js | head`
If `sh(cmd, {cwd})` does NOT exist in the harness, replace the two `await sh(...)` calls with an `agent()` call that runs the script and returns stdout, e.g.:

```javascript
const cleanDiff = await agent(
  `Run \`bash ${REPO}/scripts/factory/filter-diff.sh ${WORK_BRANCH}\` from ${WORK_WT} and return its raw stdout ONLY (no commentary).`,
  { label: 'verify:filter', phase: 'Verify' },
) || ''
```
and likewise for `classify-risk.sh` (returning the JSON string). Pick whichever (`sh` vs `agent`) the harness actually supports; do not invent `sh` if it is absent.

- [ ] **Step 4: Parse-check and run the contract test**

Run: `cd /tmp/wt-tiered-fresh && node --check scripts/factory/pipeline.js && echo PARSE-OK`
Expected: `PARSE-OK`.

Run: `cd /tmp/wt-tiered-fresh && ./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-20-pipeline-contract.bats`
Expected: PASS — contract invariants intact.

- [ ] **Step 5: Full factory test sweep**

Run: `cd /tmp/wt-tiered-fresh && task test:factory`
Expected: PASS — all `FA-SF-*` and `FA-AR-*` green.

- [ ] **Step 6: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/pipeline.js
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): tier-driven Verify phase with coordinator + heartbeat"
```

---

## Task 9: CI orchestrator — `ci-review.mjs`

**Files:**
- Create: `scripts/factory/ci-review.mjs`

<!--
Node ESM, single file. Reads:
  TIER_JSON_PATH   → tier
  CLEAN_DIFF_PATH  → the filtered diff (the review subject)
  ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY → DeepSeek-compatible endpoint for @anthropic-ai/sdk
  GH_TOKEN, PR_NUMBER → for `gh pr review`
Behavior:
  - If ANTHROPIC_API_KEY is unset → print warning, exit 0 (skip; advisory job, do not fail PR).
  - Read each selected lens prompt from scripts/factory/review-<lens>.prompt.md, send
    [system=prompt, user=diff] to the model, parse JSON from the response.
  - Lenses by tier identical to the pipeline (trivial=[bug]; lite=[bug,security,pattern];
    full=[bug,security,pattern,perf,agents-md]).
  - Run lenses with Promise.all. Dropped (rejected) lenses are filtered out.
  - full tier with >=2 lenses → coordinator call → verdict. Else fallback: derive a verdict from
    raw findings (any high|critical → requested_changes; any finding → minor_issues; else approved).
  - Map verdict → gh pr review flag and post:
      approved               → gh pr review <PR> --approve --body ...
      approved_with_comments → gh pr review <PR> --approve --body ...
      minor_issues           → gh pr review <PR> --comment --body ...
      requested_changes      → gh pr review <PR> --request-changes --body ...
  - Comment body = tier badge + a findings table (top N) + coordinator summary.
  - Heartbeat: setInterval(()=>console.log('AI review running...'),30_000), cleared at the end.
  - On any unrecoverable error (model/network) → console.error + process.exit(1) WITHOUT posting a
    blocking review (the job is not a required check, so exit 1 surfaces red but does not gate merge).
Dependency: import Anthropic from '@anthropic-ai/sdk'. The workflow installs it (Task 10 decides
node_modules location). Model ids: read from env CI_REVIEW_MODEL (default 'deepseek-chat') so the
DeepSeek-Anthropic endpoint gets a valid model name; do NOT hardcode a claude-* id.
-->

- [ ] **Step 1: Write the orchestrator**

Create `scripts/factory/ci-review.mjs`:

```javascript
#!/usr/bin/env node
// scripts/factory/ci-review.mjs — CI-side tiered AI code review (advisory).
// Reads a filtered diff + tier, runs tier-selected lens prompts against a
// DeepSeek/Anthropic-compatible endpoint, optionally consolidates via a
// coordinator, and posts a GitHub PR review with `gh pr review`.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import Anthropic from '@anthropic-ai/sdk'

const {
  ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY,
  CLEAN_DIFF_PATH, TIER_JSON_PATH,
  PR_NUMBER, CI_REVIEW_MODEL = 'deepseek-chat',
} = process.env

const PROMPT_DIR = new URL('.', import.meta.url).pathname

if (!ANTHROPIC_API_KEY) {
  console.warn('ci-review: ANTHROPIC_API_KEY unset — skipping AI review (advisory).')
  process.exit(0)
}

const LENS_FILE = {
  bug:        'review-bug-hunter.prompt.md',
  security:   'review-security-auditor.prompt.md',
  pattern:    'review-pattern-enforcer.prompt.md',
  perf:       'review-perf-reviewer.prompt.md',
  'agents-md':'review-agents-md-staleness.prompt.md',
}
const TIER_LENSES = {
  trivial: ['bug'],
  lite:    ['bug', 'security', 'pattern'],
  full:    ['bug', 'security', 'pattern', 'perf', 'agents-md'],
}

const readPrompt = (lens) => readFileSync(PROMPT_DIR + LENS_FILE[lens], 'utf8')
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, ...(ANTHROPIC_BASE_URL ? { baseURL: ANTHROPIC_BASE_URL } : {}) })

function parseJson(text, fallback) {
  const m = text && text.match(/\{[\s\S]*\}/)
  if (!m) return fallback
  try { return JSON.parse(m[0]) } catch { return fallback }
}

async function callModel(systemPrompt, userContent) {
  const res = await client.messages.create({
    model: CI_REVIEW_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

async function runLens(lens, diff) {
  try {
    const out = await callModel(readPrompt(lens), `Review this diff:\n\n${diff}`)
    return { lens, result: parseJson(out, { findings: [] }) }
  } catch (e) {
    console.error(`ci-review: lens ${lens} failed: ${e.message}`)
    return null
  }
}

function fallbackVerdict(reviews) {
  const findings = reviews.flatMap((r) => r.result.findings || [])
  if (findings.some((f) => f && (f.severity === 'high' || f.severity === 'critical'))) return { verdict: 'requested_changes', summary: 'High/critical findings present.', findings }
  if (findings.length) return { verdict: 'minor_issues', summary: 'Minor findings present.', findings }
  return { verdict: 'approved', summary: 'No blocking findings.', findings: [] }
}

async function coordinate(reviews) {
  const xml = '<reviews>\n' + reviews.map((r) => `  <lens name="${r.lens}">${JSON.stringify(r.result)}</lens>`).join('\n') + '\n</reviews>'
  try {
    const out = await callModel(readPrompt('bug') /* placeholder */, '')
    void out
  } catch { /* ignore */ }
  try {
    const coordPrompt = readFileSync(PROMPT_DIR + 'review-coordinator.prompt.md', 'utf8')
    const out = await callModel(coordPrompt, `Consolidate these lens findings:\n${xml}`)
    return parseJson(out, fallbackVerdict(reviews))
  } catch (e) {
    console.error(`ci-review: coordinator failed: ${e.message}`)
    return fallbackVerdict(reviews)
  }
}

function renderBody(tier, consolidated) {
  const rows = (consolidated.findings || []).slice(0, 10).map((f) =>
    `| ${f.category || '-'} | ${f.severity || '-'} | ${f.file || '-'}:${f.line || '-'} | ${(f.description || '').replace(/\|/g, '\\|')} |`).join('\n')
  return [
    `### AI Code Review — tier: \`${tier}\``,
    '',
    consolidated.summary || '',
    '',
    rows ? `| category | severity | location | description |\n|---|---|---|---|\n${rows}` : '_No findings._',
    '',
    `**Verdict:** \`${consolidated.verdict}\``,
    '',
    '<sub>Advisory automated review. Not a required check.</sub>',
  ].join('\n')
}

function postReview(verdict, body) {
  if (!PR_NUMBER) { console.log(body); return }
  const flag =
    verdict === 'requested_changes' ? '--request-changes' :
    verdict === 'minor_issues'      ? '--comment' :
                                      '--approve'
  try {
    execFileSync('gh', ['pr', 'review', String(PR_NUMBER), flag, '--body', body], { stdio: 'inherit' })
  } catch (e) {
    // gh cannot approve your own PR; downgrade to a comment so the review still posts.
    console.error(`ci-review: ${flag} failed (${e.message}); falling back to --comment.`)
    execFileSync('gh', ['pr', 'review', String(PR_NUMBER), '--comment', '--body', body], { stdio: 'inherit' })
  }
}

async function main() {
  const diff = readFileSync(CLEAN_DIFF_PATH, 'utf8')
  if (!diff.trim()) { console.log('ci-review: empty diff — nothing to review.'); return }
  const tier = parseJson(readFileSync(TIER_JSON_PATH, 'utf8'), { tier: 'full' }).tier || 'full'
  const lenses = TIER_LENSES[tier] || TIER_LENSES.full

  const beat = setInterval(() => console.log('AI review running...'), 30_000)
  try {
    const settled = await Promise.all(lenses.map((l) => runLens(l, diff)))
    const reviews = settled.filter(Boolean)
    const consolidated = (tier === 'full' && reviews.length >= 2) ? await coordinate(reviews) : fallbackVerdict(reviews)
    postReview(consolidated.verdict, renderBody(tier, consolidated))
  } finally {
    clearInterval(beat)
  }
}

main().catch((e) => { console.error('ci-review failed:', e); process.exit(1) })
```

<!-- NOTE for implementer: delete the dead `coordinate()` placeholder block that calls
runLens('bug') with empty content — it was a stray; the real coordinator call follows it.
Final coordinate() should ONLY read review-coordinator.prompt.md and call the model once. -->

- [ ] **Step 2: Clean up the stray placeholder in `coordinate()`**

Remove this dead block inside `coordinate()` (it calls the model with empty content for no reason):

```javascript
  try {
    const out = await callModel(readPrompt('bug') /* placeholder */, '')
    void out
  } catch { /* ignore */ }
```

- [ ] **Step 3: Parse-check**

Run: `cd /tmp/wt-tiered-fresh && node --check scripts/factory/ci-review.mjs && echo PARSE-OK`
Expected: `PARSE-OK`.

- [ ] **Step 4: Smoke test the no-key skip path**

Run: `cd /tmp/wt-tiered-fresh && env -u ANTHROPIC_API_KEY node scripts/factory/ci-review.mjs; echo "exit=$?"`
Expected: prints the skip warning and `exit=0`.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/ci-review.mjs
git -C /tmp/wt-tiered-fresh commit -m "feat(factory): add ci-review.mjs tiered CI review orchestrator"
```

---

## Task 10: Resolve the `@anthropic-ai/sdk` dependency for CI

**Files:**
- Decide & implement: how `ci-review.mjs` resolves `@anthropic-ai/sdk` in the GitHub runner

<!--
Spec open question: own package.json in scripts/factory/ vs reuse website/node_modules.
Decision for this plan: add a MINIMAL scripts/factory/package.json declaring the single dep.
This keeps the CI job's `npm ci` fast and isolated from the heavy website install, and makes the
`import Anthropic from '@anthropic-ai/sdk'` resolve from scripts/factory/node_modules.
Pin to the SAME major as website/package.json to avoid drift — read that version first.
-->

- [ ] **Step 1: Read the website's SDK version**

Run: `cd /tmp/wt-tiered-fresh && grep '@anthropic-ai/sdk' website/package.json`
Note the version (e.g. `"^0.x.y"`). Use that exact spec below.

- [ ] **Step 2: Create `scripts/factory/package.json`**

Create `scripts/factory/package.json` (replace `<VERSION>` with the spec from Step 1):

```json
{
  "name": "factory-ci-review",
  "private": true,
  "type": "module",
  "description": "Isolated deps for the CI AI-review orchestrator (ci-review.mjs).",
  "dependencies": {
    "@anthropic-ai/sdk": "<VERSION>"
  }
}
```

- [ ] **Step 3: Generate the lockfile**

Run: `cd /tmp/wt-tiered-fresh/scripts/factory && npm install --package-lock-only`
Expected: `scripts/factory/package-lock.json` created.

<!-- package-lock.json under scripts/factory/ is wanted here (npm ci needs it); it is NOT
stripped by filter-diff.sh's review path because filter-diff only affects REVIEW input, not git. -->

- [ ] **Step 4: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/package.json scripts/factory/package-lock.json
git -C /tmp/wt-tiered-fresh commit -m "chore(factory): isolate @anthropic-ai/sdk dep for ci-review.mjs"
```

---

## Task 11: CI workflow — `ai-review.yml`

**Files:**
- Create: `.github/workflows/ai-review.yml`

<!--
Workflow per spec §E. Steps: checkout fetch-depth:0 → npm ci in scripts/factory → filter-diff →
empty-skip → classify-risk → run ci-review.mjs with the env. Secrets DEEPSEEK_BASE_URL/DEEPSEEK_API_KEY
are added manually in repo settings (Task 12 documents this). The job must NOT be a required check
(advisory) — do not add it to branch protection.
-->

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ai-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: ai-review-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ai-review:
    name: AI Code Review
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      pull-requests: write
      contents: read
    steps:
      - name: Checkout (full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install review deps
        working-directory: scripts/factory
        run: npm ci

      - name: Filter diff (strip noise)
        run: bash scripts/factory/filter-diff.sh origin/main...HEAD > /tmp/clean.diff

      - name: Skip if diff is all noise
        id: gate
        run: |
          if [ ! -s /tmp/clean.diff ]; then
            echo "Filtered diff is empty (noise-only) — skipping AI review."
            echo "skip=true" >> "$GITHUB_OUTPUT"
          else
            echo "skip=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Classify risk tier
        if: steps.gate.outputs.skip != 'true'
        run: bash scripts/factory/classify-risk.sh origin/main...HEAD > /tmp/tier.json

      - name: Run AI review
        if: steps.gate.outputs.skip != 'true'
        env:
          ANTHROPIC_BASE_URL: ${{ secrets.DEEPSEEK_BASE_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          CLEAN_DIFF_PATH: /tmp/clean.diff
          TIER_JSON_PATH: /tmp/tier.json
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: node scripts/factory/ci-review.mjs
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `cd /tmp/wt-tiered-fresh && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ai-review.yml')); print('YAML-OK')"`
Expected: `YAML-OK`.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-tiered-fresh add .github/workflows/ai-review.yml
git -C /tmp/wt-tiered-fresh commit -m "ci: add advisory AI code review workflow on PRs"
```

---

## Task 12: Operator runbook note for the manual GitHub secrets

**Files:**
- Create: `scripts/factory/AI-REVIEW-SETUP.md`

<!--
The two repo secrets are added by hand (cannot be in git). Capture the exact steps + source of the
values so the operator can finish the wiring. This is the only "docs" file the plan creates and it
is operational (not user docs), so it does not violate the no-proactive-docs rule — it is a required
deploy artifact for the feature to function.
-->

- [ ] **Step 1: Write the setup note**

Create `scripts/factory/AI-REVIEW-SETUP.md`:

```markdown
# AI Code Review — one-time setup

The `ai-review.yml` workflow needs two repository secrets (Settings → Secrets and
variables → Actions → New repository secret):

| Secret | Value |
|--------|-------|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/anthropic` (or the `ANTHROPIC_BASE_URL` from `environments/.secrets/deepseek.sh`) |
| `DEEPSEEK_API_KEY`  | the `ANTHROPIC_AUTH_TOKEN` value from `environments/.secrets/deepseek.sh` |

Notes:
- The job is **advisory** — it is intentionally NOT a required status check. A model/network
  failure makes the job red but does not block merge.
- If the secrets are absent, `ci-review.mjs` skips cleanly (exit 0) with a warning.
- Model id is `deepseek-chat` by default; override with the `CI_REVIEW_MODEL` env in the workflow.
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-tiered-fresh add scripts/factory/AI-REVIEW-SETUP.md
git -C /tmp/wt-tiered-fresh commit -m "docs(factory): AI review GitHub-secrets setup runbook"
```

---

## Task 13: Full offline verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the whole offline test suite**

Run: `cd /tmp/wt-tiered-fresh && task test:all`
Expected: PASS — `FA-SF-*`, `FA-AR-01`, `FA-AR-02`, manifests, and all other offline suites green.

- [ ] **Step 2: Parse-check both Node entry points**

Run: `cd /tmp/wt-tiered-fresh && node --check scripts/factory/pipeline.js && node --check scripts/factory/ci-review.mjs && echo ALL-PARSE-OK`
Expected: `ALL-PARSE-OK`.

- [ ] **Step 3: Confirm freshness artifacts are current**

Run: `cd /tmp/wt-tiered-fresh && task freshness:check || task freshness:regenerate`
If `freshness:regenerate` changed any generated file, commit it:

```bash
git -C /tmp/wt-tiered-fresh add -A
git -C /tmp/wt-tiered-fresh commit -m "chore: regenerate freshness artifacts for tiered-ai-review"
```

- [ ] **Step 4: Final state check**

Run: `cd /tmp/wt-tiered-fresh && git status && git log --oneline origin/main..HEAD`
Expected: clean tree; the commit list matches Tasks 1–12 (+ optional freshness commit).

---

## Self-Review (planning-time checklist — already run)

**Spec coverage:**
- §A filter-diff.sh → Task 1. §B classify-risk.sh → Task 2. §C lens prompts (3 updated, 2 new) → Tasks 4/5/6. §C coordinator → Task 7. §D pipeline.js Verify → Task 8. §E CI job → Tasks 9/11; ci-review.mjs → Task 9; dependency → Task 10; secrets runbook → Task 12. Tests (FA-AR-01/02 + task wiring) → Tasks 1/2/3. Edge cases (empty diff skip, dead-lens filter, coordinator fallback, no-key skip) → Tasks 8/9.
- Non-goals (re-reviews, cost tracking, circuit breaker, 7-lens parity) → deliberately absent. ✔

**Open spec questions resolved in-plan:**
- Dependency location → own `scripts/factory/package.json` (Task 10).
- Coordinator XML format → `<reviews><lens name="...">{json}</lens>...</reviews>` (Tasks 7/8/9, consistent).
- Heartbeat → pipeline uses post-`agent()` `log()` (Task 8); CI uses `setInterval` (Task 9). ✔

**Type/name consistency:** verdict enum `approved|approved_with_comments|minor_issues|requested_changes` is identical across coordinator prompt (Task 7), pipeline block decision (Task 8), and `ci-review.mjs` `postReview`/`fallbackVerdict` (Task 9). Lens-key set `{bug,security,pattern,perf,agents-md}` and the `review-<x>.prompt.md` file map are identical in Tasks 8 and 9. `reviews` variable name preserved in pipeline so the existing Deploy/dry-run code (lines ~428/435) keeps working. ✔

**Harness-uncertainty flagged:** Task 8 Step 3 explicitly checks whether `sh()` exists and gives an `agent()`-based fallback — the one place the plan cannot fully verify offline.
