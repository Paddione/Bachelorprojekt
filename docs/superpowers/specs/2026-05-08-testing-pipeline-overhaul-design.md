# Testing pipeline overhaul — design

**Date:** 2026-05-08
**Status:** Approved (brainstorming → writing-plans handoff pending)
**Owner:** Patrick

## Goal

Bring the testing pipeline to an industry-standard baseline: trim dead weight, gate PRs with E2E smoke, give the operator dashboard real observability over runs and flake, and remove the legacy staleness report.

## Current state (audit, 2026-05-08)

- **Offline tests** (`task test:all`): BATS unit (15 files) + manifest validation + art-library + Taskfile dry-run. Runs on every PR via `.github/workflows/ci.yml`. ~2–3 min. Gates merge.
- **Functional runner** (`tests/runner.sh`): 55 local + 8 prod tests across FA/SA/NFA/AK. NFA serial, others parallel (default `-j 1`). Outputs JSONL → finalized JSON+MD in `tests/results/`. **Not in CI.**
- **E2E** (`tests/e2e/`, Playwright): 47 specs in 6 projects (website/services/admin/korczewski/smoke/ios). Runs nightly 03:00 UTC + manual via `e2e.yml`. **Not on PRs.**
- **Dashboard** (`/admin/monitoring`): `TestsTab.svelte` already has live `TestRunner` (EventSource log stream), `PlaywrightPanel`, run history. 6 admin endpoints (`tests/run`, `tests/stream/{jobId}`, `tests/results/{jobId}`, `tests/report`, `tests/playwright-report`, `test-runs`). DB has `test_runs` (aggregate counts only) and `staleness_reports` (legacy).
- **Dead weight**: ~30 test files permanently skipped because Mattermost/InvoiceNinja are gone (FA-01..08, FA-09, FA-22, SA-06, SA-09 + FA-09-init.sh). Many other tests have conditional skips silently hidden in reports. Recent commit `30ff067d` already sunset the health-check BATS — cleanup pattern is established.
- **Staleness report** (legacy, to remove): 2 endpoints + 1 DB table + 1 webhook secret + 1 OverviewTab card + 1 notification type. External webhook source is unknown.
- **CI gaps**: no JUnit XML, no PR annotations, no GitHub Checks, no artifact upload, no flake tracking.

## Scope

In: cleanup, staleness removal, CI smoke job, dashboard observability (trend + flake + traceability), perf hygiene.
Out: GitHub Actions PR-comment integration, code coverage tracking, per-cluster trend split.

## Design

### 1. Cleanup (dead-code removal)

Concrete state on disk (audited 2026-05-08): only one dead file actually exists — `tests/local/FA-09-init.sh` (525 bytes, billing-bot init stub). The other Mattermost/InvoiceNinja files (FA-01..08, FA-22, SA-06, SA-09) were already deleted in a prior cleanup; only `CLAUDE.md` still claims they exist.

Delete:
- `tests/local/FA-09-init.sh`

Update:
- Replace the "Note: FA-01..FA-08, FA-09 (InvoiceNinja bucket), FA-22, SA-06, SA-09 are fully skipped" line in `CLAUDE.md` with the truthful current state ("FA-09 init removed; some FA-/SA- IDs gapped due to Mattermost/InvoiceNinja removal — see git history").
- IDs stay reserved — gaps are traceable in git history.

### 2. Staleness report — full removal

Delete:
- `website/src/pages/api/admin/staleness-report.ts`
- `website/src/pages/api/admin/staleness-webhook.ts`
- `StalenessReport` interface + `saveStalenessReport()` + `getLatestStalenessReport()` from `website/src/lib/website-db.ts`
- Staleness card + fetch from `website/src/components/admin/monitoring/OverviewTab.svelte` (lines 39-40 fetch, lines 128-178 card + summary)
- The entire `BerichteTab.svelte` staleness fetch + table (second consumer found during audit)
- `'staleness'` notification type from `website/src/lib/notifications.ts:5` (NotificationType union) and `:14` (TYPE_DEFAULTS map)
- `STALENESS_WEBHOOK_SECRET` from `environments/.secrets/mentolder.yaml` and `environments/.secrets/korczewski.yaml`
- Re-run `task env:seal ENV=mentolder` and `task env:seal ENV=korczewski` to drop the secret from the sealed bundles
- Remove from `environments/schema.yaml` if listed there

