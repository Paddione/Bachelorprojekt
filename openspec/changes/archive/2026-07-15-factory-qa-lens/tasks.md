---
title: "factory-qa-lens — Implementation Plan"
ticket_id: T001814
domains: [factory, ci, staging]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-qa-lens — Implementation Plan

_Ticket: T001814 — executing QA lens in the Factory Verify phase. Depends on Change 1 (`factory-sandbox-runner`, T001813, already merged: `scripts/factory/sandbox-run.sh`)._

## File Structure

```
scripts/factory/qa-lens.mjs                      NEW  — executing qa-lens CLI (test:changed then staging deploy then playwright smoke then findings JSON)
scripts/factory/pipeline.js                      EDIT — wire qa into the tier==='full' verify branch (append qa findings to reviews[])
tests/spec/software-factory.bats                 EDIT — add FA-SF-QA @test blocks (convention: one spec file, no ticket-numbered file)
openspec/changes/factory-qa-lens/specs/software-factory.md  EDIT — fill delta-spec (ADDED Requirements)
```

### S1 budget notes (per plan-quality-gates.md)

- `scripts/factory/qa-lens.mjs` — NEW `.mjs`, static limit **500**, not baselined, effective budget **500**. Target 340 lines to keep growth reserve; if the CLI approaches 400 lines, split the playwright/deploy helpers into `scripts/factory/qa-lens-smoke.mjs` (extract) rather than shrinking cosmetically.
- `scripts/factory/pipeline.js` — Ist **741**, static `.js` limit 600. **Sanctioned S1 exception**: listed in `docs/code-quality/gates.yaml` `s1.ignore` (monolithic Workflow script; harness forbids top-level imports / dynamic `import()`). `check.mjs` skips it, so no line budget is enforced. The delta stays minimal regardless (qa is a subprocess, not a prompt lens, so `ALL_LENSES` is untouched; only ~15 lines that spawn `qa-lens.mjs` and push its result into `reviews[]`).
- `tests/spec/software-factory.bats` — S1-exempt (`gates.yaml` `s1.ignore` matches `tests/**/*.bats`). No budget.
- Markdown specs — not S1-checked.
- No `website/src/**` files touched, so the CQ02 any-type gate and the Vitest-coverage gate do not apply.

## Design decisions (locked)

1. **qa-lens is a subprocess, not a prompt lens.** The existing lenses in `ALL_LENSES` are LLM prompt files consumed by `agent()`. The qa-lens instead *executes* code, so it is a standalone ESM CLI `scripts/factory/qa-lens.mjs` invoked via `execFileSync('node', [...])` — mirroring the `node scripts/factory/review-finding-filter.mjs --cli` pattern already in `pipeline.js` (line ~538). It prints a `REVIEW_SCHEMA`-shaped `{ "findings": [...], "summary": "..." }` object on stdout. This sidesteps the CommonJS-vs-ESM `require()` problem and keeps the `pipeline.js` delta tiny.
2. **Only tier `full`.** `pipeline.js` runs qa-lens only inside the existing `if (tier === 'full' …)` region of the verify phase — the costliest lens for the riskiest diffs.
3. **Shared `workspace-staging` as an exclusive resource.** Deploy targets `ENV=staging` (shared `workspace-staging` namespace on fleet, LiveKit/LLM disabled per `environments/staging.yaml`). Because it is shared, full-tier tickets serialize on a new `agent-lock.sh` scope `staging`.
4. **Degradation, never a hard crash.** Lock held/timeout OR staging deploy unavailable causes qa-lens to run `task test:changed` only and return a single `severity: medium` finding (non-blocking) instead of `high`. The staging lock is always released in a `finally`.
5. **No brand-domain literals (S3).** The staging and prod smoke base URLs are resolved from env (`WEBSITE_SITE_URL` / `PROD_DOMAIN`), never hardcoded.

---

## Task 1 — RED: failing BATS tests for the qa-lens contract

Add the `FA-SF-QA` block to `tests/spec/software-factory.bats` (append near the existing `FA-SF-SANDBOX` blocks, ~line 3237). These assert the qa-lens CLI contract and the pipeline wiring. They MUST fail now because `scripts/factory/qa-lens.mjs` does not yet exist and `pipeline.js` has no qa wiring.

Tests to add:

- `FA-SF-QA: qa-lens.mjs exists and prints REVIEW_SCHEMA-shaped JSON in degraded mode` — invoke the CLI against a nonexistent worktree with `FACTORY_SANDBOX=off` and `FACTORY_QA_SKIP_STAGING=1`; assert stdout parses as JSON and has a `.findings` array.
- `FA-SF-QA: qa-lens degradation emits a single medium finding, never high, when staging is skipped` — same invocation; assert `jq '[.findings[]|select(.severity=="high" or .severity=="critical")]|length'` equals 0 and at least one `medium` finding is present.
- `FA-SF-QA: qa-lens claims and releases the staging agent-lock scope` — grep the source for `agent-lock.sh claim staging`, `agent-lock.sh release staging`, and a `finally` release.
- `FA-SF-QA: qa-lens resolves smoke base URLs from env, never a brand-domain literal` — grep asserts no `.korczewski.de` / `.mentolder.de` string literal in `qa-lens.mjs`, and that `WEBSITE_SITE_URL` / `PROD_DOMAIN` are read from env.
- `FA-SF-QA: pipeline.js wires qa-lens into the full-tier verify branch` — grep `pipeline.js` for `qa-lens.mjs` spawned within the `tier === 'full'` region.

