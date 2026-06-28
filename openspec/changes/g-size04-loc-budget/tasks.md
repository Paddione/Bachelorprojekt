---
title: "G-SIZE04 — Lines-of-Code Budget Quality Gate"
ticket_id: T001280
domains: [infra, quality]
status: plan_staged
---

# g-size04-loc-budget — Implementation Plan

## File Structure

| File | Action | Notes |
|------|--------|-------|
| `scripts/check-loc-budget.mjs` | CREATE | Measurement + check script; Node ESM, builtins only + `scan.mjs` import; S1 limit: 500 lines (.mjs) |
| `docs/code-quality/loc-budget.json` | CREATE | Committed baseline; generated artifact |
| `Taskfile.yml` | MODIFY | Add `loc:check`, `loc:update-baseline`; wire into `test:code-quality` + `freshness:regenerate` |
| `openspec/specs/ci-cd.md` | MODIFY | Add S6 LOC-Budget Requirement + Scenarios (SSOT delta) |
| `tests/spec/ci-cd.bats` | MODIFY | Add 6 BATS tests for S6 gate exit codes |
| `website/src/data/test-inventory.json` | MODIFY | Regenerate after new BATS tests |

---

## 1. Measurement Script (`scripts/check-loc-budget.mjs`)

- [ ] 1.1 Create `scripts/check-loc-budget.mjs` as Node ESM — imports `scanUniverse` from
  `./code-quality/scan.mjs` for the git-tracked S1-scan-universe; builtins `fs`, `path`,
  `child_process` only; S1 budget: **< 500 lines** (.mjs limit).

- [ ] 1.2 Implement `measure(repoRoot)`: iterates `scanUniverse(repoRoot, gates)` over the
  loaded `docs/code-quality/gates.yaml` config, reads each file's line count using newline
  count (identical to S1 `lineCount()`), returns `{ total_lines, file_count }`.

- [ ] 1.3 Implement `parseArgs()`: supports `--update-baseline`, `--warn-pct=N`,
  `--fail-pct=N`, `--absolute-cap=N`, `--baseline=<path>`; defaults read from
  `docs/code-quality/loc-budget.json` thresholds when present.

- [ ] 1.4 Implement `--update-baseline` mode: writes `docs/code-quality/loc-budget.json`
  with `{ total_lines, file_count, commit, measured_at, thresholds }` — preserves existing
  `thresholds` block if baseline file exists; uses `git rev-parse --short HEAD` for `commit`.

- [ ] 1.5 Implement check mode (default): loads baseline file; exits 1 with actionable error
  if missing; computes `delta_pct`; applies gate logic:
  - LOC decreased → PASS (exit 0)
  - `total_lines > absolute_cap` → FAIL (exit 1), message includes cap value
  - `delta_pct > fail_pct` → FAIL (exit 1), message includes delta percentage
  - `delta_pct > warn_pct` → WARN (exit 0), message includes delta percentage
  - otherwise → PASS (exit 0)

- [ ] 1.6 Add `--fail` flag (mirrors g-fe02): when present, promotes WARN to FAIL
  (for stricter local checks). Optional, not used in CI by default.

---

## 2. Baseline File (`docs/code-quality/loc-budget.json`)

- [ ] 2.1 Run `node scripts/check-loc-budget.mjs --update-baseline` to generate the initial
  committed baseline. Verify JSON structure:
  ```json
  {
    "total_lines": <integer>,
    "file_count": <integer>,
    "commit": "<git-short-sha>",
    "measured_at": "<iso-timestamp>",
    "thresholds": {
      "warn_pct": 5,
      "fail_pct": 15,
      "absolute_cap": 350000
    }
  }
  ```
  Commit the generated `docs/code-quality/loc-budget.json` to the branch.

---

## 3. Taskfile Integration

- [ ] 3.1 Add `loc:check` task to `Taskfile.yml`:
  ```yaml
  loc:check:
    desc: "LOC-Budget-Gate (S6) — Fails if total source LOC exceeds budget"
    cmds:
      - '[ -d node_modules ] || npm ci'
      - node scripts/check-loc-budget.mjs
  ```

- [ ] 3.2 Add `loc:update-baseline` task to `Taskfile.yml`:
  ```yaml
  loc:update-baseline:
    desc: "Regenerate docs/code-quality/loc-budget.json with current LOC count"
    cmds:
      - '[ -d node_modules ] || npm ci'
      - node scripts/check-loc-budget.mjs --update-baseline
  ```

- [ ] 3.3 Wire `task loc:check` into `test:code-quality` as a new final step (after the
  existing `node --test scripts/code-quality/*.test.mjs` line).

- [ ] 3.4 Wire `task loc:update-baseline` into `freshness:regenerate` as a new step
  (after `task quality:index`).

- [ ] 3.5 Add `docs/code-quality/loc-budget.json` to the `freshness:check` files list
  (alongside `docs/code-quality/repo-index.json`) so a stale baseline triggers CI failure.

---

## 4. BATS Tests — Failing-Test-First (S6 Gate)