Schema removal (no numbered migrations directory exists in this repo — schema is owned by `k3d/website-schema.yaml` ConfigMap init+ensure scripts):
- Remove the `CREATE TABLE staleness_reports` block from `k3d/website-schema.yaml` (around line 326-332).
- Apply `DROP TABLE IF EXISTS staleness_reports;` to both clusters via a one-shot psql command run by `task workspace:psql ENV=mentolder -- website` and `ENV=korczewski` (documented in the plan as a manual operator step after deploy).

### 3. CI: add E2E smoke job to PRs

New job `e2e-smoke` in `.github/workflows/ci.yml`:
- Triggers on `pull_request`, depends on `offline-tests` passing.
- Runs `npx playwright test --grep=@smoke` against `https://web.mentolder.de` (read-only, prod).
- Tag ~5–8 critical specs with `@smoke`: login flow, homepage, messaging open, files list, brett render, admin login, korczewski homepage. Use the existing `integration-smoke.spec.ts` as the seed — extend, don't duplicate.
- Time budget: ~5–7 min. Hard timeout 10 min.
- Emit JUnit XML via `playwright.config.ts` reporter array (`['junit', { outputFile: 'results/junit.xml' }]`).
- Upload JUnit + HTML report as PR artifact.
- Failure blocks merge.
- Flake-prone specs get `test.fixme` rather than `retries > 0` — fix or quarantine, never retry.

The existing `e2e.yml` (full nightly + manual) stays unchanged.

### 4. Dashboard observability

#### 4a. Schema change

Add `test_results` table for per-test rows (today only aggregate counts in `test_runs`). Note: `test_runs.id` is `TEXT` (job UUID), so `run_id` must also be TEXT:

```sql
CREATE TABLE IF NOT EXISTS test_results (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  test_id     TEXT NOT NULL,             -- 'FA-03', 'fa-admin-billing T2'
  category    TEXT NOT NULL,             -- 'FA' | 'SA' | 'NFA' | 'AK' | 'E2E' | 'BATS'
  status      TEXT NOT NULL,             -- 'pass' | 'fail' | 'skip'
  duration_ms INT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_results_test_id_created_idx ON test_results (test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS test_results_run_id_idx ON test_results (run_id);
```

Schema lives in `k3d/website-schema.yaml` (added to both the init script and the ensure script for idempotency on existing clusters).

#### 4b. Ingestion

- `tests/runner.sh` already writes JSONL. The dashboard's job runner (the code in `website/src/pages/api/admin/tests/run.ts` and the spawned subprocess) reads JSONL on stream completion. Add a new helper `website/src/lib/test-ingest.ts` that takes a finalized JSONL/JSON payload and the run_id and bulk-inserts per-test rows into `test_results`. Call it from the existing `tests/run.ts` finalize path and from a new `/api/admin/tests/ingest-e2e` endpoint that accepts a Playwright JSON report.
- Playwright JSON reporter output (`tests/results/.tmp-e2e-results.json`) is parsed by the new ingester: when admin triggers via dashboard, after the spawned `npx playwright test` exits, the runner reads the JSON and POSTs to `/api/admin/tests/ingest-e2e`. Same helper writes rows with `category='E2E'`.

#### 4c. New components in `website/src/components/admin/monitoring/`

1. **`TrendChart.svelte`** — line chart, last 30 days. X = day, Y1 = pass/fail/skip ratio (stacked area), Y2 = p50/p95 duration. Reads `/api/admin/tests/trend?days=30`. Renders in `TestsTab` above the existing `TestRunner`.
2. **`FlakeMatrix.svelte`** — table: each `test_id` × last 10 runs, colored cells (green=pass, red=fail, grey=skip). Sorted by failure rate descending. Cells link to the failing run's detail. Reads `/api/admin/tests/flake?limit=10`.
3. **`TraceabilityMatrix.svelte`** — table: every requirement ID (FA/SA/NFA/AK) × test file path × last status × last-run timestamp × link to file in repo. Inventory built by `scripts/build-test-inventory.sh` (bash + jq), which scans:
   - `tests/local/*.sh` headers (`# Requirement: FA-03` line if present, else infer from filename via the `FA-NN-` prefix)
   - `tests/e2e/specs/*.spec.ts` `describe()` titles
   - Output: `website/src/data/test-inventory.json` (committed). Regenerated by `task test:inventory`. CI step in `ci.yml` runs `task test:inventory` and fails if `git diff --exit-code` reports drift.

