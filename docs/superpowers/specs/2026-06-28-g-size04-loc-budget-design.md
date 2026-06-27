---
title: "G-SIZE04 — Lines-of-Code Budget Quality Gate"
ticket_id: T001280
plan_ref: openspec/changes/g-size04-loc-budget/tasks.md
domains: [infra, quality]
status: brainstormed
date: 2026-06-28
---

# G-SIZE04 — Lines-of-Code Budget Quality Gate: Design

## Why

The codebase has grown to **252,878 lines** across 2,405 source files (S1-scan-universe,
2026-06-28). There is no aggregate LOC gate today — only per-file limits (S1). Without a
total-size guardrail, individual PRs each pass S1 individually but the sum can drift
uncontrolled. A codebase that grows without bound becomes harder to navigate, review, and
maintain over the thesis lifecycle.

The existing S1–S5 gate framework monitors per-file quality (size, cycles, hostnames, orphans,
lockfiles). G-SIZE04 adds **S6: Aggregate LOC Budget** — a single check that fails CI when a PR
would push the total codebase above an acceptable size envelope.

---

## Goals

1. **Detect runaway growth per PR** — warn when a PR adds >5% of the baseline LOC; fail when
   it adds >15%.
2. **Provide an absolute safety cap** — fail unconditionally if total LOC exceeds 350,000 lines
   (≈38% above today's count).
3. **Zero-maintenance baseline management** — the baseline auto-updates each merge to main via
   `task freshness:regenerate`, so thresholds stay anchored to the current trunk state.
4. **Consistent with existing patterns** — follows the `scripts/check-bundle-size.mjs` (g-fe02)
   standalone-script pattern, reuses the `scanUniverse` from `scripts/code-quality/scan.mjs`.

---

## Scope

**In scope:**
- Aggregate line count across the S1-scan-universe (same `code_roots` + `ignore_globs` as
  `docs/code-quality/gates.yaml`)
- File types: same extensions as S1 (`.ts`, `.tsx`, `.astro`, `.svelte`, `.mjs`, `.mts`, `.sh`,
  `.py`, `.js`, `.jsx`, `.cjs`, `.bash`, `.java`, `.php`)
- Integration into `task test:code-quality` (always runs in CI) and
  `task freshness:regenerate` (baseline update)
- BATS test for the check script's exit-code behavior

**Explicitly out of scope:**
- Per-subsystem LOC budgets (website vs scripts vs brett)
- YAML/Markdown/JSON counting (documentation and config, not measured code)
- VideoVault (`VideoVault/` is not in `scan.code_roots`, stays excluded)
- cloc/tokei (no external tools — only builtins + existing scan infrastructure)
- Making S6 a required branch-protection check (informational first)

---

## Architecture

### Pattern

Identical to the g-fe02 bundle budget gate:

```
scripts/check-loc-budget.mjs   ← measurement + check script (Node ESM, builtins only)
docs/code-quality/loc-budget.json  ← committed baseline (generated artifact)
Taskfile.yml (loc:check, loc:update-baseline)
task test:code-quality → calls loc:check
task freshness:regenerate → calls loc:update-baseline
```

### Script API

```bash
# Update baseline (runs post-merge via freshness:regenerate)
node scripts/check-loc-budget.mjs --update-baseline

# Check mode (CI gate on every PR)
node scripts/check-loc-budget.mjs
# → exit 0 = pass or warn-only
# → exit 1 = fail (delta > fail_pct OR total > absolute_cap)
```

**Configurable via flags (with defaults from loc-budget.json thresholds):**
- `--warn-pct=5` — warn threshold (% above baseline)
- `--fail-pct=15` — fail threshold (% above baseline)
- `--absolute-cap=350000` — hard cap regardless of delta
- `--baseline=docs/code-quality/loc-budget.json` — baseline file path

### Baseline File (`docs/code-quality/loc-budget.json`)

```json
{
  "total_lines": 252878,
  "file_count": 2405,
  "commit": "7063de84",
  "measured_at": "2026-06-28T...",
  "thresholds": {
    "warn_pct": 5,
    "fail_pct": 15,
    "absolute_cap": 350000
  }
}
```

The `thresholds` block lives in the baseline file — not hardcoded in the script — so adjusting
the policy requires only a committed JSON change (no code edit).

### Measurement

The script imports `scanUniverse` from `scripts/code-quality/scan.mjs` directly and reads
each file's line count using `readFileSync` + newline count (same as `lineCount()` in
`gates/s1-filesize.mjs`). This guarantees the LOC count is defined over the exact same file
universe as S1-S5.

### Gate Logic

```
current = measure()
delta_pct = (current.total_lines - baseline.total_lines) / baseline.total_lines * 100

if current.total_lines > thresholds.absolute_cap:
  → FAIL (exit 1): "absolute cap exceeded"
elif delta_pct > thresholds.fail_pct:
  → FAIL (exit 1): "delta ${delta_pct.toFixed(1)}% > fail threshold ${fail_pct}%"
elif delta_pct > thresholds.warn_pct:
  → WARN (exit 0): "delta ${delta_pct.toFixed(1)}% > warn threshold — consider cleanup"
else:
  → PASS (exit 0)
```

**Edge case: LOC decreased (negative delta)** — always PASS (shrinkage is good).

