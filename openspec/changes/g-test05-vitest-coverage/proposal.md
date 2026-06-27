# Proposal: g-test05-vitest-coverage

## Why

The website has ~163 Vitest test files under `website/src/lib`, but **no coverage
reporter is configured** (`website/vitest.config.ts` ships two projects — `node` +
`components` — with zero `test.coverage` block). That means:

- We cannot prove how much of the security-/billing-/factory-relevant business
  logic in `website/src/lib` is actually exercised by tests.
- New PRs can delete or under-test lib modules without any signal.
- The graduation criterion **G-TEST05** (≥ 60 % line coverage of `website/src/lib`)
  has no measurement and no CI gate, so it can neither be reported nor defended.

Of the 242 non-test `.ts` modules in `website/src/lib`, ~79 have **no sibling
`*.test.ts`** at all — including pure, dependency-free logic that is cheap to cover
(`sanitize.ts`, `invoice-types.ts`, `compute-scores.ts`, `graph-utils.ts`,
`legal-defaults.ts`, `xrechnung-ubl.ts`, `srgb-icc.ts`, …). Line coverage is
currently unknown and almost certainly below the 60 % bar.

## What

1. Add `@vitest/coverage-v8` and a `test.coverage` block to
   `website/vitest.config.ts` scoped to `src/lib/**`, with a `json-summary`
   reporter and a `thresholds.lines: 60` gate (fails the run when below 60 %).
2. Measure the current line coverage of `website/src/lib` as a baseline
   (the threshold run is the RED/failing test that proves the gate works).
3. Write new pure-logic unit tests for currently-untested `src/lib/*.ts` modules
   until line coverage reaches **≥ 60 %**.
4. Wire a CI gate into `.github/workflows/ci.yml` (`Vitest (website)` job): run
   `vitest run --coverage`, parse `coverage/coverage-summary.json` with `jq`, and
   fail the job when `total.lines.pct < 60`.
5. Regenerate `website/src/data/test-inventory.json` (CI inventory-drift gate
   re-runs `task test:inventory` and fails on any diff) and refresh freshness
   artifacts.

Out of scope: branch/function/statement thresholds (lines only for G-TEST05),
coverage of `src/components` / `src/pages` (this ticket is `src/lib`-scoped),
and any change to the test runtime split (`node` vs `components` projects stay).

_Ticket: T001208_