Run the tests — they MUST be red:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-QA"
# expected: FAIL (red — qa-lens.mjs and the pipeline wiring do not exist yet)
```

## Task 2 — GREEN: implement `scripts/factory/qa-lens.mjs`

Create the executing qa-lens CLI. Argument contract:

```
node scripts/factory/qa-lens.mjs \
  --worktree <WORK_WT> --branch <WORK_BRANCH> --ticket <T-id> \
  --diff-range origin/main...HEAD
```

Behaviour — every step is wrapped so any failure becomes a *finding*, never an uncaught throw:

1. **test:changed in the sandbox.** Run `task test:changed` through the sandbox runner, reusing the established pattern `bash scripts/factory/sandbox-run.sh <worktree> "task test:changed"` (identical to `build-loop.cjs:wrapSandbox`). Non-zero exit means push a `severity: high` finding (`file` = first changed path or `"(qa-lens)"`, `description` = failing-test summary). This step runs regardless of staging availability.
2. **Claim the staging lock.** `bash scripts/agent-lock.sh claim staging <ticket> --branch <branch> --worktree <worktree> --label qa-lens`. Retry with backoff up to `FACTORY_QA_STAGING_LOCK_TIMEOUT` (default 900 s). If never acquired, OR `FACTORY_QA_SKIP_STAGING=1`, OR staging is unreachable, then **degrade**: skip steps 3–4, add ONE `severity: medium` finding (`description`: "qa-lens degraded: staging unavailable (<reason>) — ran test:changed only, no staging/prod smoke"), and continue to output.
3. **Deploy the feature branch to staging** (inside `try`): build the website image from the worktree and push-deploy to `workspace-staging` via `ENV=staging`. Resolve the exact command through `bash scripts/vda.sh oracle 'deploy the workspace to the staging environment'` at implementation time; do not hardcode a task name that may drift. A deploy failure degrades as in step 2 (medium) and skips the smoke.
4. **Playwright smoke** (still inside `try`):
   - Staging smoke (tests the NEW code): run `npx playwright test --project=smoke` from `tests/e2e` with `WEBSITE_URL` set to the staging site URL read from the staging env (`WEBSITE_SITE_URL`), never a literal. Failure means a `severity: high` finding.
   - Read-only prod regression smoke (baseline): run `npx playwright test --project=smoke` with `WEBSITE_URL` set to `https://$PROD_DOMAIN`, where `PROD_DOMAIN` comes from the brand env / `k3d/configmap-domains.yaml`. This is a non-mutating baseline; a failure here is reported as `severity: medium` (live-prod noise must not hard-block a feature merge), with a clear description.
5. **Release the lock** in `finally`: `bash scripts/agent-lock.sh release staging <ticket>`. Always runs, even on throw.
6. **Output.** Print `JSON.stringify({ findings, summary })` to stdout (matching `REVIEW_SCHEMA`). Diagnostics go to stderr only. Exit 0 even when findings exist — blocking is decided by `pipeline.js`, not by the exit code.

Keep the file at or under ~340 lines; factor the playwright and deploy helpers into small local functions.

## Task 3 — GREEN: wire qa-lens into `pipeline.js` verify phase

Edit the `tier === 'full'` region of the verify phase (currently `pipeline.js` line ~556, immediately before or after the coordinator block). Minimal delta:

- Spawn the qa-lens CLI with `execFileSync('node', [...qa-lens.mjs args...], { encoding: 'utf8', timeout: … })`, wrapped in try/catch (fail-open: a spawn error becomes a single `medium` finding, never crashes verify).
- `JSON.parse` its stdout and push `{ findings, summary }` into the existing `reviews` array **before** `rawBlocking` and the coordinator are computed. Because `reviews.flatMap(r => r.findings)` already feeds both `rawBlocking` (line ~585) and the coordinator XML (line ~557), qa `high`/`critical` findings automatically block the merge with no change to the blocking logic.
- Emit a `phaseEvent('verify', 'qa', <summary>)` breadcrumb (structured detail, at most 240 chars) so the qa result is captured as a verify-phase event (per the "Quality-Gate-Ergebnisse als verify-Phase-Events" convention).
- Gate the whole block behind `tier === 'full'` (it already is) and behind an opt-out env `FACTORY_QA_LENS !== 'off'`.

Then confirm the previously-red tests now pass:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "FA-SF-QA"
# expected: PASS (green)
node --check scripts/factory/pipeline.js
```

## Task 4 — Delta-spec: `openspec/changes/factory-qa-lens/specs/software-factory.md`

Replace the `### Requirement: TODO` skeleton with real `## ADDED Requirements` describing: the executing qa-lens (tier `full` only), the `staging` agent-lock scope serializing the shared `workspace-staging` namespace, the deploy + dual playwright smoke, and the degradation path. English Requirements + Scenarios (GIVEN/WHEN/THEN) per `openspec/config.yaml` `rules.specs`; H3 `### Requirement:`. Validate:

```bash
bash scripts/openspec.sh validate
```

## Task 5 — Final Verification

Regenerate the test inventory (a BATS spec file was edited) and run the three mandatory CI gates:

```bash
task test:inventory        # regenerate website/src/data/test-inventory.json (BATS blocks changed)
task test:changed          # targeted tests for changed domains (BATS selection + quality)
task freshness:regenerate  # refresh generated artifacts
task freshness:check       # CI-equivalent: freshness + quality:check (S1-S4 ratchet) + baseline assertion
```