**Edge case: baseline missing** — script prints an actionable error and exits 1. CI surfaces
the message; the fix is running `task loc:update-baseline` locally.

**Edge case: baseline stale (not regenerated after adding many files to code_roots)** —
`freshness:check` catches this because `loc-budget.json` is in the freshness manifest.

---

## Integration Points

### `task test:code-quality`

Add `task loc:check` as a step:

```yaml
test:code-quality:
  cmds:
    - '[ -d node_modules ] || npm ci'
    - node --test scripts/code-quality/*.test.mjs scripts/code-quality/gates/*.test.mjs
    - task: loc:check      # ← NEW
```

### `task freshness:regenerate`

Add `task loc:update-baseline` as a step (runs post-merge on every main push via the
`freshness-regen.yml` workflow). This keeps the baseline anchored to main.

### `freshness:check`

Add `docs/code-quality/loc-budget.json` to the list of tracked generated artifacts. A PR that
modifies `gates.yaml` scan configuration must regenerate `loc-budget.json` or fail freshness.

### S4 Orphan Gate

The script is referenced from:
1. `Taskfile.yml` (via `loc:check` and `loc:update-baseline` tasks)
2. Comment in `.github/workflows/ci.yml` (or a step description)

This satisfies S4 reachability — the orphan gate won't flag the new script.

---

## Testing

### BATS test (`tests/spec/ci-cd.bats`)

Since `openspec/specs/ci-cd.md` is the SSOT for CI behavior, new scenarios are added there
and the BATS test goes in `tests/spec/ci-cd.bats`.

**Tests:**
1. `loc:check` exits 0 when the baseline matches the current universe (idempotent).
2. `loc:check` exits 0 with a warning message when delta is between warn_pct and fail_pct.
3. `loc:check` exits 1 when a synthetic high-LOC file pushes delta above fail_pct.
4. `loc:check` exits 1 when total_lines exceeds absolute_cap in baseline.
5. `loc:check` exits 1 with a clear error when baseline file is missing.
6. `loc:update-baseline` writes valid JSON to the baseline path.

The tests use `--baseline` and a temporary directory to avoid modifying
`docs/code-quality/loc-budget.json` during test runs.

---

## OpenSpec SSOT Delta

The gate is a new Requirement + Scenario in `openspec/specs/ci-cd.md`:

**Requirement: PR-Gate — LOC Budget (S6)**
> The system SHALL reject PRs that increase total source-file LOC by more than
> `thresholds.fail_pct` percent above the committed baseline, or that exceed
> the `thresholds.absolute_cap` line count, and SHALL emit a warning for PRs
> that exceed `thresholds.warn_pct`.

**Scenarios:** (in tasks.md)
1. LOC growth below warn_pct → PASS
2. LOC growth between warn_pct and fail_pct → WARN, CI pass
3. LOC growth above fail_pct → FAIL
4. Total LOC above absolute_cap → FAIL always
5. Baseline missing → FAIL with actionable error
6. LOC decreased → PASS (shrinkage is always allowed)

---

## Files Changed

| File | Action |
|------|--------|
| `scripts/check-loc-budget.mjs` | CREATE — measurement + check script |
| `docs/code-quality/loc-budget.json` | CREATE — committed baseline (generated) |
| `Taskfile.yml` | MODIFY — add `loc:check`, `loc:update-baseline`; wire into `test:code-quality` + `freshness:regenerate` |
| `openspec/specs/ci-cd.md` | MODIFY — add S6 requirement + scenarios |
| `tests/spec/ci-cd.bats` | MODIFY (or CREATE) — add 6 BATS tests for S6 |
| `website/src/data/test-inventory.json` | MODIFY — regenerate (new tests added) |
| `docs/code-quality/loc-budget.json` | freshness artifact — added to freshness:check manifest |

---

## Trade-offs Considered

**S6-in-framework vs standalone script:**
S6 in `check.mjs` would require the ratchet baseline to store a single aggregate key (no path,
just a total). The ratchet mechanism (blocking only new or worsened violations) doesn't map
cleanly to a single aggregate metric — it would always "worsen" when LOC grows, which is the
intended behavior, but would require special-casing. The standalone-script pattern is simpler
and proven (g-fe02).

**Delta-% vs absolute threshold only:**
Pure absolute threshold needs tuning as the project grows, and doesn't distinguish "this PR
is huge" from "the project has grown incrementally over many PRs". Delta-% catches per-PR
runaway growth; absolute_cap provides the safety net for the cumulative case.

**cloc vs wc-based line count:**
cloc gives "code lines" (excludes blank lines and comments), which better reflects actual
cognitive load. However cloc is not installed in CI by default, requires an apt install step,
and adds a CI dependency. Using `wc -l` (via `readFileSync` + newline count) keeps the script
dependency-free and consistent with how S1 measures per-file lines. The baseline captures
"wc-l lines", which is self-consistent even if it overcounts blanks/comments.

**warn_pct=5%, fail_pct=15%:**
These numbers allow a single large feature PR (adding ~5k-12k lines) to trigger a warning
and still merge, but block truly runaway PRs (adding >38k lines). After a release cycle of
observation, the thresholds can be tightened in the baseline JSON without code changes.