- [ ] 4.1 Write BATS tests in `tests/spec/ci-cd.bats` — **add before implementing** to
  verify they fail first:

  ```bats
  # G-SIZE04: LOC-Budget-Gate (S6)
  @test "G-SIZE04: loc:check exits 0 when LOC matches baseline (idempotent)" {
    # expected: FAIL (test added before implementation)
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" \
      --baseline="$REPO_ROOT/docs/code-quality/loc-budget.json"
    [ "$status" -eq 0 ]
  }

  @test "G-SIZE04: loc:check exits 1 when baseline file is missing" {
    # expected: FAIL (implementation not yet present)
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline=/nonexistent/loc-budget.json
    [ "$status" -eq 1 ]
  }

  @test "G-SIZE04: loc:check exits 1 when absolute_cap is exceeded" {
    # expected: FAIL (implementation not yet present)
    TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
    echo '{"total_lines":1,"file_count":1,"commit":"test","measured_at":"now","thresholds":{"warn_pct":5,"fail_pct":15,"absolute_cap":1}}' > "$TMPBASELINE"
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline="$TMPBASELINE"
    rm -f "$TMPBASELINE"
    [ "$status" -eq 1 ]
  }

  @test "G-SIZE04: loc:check exits 0 when LOC decreases below baseline" {
    # expected: FAIL (implementation not yet present)
    TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
    echo '{"total_lines":9999999,"file_count":9999,"commit":"test","measured_at":"now","thresholds":{"warn_pct":5,"fail_pct":15,"absolute_cap":9999999}}' > "$TMPBASELINE"
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline="$TMPBASELINE"
    rm -f "$TMPBASELINE"
    [ "$status" -eq 0 ]
  }

  @test "G-SIZE04: loc:update-baseline writes valid JSON" {
    # expected: FAIL (implementation not yet present)
    TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --update-baseline --baseline="$TMPBASELINE"
    [ "$status" -eq 0 ]
    run node -e "const d=JSON.parse(require('fs').readFileSync('$TMPBASELINE','utf8')); process.exit(d.total_lines>0&&d.file_count>0&&d.commit&&d.thresholds?0:1)"
    rm -f "$TMPBASELINE"
    [ "$status" -eq 0 ]
  }

  @test "G-SIZE04: loc:check exits 0 with warning when delta is between warn and fail pct" {
    # expected: FAIL (implementation not yet present)
    TMPBASELINE=$(mktemp /tmp/loc-baseline-XXXXXX.json)
    echo '{"total_lines":100,"file_count":1,"commit":"test","measured_at":"now","thresholds":{"warn_pct":5,"fail_pct":15,"absolute_cap":350000}}' > "$TMPBASELINE"
    run node "$REPO_ROOT/scripts/check-loc-budget.mjs" --baseline="$TMPBASELINE"
    rm -f "$TMPBASELINE"
    [ "$status" -eq 0 ]
    [[ "$output" =~ [Ww][Aa][Rr][Nn] ]] || [[ "$output" =~ [Pp][Aa][Ss][Ss] ]]
  }
  ```

- [ ] 4.2 Run tests to confirm they fail before implementation:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "G-SIZE04"
  # expected: FAIL on all 6 G-SIZE04 tests (script doesn't exist yet)
  ```

---

## 5. OpenSpec SSOT Delta (`openspec/specs/ci-cd.md`)

- [ ] 5.1 Add S6 LOC-Budget Requirement to `openspec/specs/ci-cd.md` after the existing
  S4/S5 requirement blocks:

  ```markdown
  ### Requirement: PR-Gate — LOC-Budget (S6)

  The system SHALL reject PRs that increase total source-file LOC by more than
  `thresholds.fail_pct` percent above the committed baseline, or that exceed
  `thresholds.absolute_cap`, and SHALL emit a non-blocking warning for PRs exceeding
  `thresholds.warn_pct`.

  #### Scenario: LOC growth below warn_pct — PASS

  - **GIVEN** the current LOC is within `warn_pct` percent of `baseline.total_lines`
  - **WHEN** `task loc:check` runs
  - **THEN** exits 0 with a PASS message

  #### Scenario: LOC growth above fail_pct — FAIL

  - **GIVEN** current LOC exceeds `baseline.total_lines * (1 + fail_pct/100)`
  - **WHEN** `task loc:check` runs
  - **THEN** exits 1 with a FAIL message including the delta percentage

  #### Scenario: Total LOC exceeds absolute_cap — FAIL

  - **GIVEN** current LOC > `thresholds.absolute_cap`
  - **WHEN** `task loc:check` runs
  - **THEN** exits 1 with "absolute cap exceeded" regardless of delta_pct

  #### Scenario: Baseline missing — FAIL with actionable error

  - **GIVEN** `docs/code-quality/loc-budget.json` does not exist
  - **WHEN** `task loc:check` runs
  - **THEN** exits 1 with a message suggesting `task loc:update-baseline`
  ```

---

## 6. Verify

- [ ] 6.1 Run all S6 BATS tests green after implementation:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "G-SIZE04"
  # All 6 tests must pass
  ```

- [ ] 6.2 Verify idempotency — `task loc:check` returns exit 0 on the current branch (no runaway growth):
  ```bash
  task loc:check
  ```

- [ ] 6.3 Verify baseline update round-trip — `task loc:update-baseline` then `task loc:check`:
  ```bash
  task loc:update-baseline && task loc:check
  ```

- [ ] 6.4 Validate OpenSpec change:
  ```bash
  task test:openspec
  # must pass
  ```

- [ ] 6.5 Run all changed tests and regenerate freshness artifacts:
  ```bash
  task test:changed
  task freshness:regenerate
  task test:inventory
  git add website/src/data/test-inventory.json
  task freshness:check
  ```