#### 4d. New API endpoints

- `GET /api/admin/tests/trend?days=30` → daily aggregate from `test_runs`.
- `GET /api/admin/tests/flake?limit=10` → per-test recent history (joins `test_runs` + `test_results`).
- `GET /api/admin/tests/traceability` → returns `test-inventory.json` joined with last `test_results.status` per `test_id`.

### 5. Performance hygiene

- Change `tests/runner.sh` default `MAX_PARALLEL_JOBS` from 1 to `$(nproc)/2` (cap 4). Keep `--jobs N` override.
- Add `--fail-fast` flag to `runner.sh`. When set, abort the parallel pool on first failure. Used by CI smoke job; default off for full local runs.
- Prune `tests/results/` retention: small CronJob in workspace ns deletes `*.json`/`*.md` older than 30 days from the dashboard pod's mounted volume. Manifest in `k3d/tests-retention-cronjob.yaml`.

## Build sequence

| Phase | Work | Risk | Blocks |
|-------|------|------|--------|
| A | Cleanup dead test files + staleness removal + DB migration | Low | — |
| B | `test_results` schema + ingestion in runner + e2e | Low | C |
| C | TrendChart + FlakeMatrix + TraceabilityMatrix + endpoints | Med (UI) | — |
| D | `@smoke` tagging + e2e-smoke CI job + JUnit XML artifacts | Low | — |
| E | Parallelism default + fail-fast + retention CronJob | Low | — |

A is independent. B blocks C. D and E are independent of A/B/C.

## Out of scope (explicit YAGNI)

- GitHub Actions PR-comment bot — JUnit + Checks via `mikepenz/action-junit-report` is enough.
- Code coverage tracking — BATS doesn't really do coverage; adding nyc to Astro just for this is overkill.
- Per-cluster trend split — one chart for both clusters.
- Migrating away from `tests/runner.sh` to a "real" framework — the runner works, just needs cleanup.

## Risks

- **Migration**: dropping `staleness_reports` is destructive. Mitigation: take a JSON snapshot of the table before dropping (CronJob output to a backup PVC), commit no rollback step.
- **Smoke flake**: prod-targeting smoke against `web.mentolder.de` will flake if the cluster is mid-deploy. Mitigation: `@smoke` specs are read-only and idempotent; if flake rate exceeds 5% in the first two weeks, gate the job behind a `[ci-smoke]` PR label until stable.
- **Per-test ingestion overhead**: 47 e2e specs × ~5 cases avg × N runs/day = small. Indexes cover query patterns. Low risk.
- **Inventory drift**: `test-inventory.json` becomes stale if not regenerated. Mitigation: pre-commit hook or CI step runs `task test:inventory` and fails if the diff is non-empty.

## Acceptance criteria

- [ ] Skipped Mattermost/InvoiceNinja test files are gone; `tests/runner.sh local` shows zero entries for them.
- [ ] `staleness_reports` table dropped on both clusters; admin OverviewTab no longer fetches it; webhook secret removed from sealed bundles.
- [ ] `e2e-smoke` job runs on PRs in <10 min, blocks merge on failure, uploads JUnit + HTML.
- [ ] `/admin/monitoring` Tests tab shows TrendChart, FlakeMatrix, TraceabilityMatrix above TestRunner.
- [ ] `task test:inventory` regenerates the requirement-to-test mapping.
- [ ] `tests/runner.sh` defaults to nproc/2 parallelism; `--fail-fast` flag works.
- [ ] Retention CronJob keeps `tests/results/` ≤30 days.
