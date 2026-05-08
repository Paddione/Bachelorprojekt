# Scaffold the 9 missing System-Test specs

Date: 2026-05-09
Status: Draft, awaiting user review
Sub-project of: System-Test "Project" abstraction (Sub-project B, deferred)

## Why

Today only 3 of 12 System-Test templates have runnable Playwright specs:
`systemtest-04-fragebogen`, `systemtest-05-docuseal`, `systemtest-06-steuer`
(cycle 2). The other 9 are seeded as templates in the website DB but have no
spec walking them, so `scripts/systemtest-fanout.sh 1|3|4 <env>` prints
`SKIP: not yet implemented` for every package and exits without running them.

A future "Project" abstraction (Sub-project B — pick a subset of the 12 tests,
target a cluster, define up-to-5 goals, dispatch goal-aware agents) is
blocked on having all 12 templates be walkable. Pre-flight staleness checking
ahead of any goal-driven run requires the same precondition.

This spec covers Sub-project A only: scaffold the 9 missing specs and refactor
04/05/06 to share the same one-helper authoring pattern, so the next
brainstorm for Sub-project B starts from "all 12 work" rather than "3 work".

## Goal

After this lands:

- `scripts/systemtest-fanout.sh 1 <env>`, `… 2`, `… 3`, `… 4` each launch their
  three specs without any `SKIP: not yet implemented` message.
- A pre-flight run across all four cycles either passes end-to-end or surfaces
  concrete failures on the existing `/admin/systemtest/board.astro` kanban via
  the failure-bridge — which is the staleness signal we want.
- New specs do not duplicate seed-data knowledge: which steps need human
  hand-off is read from the seed `agent_notes` field, not hardcoded per spec.

## Non-goals

These are explicitly deferred to Sub-project B:

- Admin UI for selecting templates × cluster × goals.
- Goal-text definition and goal-driven agent probing.
- DB-backed project records, run history, or progress views.
- Smart "most efficient" fan-out scheduling. Today's behaviour stays:
  sequential across cycles, parallel-3 within each cycle, via the existing
  `scripts/systemtest-fanout.sh`.

## Architecture

### One new helper

Add to `tests/e2e/lib/systemtest-runner.ts`:

```ts
export async function walkSystemtestByTemplate(
  page: Page,
  n: number,
  opts?: { extraOverrides?: Record<number, 'erfüllt' | 'teilweise' | 'nicht erfüllt'> },
): Promise<WalkResult>
```

What it does:

1. Imports `SYSTEM_TEST_TEMPLATES` from
   `website/src/lib/system-test-seed-data.ts` (already a value-only TS module
   safe to import from tests — it has no Astro/runtime dependencies, and
   `resolveDomain()` falls back to `'localhost'` when `PROD_DOMAIN` is unset,
   which is the right default for the tests' `WEBSITE_URL`-driven flow).
2. Looks up the template whose title starts with `System-Test ${n}:` (regex
   `^System-Test ${n}:`).
3. Computes `optionByPosition` automatically via a small pure helper
   `deriveOptionsFromSeed(template)` (also exported, for unit testing):
   every step where `agent_notes` is a non-empty string → `'teilweise'`.
   All other positions inherit the default `'erfüllt'`. A caller-supplied
   `extraOverrides` wins over the auto-derived value (for the rare case a
   template-level override is needed that the seed metadata does not
   capture).
4. Delegates to the existing `walkSystemtest(page, { templateTitlePrefix:
   'System-Test ${n}', defaultOption: 'erfüllt', optionByPosition })`.
5. Asserts `result.steps.length === template.steps.length` (exact match — the
   wizard should walk every step the seed declares).
6. Asserts `result.submitted === true` and
   `result.templateTitle.startsWith('System-Test ${n}:')`.
7. Returns the underlying `WalkResult` so callers can add their own assertions
   if needed.

### Nine new spec files

Each is a thin wrapper following the same shape:

```ts
// tests/e2e/specs/systemtest-01-auth.spec.ts
import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 1: Authentifizierung & SSO', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);
  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 1);
  });
});
```

Filenames (matching `scripts/systemtest-fanout.sh` package names exactly so
the `for pkg in PACKAGES` loop resolves them without further changes):

- `systemtest-01-auth.spec.ts`
- `systemtest-02-admin-crm.spec.ts`
- `systemtest-03-kommunikation.spec.ts`
- `systemtest-07-rechnungen.spec.ts`
- `systemtest-08-buchhaltung.spec.ts`
- `systemtest-09-monitoring.spec.ts`
- `systemtest-10-externe.spec.ts`
- `systemtest-11-livekit.spec.ts`
- `systemtest-12-projektmanagement.spec.ts`

Describe-block titles mirror the seed `title` field minus the
`System-Test N: ` prefix (so failure reports stay readable).

### 04/05/06 migrate to the helper

Same PR rewrites the existing three specs to use `walkSystemtestByTemplate`:

```ts
test('walks all steps and submits', async ({ page }) => {
  await walkSystemtestByTemplate(page, 4);
});
```

Their old hardcoded `optionByPosition` and `>=N` step-count assertions go
away. The seed data stays the source of truth — the comment block in each
spec that documented *why* each step was `teilweise` migrates to a comment
next to the step itself in `system-test-seed-data.ts`, where it belongs (it
describes the test step, not the spec). If the seed already documents the
constraint via the step's `question_text` (e.g. "→ Nutzer:" markers), no
extra comment is added.

## Test-data hygiene

Already handled by `tests/e2e/specs/global-db-cleanup.ts` (POST
`/api/admin/systemtest/purge-all-test-data`) — runs as Playwright
`globalSetup` and `globalTeardown`. Each spec creates a fresh assignment
under the admin's own customer record; teardown purges. No new code needed.

## Cluster targeting

Already handled — caller passes `WEBSITE_URL` and `PROD_DOMAIN` via
`scripts/systemtest-fanout.sh <cycle> <env>`, which sets them per env
(`mentolder` / `korczewski` / `dev`). No spec-level changes.

## Pre-flight invocation

The "make sure all 12 don't fail due to staleness" step is just running the
existing fan-out script across the four cycles after this PR lands:

```bash
E2E_ADMIN_PASS=… bash scripts/systemtest-fanout.sh 1 mentolder
E2E_ADMIN_PASS=… bash scripts/systemtest-fanout.sh 2 mentolder
E2E_ADMIN_PASS=… bash scripts/systemtest-fanout.sh 3 mentolder
E2E_ADMIN_PASS=… bash scripts/systemtest-fanout.sh 4 mentolder
```

Failures land on `/admin/systemtest/board.astro` via the existing
failure-bridge. Same on korczewski. The kanban surfacing the result IS the
staleness check — no separate check command is added in this sub-project.

## Testing

- **Unit**: one small test at `tests/e2e/lib/systemtest-runner.test.ts` that
  calls `walkSystemtestByTemplate`'s pure inner — the
  `optionByPosition`-from-seed computation factored out as a separate
  exported function — against a synthetic template definition and asserts
  the result. No browser, no real seed import. This guarantees the
  auto-derive logic stays correct as templates evolve.
- **Integration**: the 9 new specs themselves. Once before merge, run all
  four cycles against `WEBSITE_URL=https://web.mentolder.de` (and again
  against korczewski). Document the run on the PR.
- **CI**: no change. System-Test specs are not part of `task test:all`; they
  remain operator-driven via the fan-out script.

## Risks / open questions

- **Step-text rot**: if a wizard option label or step heading changes,
  `walkSystemtest`'s string matchers can fail. Out of scope to harden here —
  surfaces as a concrete failure on the board, which is the correct signal.
- **Cluster seed drift**: both clusters' DBs are seeded from the same
  `system-test-seed-data.ts`, but if a manual edit drifted one DB, the exact
  step-count assertion will fail on the stale cluster. Mitigation: re-seed
  via the same loader the website uses; the failing cycle is the discovery
  signal.
- **Seed-data import path from tests**: the test process must be able to
  resolve `website/src/lib/system-test-seed-data.ts`. The existing tests
  already cross that boundary (e.g. `walkSystemtest` imports types and
  helpers from `tests/e2e/lib/`); the new import follows the same TS
  resolution. If `tsconfig` paths need a tweak, the implementation phase
  handles it.
- **Templates that have NO `agent_notes` step but realistically need one**:
  the seed today already marks every human-action step. If a future seed
  update misses a real human-action step, the spec will try to walk it as
  `'erfüllt'` and likely fail with a brittle DOM error rather than a clean
  `teilweise`. Mitigation: that's a seed-data bug, fixed by updating the
  seed (which is what we want — single source of truth).

## Out of scope (handed to Sub-project B)

- Project creation UI under `/admin/systemtest/projects`.
- DB schema for `systemtest_projects` and run history.
- Up-to-5 goals and goal-driven agent probes layered on top of the spec walk.
- "Most efficient" fan-out scheduling beyond today's cycle-based parallel-3.
- Per-project cluster picker (today: `WEBSITE_URL` env var via the fan-out
  script — UI picker comes with Sub-project B).
