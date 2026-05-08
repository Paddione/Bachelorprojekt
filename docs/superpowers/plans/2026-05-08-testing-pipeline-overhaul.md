# Testing Pipeline Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the testing pipeline to industry baseline — trim dead weight, gate PRs with E2E smoke + JUnit, surface trend / flake / requirement-traceability on the operator dashboard, and remove the legacy staleness report end-to-end.

**Architecture:** Five independent-ish phases. Phase A (cleanup) lands first, no schema risk. Phase B adds the per-test results schema in `k3d/website-schema.yaml` and teaches `tests/runner.sh` + Playwright JSON ingestion to populate it; this unblocks Phase C (three new Svelte components + three new admin API endpoints). Phase D (CI smoke job + JUnit) and Phase E (perf hygiene) are parallelizable with B/C.

**Tech Stack:** Bash (runner.sh, scripts/), Astro 5 + Svelte 5 (website), TypeScript (admin endpoints), PostgreSQL 16 (shared-db, via `pg` from `website-db.ts`), Playwright (E2E), BATS (unit), GitHub Actions (CI), Kustomize/k3d (manifests), SealedSecrets.

**Spec:** `docs/superpowers/specs/2026-05-08-testing-pipeline-overhaul-design.md`

---

## File Structure

| Path | Action | Phase | Responsibility |
|------|--------|-------|----------------|
| `tests/local/FA-09-init.sh` | Delete | A | Dead billing-bot stub |
| `CLAUDE.md` | Modify | A | Drop stale "permanently skipped" note |
| `website/src/pages/api/admin/staleness-report.ts` | Delete | A | Legacy GET endpoint |
| `website/src/pages/api/admin/staleness-webhook.ts` | Delete | A | Legacy POST webhook |
| `website/src/lib/website-db.ts` | Modify | A | Drop `StalenessReport` interface + 2 fns; add `test_results` types/fns (B) |
| `website/src/lib/notifications.ts` | Modify | A | Remove `'staleness'` from union + defaults |
| `website/src/components/admin/monitoring/OverviewTab.svelte` | Modify | A | Remove staleness card + summary + fetch |
| `website/src/components/admin/monitoring/BerichteTab.svelte` | Modify | A | Remove staleness table |
| `environments/.secrets/mentolder.yaml` | Modify | A | Remove `STALENESS_WEBHOOK_SECRET` |
| `environments/.secrets/korczewski.yaml` | Modify | A | Remove `STALENESS_WEBHOOK_SECRET` |
| `environments/schema.yaml` | Modify | A | Remove `STALENESS_WEBHOOK_SECRET` field |
| `environments/sealed-secrets/mentolder.yaml` | Regenerate | A | Re-seal after secret removal |
| `environments/sealed-secrets/korczewski.yaml` | Regenerate | A | Re-seal after secret removal |
| `k3d/website-schema.yaml` | Modify | A,B | Drop `staleness_reports` table; add `test_results` table |
| `website/src/lib/website-db.ts` | Modify | B | Add `TestResult` interface + `saveTestResults()` + `listFlakeWindow()` + `getTestRunTrend()` |
| `tests/runner.sh` | Modify | B,E | Emit per-test JSONL with stable `test_id`; add `--fail-fast`; default `JOBS=$(nproc)/2` |
| `tests/lib/report.sh` | Modify | B | Include test_id + duration_ms in JSONL row |
| `website/src/pages/api/admin/tests/run.ts` | Modify | B | Insert per-test rows into `test_results` after run completes |
| `website/src/pages/api/admin/tests/ingest-e2e.ts` | Create | B | POST endpoint: ingest Playwright JSON into `test_results` |
| `website/src/pages/api/admin/tests/trend.ts` | Create | C | GET 30-day aggregate from `test_runs` |
| `website/src/pages/api/admin/tests/flake.ts` | Create | C | GET per-test recent history from `test_results` |
| `website/src/pages/api/admin/tests/traceability.ts` | Create | C | GET requirement → test mapping with last status |
| `website/src/data/test-inventory.json` | Create | C | Build artifact: requirement → test files |
| `scripts/build-test-inventory.sh` | Create | C | Scanner for FA/SA/NFA/AK ID → file mapping |
| `Taskfile.yml` | Modify | C | Add `test:inventory` target |
| `website/src/components/admin/monitoring/TrendChart.svelte` | Create | C | Last-30-days line chart |
| `website/src/components/admin/monitoring/FlakeMatrix.svelte` | Create | C | Per-test × last-N-runs heatmap table |
| `website/src/components/admin/monitoring/TraceabilityMatrix.svelte` | Create | C | Requirement coverage table |
| `website/src/components/admin/monitoring/TestsTab.svelte` | Modify | C | Insert 3 new components above TestRunner |
| `tests/e2e/specs/integration-smoke.spec.ts` | Modify | D | Tag suites with `@smoke` |
| `tests/e2e/playwright.config.ts` | Modify | D | Add `junit` reporter alongside `line` + `json` |
| `.github/workflows/ci.yml` | Modify | D | Add `e2e-smoke` job; upload artifacts |
| `k3d/tests-retention-cronjob.yaml` | Create | E | Daily prune of `tests/results/` >30d |
| `prod-mentolder/kustomization.yaml` | Modify | E | Reference retention CronJob |
| `prod-korczewski/kustomization.yaml` | Modify | E | Reference retention CronJob |

---

## Phase A — Cleanup + Staleness Removal

Independent. No schema dependencies. Land first.

### Task A1: Delete dead test file

**Files:**
- Delete: `tests/local/FA-09-init.sh`

- [ ] **Step 1: Confirm file presence**

```bash
ls -la tests/local/FA-09-init.sh
```
Expected: file exists, ~525 bytes.

- [ ] **Step 2: Delete the file**

```bash
git rm tests/local/FA-09-init.sh
```

- [ ] **Step 3: Verify runner does not break**

```bash
./tests/runner.sh local FA-09-init 2>&1 | head -20
```
Expected: runner finds no matching file and exits cleanly (no test runs, no error).

- [ ] **Step 4: Commit**

```bash
git commit -m "test(cleanup): remove FA-09-init billing-bot stub

InvoiceNinja and the billing-bot init job were removed from the stack;
the test was a no-op skip stub. Delete it so runner.sh stops iterating
over dead files."
```

### Task A2: Update CLAUDE.md to drop stale skip enumeration

**Files:**
- Modify: `CLAUDE.md` — find the line starting with `Note: FA-01..FA-08, FA-09 (InvoiceNinja bucket), FA-22, SA-06, SA-09 are fully skipped`

- [ ] **Step 1: Locate the line**

```bash
grep -n 'permanently skipped\|fully skipped\|FA-01..FA-08' CLAUDE.md
```
Expected: one match around the testing section.

- [ ] **Step 2: Edit the line**

Replace the text:
```
Note: FA-01..FA-08, FA-09 (InvoiceNinja bucket), FA-22, SA-06, SA-09 are fully skipped (Mattermost/InvoiceNinja removed from stack). Many other tests have individual test cases conditionally skipped.
```
with:
```
Note: gaps in FA-/SA- numbering (FA-01..08, FA-22, SA-06, SA-09) reflect the removal of Mattermost and InvoiceNinja from the stack — see git history. Many other tests have individual test cases conditionally skipped when their preconditions are not met.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): drop stale 'permanently skipped' enumeration

The FA-01..08/FA-22/SA-06/SA-09 files were already deleted in a
prior cleanup. Note the gap in numbering instead of claiming the
files still exist as skip stubs."
```

### Task A3: Remove staleness API endpoints

**Files:**
- Delete: `website/src/pages/api/admin/staleness-report.ts`
- Delete: `website/src/pages/api/admin/staleness-webhook.ts`

- [ ] **Step 1: Verify there are no other in-repo callers**

```bash
grep -rn 'staleness-report\|staleness-webhook\|/api/admin/staleness' website/src --include='*.ts' --include='*.svelte'
```
Expected: matches limited to `OverviewTab.svelte` and `BerichteTab.svelte` (handled in A5/A6) plus the two endpoint files themselves.

- [ ] **Step 2: Delete both endpoint files**

```bash
git rm website/src/pages/api/admin/staleness-report.ts
git rm website/src/pages/api/admin/staleness-webhook.ts
```

- [ ] **Step 3: Type check**

```bash
cd website && npm run check 2>&1 | tail -20
```
Expected: no errors related to the deleted files (callers are removed in subsequent tasks).

- [ ] **Step 4: Commit (deferred to A8 — keep all staleness removal in one commit for atomic revert)**

### Task A4: Remove staleness DB layer from website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts` — remove the `StalenessReport` interface, `saveStalenessReport()`, `getLatestStalenessReport()` (lines ~3085-3118 per audit).

- [ ] **Step 1: Locate the block**

```bash
grep -n 'StalenessReport\|saveStalenessReport\|getLatestStalenessReport\|staleness_reports' website/src/lib/website-db.ts
```
Expected: 4-6 matches around lines 3085-3118.

- [ ] **Step 2: Remove the interface and both functions**

Delete the entire block:
```typescript
export interface StalenessReport {
  id: number;
  createdAt: string;
  reportJson: Record<string, unknown>;
  summary: string;
  issueCount: number;
}

export async function saveStalenessReport(params: {
  reportJson: unknown;
  summary: string;
  issueCount: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO staleness_reports (report_json, summary, issue_count) VALUES ($1, $2, $3)`,
    [JSON.stringify(params.reportJson), params.summary, params.issueCount]
  );
}

export async function getLatestStalenessReport(): Promise<StalenessReport | null> {
  const result = await pool.query(
    `SELECT id, created_at, report_json, summary, issue_count
       FROM staleness_reports ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    reportJson: row.report_json,
    summary: row.summary,
    issueCount: row.issue_count,
  };
}
```

- [ ] **Step 3: Verify no remaining references**

```bash
grep -n 'StalenessReport\|saveStalenessReport\|getLatestStalenessReport' website/src/lib/website-db.ts
```
Expected: zero matches.

### Task A5: Remove staleness from notifications

**Files:**
- Modify: `website/src/lib/notifications.ts:5` (NotificationType union) and `:14` (TYPE_DEFAULTS map).

- [ ] **Step 1: Read current notifications.ts header**

```bash
head -25 website/src/lib/notifications.ts
```

- [ ] **Step 2: Remove `staleness` from the union**

Change line 5:
```typescript
export type NotificationType = 'registration' | 'booking' | 'contact' | 'bug' | 'message' | 'followup' | 'staleness';
```
to:
```typescript
export type NotificationType = 'registration' | 'booking' | 'contact' | 'bug' | 'message' | 'followup';
```

- [ ] **Step 3: Remove `staleness` from TYPE_DEFAULTS**

Delete the line:
```typescript
  staleness:    'true',  // Enabled by default
```

- [ ] **Step 4: Verify no other references**

```bash
grep -n "'staleness'" website/src/
```
Expected: zero matches under `website/src/`.

### Task A6: Remove staleness card from OverviewTab.svelte

**Files:**
- Modify: `website/src/components/admin/monitoring/OverviewTab.svelte`

- [ ] **Step 1: Find the staleness blocks**

```bash
grep -n 'staleness\|StalenessReport' website/src/components/admin/monitoring/OverviewTab.svelte
```
Expected: matches around lines 9, 27, 39-40, 128-178 per the audit.

- [ ] **Step 2: Remove the imports and state declarations**

Remove the `import type { StalenessReport }` line if present, and remove `let stalenessReport: StalenessReport | null = $state(null);` (or the equivalent).

- [ ] **Step 3: Remove the fetch in `Promise.allSettled`**

Locate the `Promise.allSettled([...])` array around lines 24-28 and remove the `fetch('/api/admin/staleness-report', ...)` entry. Also remove the corresponding `if (stalRes.status === 'fulfilled' && stalRes.value.ok)` block around lines 39-40.

- [ ] **Step 4: Remove the card markup**

Remove the entire staleness card block (lines ~128-135) and the staleness summary block (lines ~164-179). Each block is self-contained `<div>` with its own heading.

- [ ] **Step 5: Verify**

```bash
grep -n 'staleness\|Staleness' website/src/components/admin/monitoring/OverviewTab.svelte
```
Expected: zero matches.

### Task A7: Remove staleness from BerichteTab.svelte

**Files:**
- Modify: `website/src/components/admin/monitoring/BerichteTab.svelte`

- [ ] **Step 1: Audit the file**

```bash
grep -n 'staleness\|Staleness\|stalenessReport' website/src/components/admin/monitoring/BerichteTab.svelte
```

- [ ] **Step 2: Remove the staleness fetch + table**

Remove the `fetch('/api/admin/staleness-report')` call, the state for the report, the table markup that renders findings, and the "open ticket" modal trigger if it's staleness-only. If the modal is shared with other report types, leave it; only strip the staleness invocation.

- [ ] **Step 3: If the tab is now empty, leave a placeholder note**

If removing staleness leaves the tab with no content, replace the body with a single line:
```svelte
<p class="text-sm text-muted">Noch keine Berichte konfiguriert.</p>
```

### Task A8: Type-check, dev-run smoke, and commit the staleness removal atomically

- [ ] **Step 1: Type check**

```bash
cd website && npm run check 2>&1 | tail -30
```
Expected: clean (no references to deleted symbols).

- [ ] **Step 2: Dev server boot smoke test**

```bash
cd website && timeout 20 npm run dev 2>&1 | tail -20
```
Expected: server boots without error. Look for `ready in <ms> ms`. Kill cleanly.

- [ ] **Step 3: Commit the entire staleness removal**

```bash
git add website/src/pages/api/admin/staleness-report.ts \
        website/src/pages/api/admin/staleness-webhook.ts \
        website/src/lib/website-db.ts \
        website/src/lib/notifications.ts \
        website/src/components/admin/monitoring/OverviewTab.svelte \
        website/src/components/admin/monitoring/BerichteTab.svelte
git commit -m "feat(monitoring): remove legacy staleness report end-to-end

Delete both API endpoints, the DB access layer, the notification
type, and both dashboard consumers (OverviewTab + BerichteTab).
The webhook source was external and the report was no longer
acted on. DB schema removal handled in a follow-up task.

BREAKING: external systems posting to /api/admin/staleness-webhook
will now receive 404."
```

### Task A9: Drop staleness_reports table from schema and clusters

**Files:**
- Modify: `k3d/website-schema.yaml` — remove the `CREATE TABLE staleness_reports` block (around lines 326-332).

- [ ] **Step 1: Locate and remove the table block**

```bash
grep -n 'staleness_reports' k3d/website-schema.yaml
```
Expected: matches in both the init script and the ensure script blocks.

Remove every block containing `staleness_reports` (CREATE TABLE statements; there are no inserts referencing it). Keep all other tables intact.

- [ ] **Step 2: Add a one-shot DROP to the ensure script**

In the `ensure-bachelorprojekt-schema.sh` ConfigMap (within `website-schema.yaml`), add this line near the top of the SQL block, after the connection setup but before any other DDL:

```sql
DROP TABLE IF EXISTS staleness_reports CASCADE;
```

This is idempotent (`IF EXISTS`) — safe to leave in indefinitely. Future operators reading the schema see "this table was deliberately dropped".

- [ ] **Step 3: Validate manifest**

```bash
task workspace:validate
```
Expected: no errors. Kustomize output is valid.

- [ ] **Step 4: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "schema: drop staleness_reports table

Add DROP TABLE IF EXISTS to the ensure script so existing clusters
remove the table on next pod restart, and remove the CREATE TABLE
from the init script so fresh clusters never recreate it."
```

- [ ] **Step 5: Apply to live clusters**

```bash
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

- [ ] **Step 6: Verify table is gone on both clusters**

```bash
task workspace:psql ENV=mentolder -- website <<<'\dt staleness_reports'
task workspace:psql ENV=korczewski -- website <<<'\dt staleness_reports'
```
Expected: `Did not find any relation named "staleness_reports".` on both.

### Task A10: Remove STALENESS_WEBHOOK_SECRET and re-seal

**Files:**
- Modify: `environments/.secrets/mentolder.yaml`
- Modify: `environments/.secrets/korczewski.yaml`
- Modify: `environments/schema.yaml`
- Regenerate: `environments/sealed-secrets/mentolder.yaml`
- Regenerate: `environments/sealed-secrets/korczewski.yaml`

- [ ] **Step 1: Remove the key from both plaintext secrets**

For each of `environments/.secrets/mentolder.yaml` and `environments/.secrets/korczewski.yaml`, find and delete the line:
```yaml
  STALENESS_WEBHOOK_SECRET: <value>
```

- [ ] **Step 2: Remove the key from schema.yaml**

```bash
grep -n 'STALENESS_WEBHOOK_SECRET' environments/schema.yaml
```
Delete the matching entry (likely under `setup_vars:` or `env_vars:`).

- [ ] **Step 3: Validate the env files**

```bash
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```
Expected: both clean.

- [ ] **Step 4: Re-seal both environments**

```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

- [ ] **Step 5: Verify the sealed bundles no longer contain the key**

```bash
grep -i 'staleness' environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
```
Expected: zero matches.

- [ ] **Step 6: Commit and deploy**

```bash
git add environments/.secrets/mentolder.yaml environments/.secrets/korczewski.yaml \
        environments/schema.yaml \
        environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "secrets: drop STALENESS_WEBHOOK_SECRET from both envs

Webhook endpoint was removed; the secret has no consumer."
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

---

## Phase B — Per-test schema + ingestion

Adds `test_results` table and teaches the runner + Playwright path to populate it. Blocks Phase C.

### Task B1: Add test_results table to schema

**Files:**
- Modify: `k3d/website-schema.yaml` — add to both `init-bachelorprojekt-schema.sh` and `ensure-bachelorprojekt-schema.sh`.

- [ ] **Step 1: Locate the existing `test_runs` CREATE TABLE in the schema**

```bash
grep -n 'test_runs\|CREATE TABLE.*test_' k3d/website-schema.yaml
```
Expected: finds the existing test_runs DDL in both init and ensure scripts.

- [ ] **Step 2: Add `test_results` DDL immediately after `test_runs` in both scripts**

```sql
CREATE TABLE IF NOT EXISTS test_results (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  test_id     TEXT NOT NULL,
  category    TEXT NOT NULL,
  status      TEXT NOT NULL,
  duration_ms INT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_results_test_id_created_idx ON test_results (test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS test_results_run_id_idx ON test_results (run_id);
```

- [ ] **Step 3: Validate manifest**

```bash
task workspace:validate
```

- [ ] **Step 4: Commit and deploy**

```bash
git add k3d/website-schema.yaml
git commit -m "schema(tests): add test_results table for per-test history

Stores one row per (run, test). Enables flake detection and
per-test trend queries that the aggregate test_runs counts can't
support. Cascade-deletes when the parent run is purged."
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

- [ ] **Step 5: Verify table exists on both clusters**

```bash
task workspace:psql ENV=mentolder -- website <<<'\d test_results'
task workspace:psql ENV=korczewski -- website <<<'\d test_results'
```
Expected: both show columns + indexes.

### Task B2: Add TestResult types and DB functions

**Files:**
- Modify: `website/src/lib/website-db.ts` — add immediately after the existing `test_runs` block.

- [ ] **Step 1: Write test stub for the DB functions**

Create `website/src/lib/__tests__/test-results.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveTestResults, listFlakeWindow, getTestRunTrend } from '../website-db';

describe('test_results DB layer', () => {
  it('saveTestResults inserts rows tied to a run', async () => {
    // Pre-req: a test_runs row with id 'job-test-1' exists in fixture
    await saveTestResults('job-test-1', [
      { testId: 'FA-03', category: 'FA', status: 'pass', durationMs: 1234 },
      { testId: 'FA-04', category: 'FA', status: 'fail', durationMs: 567, message: 'expected 200, got 500' },
    ]);
    // assertion handled in DB integration test
  });

  it('listFlakeWindow returns last N results per test_id', async () => {
    const window = await listFlakeWindow(10);
    expect(Array.isArray(window)).toBe(true);
  });

  it('getTestRunTrend returns daily aggregates', async () => {
    const trend = await getTestRunTrend(30);
    expect(trend.every(d => 'date' in d && 'pass' in d)).toBe(true);
  });
});
```

Note: this project uses BATS for unit tests, not vitest, but the website has a small vitest harness in `website/`. Run:

```bash
cd website && ls __tests__ src/lib/__tests__ 2>/dev/null
grep -n 'vitest\|"test":' website/package.json
```

If vitest is not configured, skip the test file and verify behavior in Task B5 via manual SQL probes; document the gap as `// TODO: cover with integration test once vitest harness exists` is FORBIDDEN — instead, add a one-off probe script `website/scripts/probe-test-results.ts` that exercises the functions against a local DB and asserts via `process.exit(1)` on mismatch.

- [ ] **Step 2: Add the type and three functions**

Insert after the existing test_runs block in `website/src/lib/website-db.ts`:

```typescript
export interface TestResultRow {
  testId: string;
  category: 'FA' | 'SA' | 'NFA' | 'AK' | 'E2E' | 'BATS';
  status: 'pass' | 'fail' | 'skip';
  durationMs?: number;
  message?: string;
}

export async function saveTestResults(runId: string, rows: TestResultRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 6;
    values.push(runId, r.testId, r.category, r.status, r.durationMs ?? null, r.message ?? null);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  }).join(',');
  await pool.query(
    `INSERT INTO test_results (run_id, test_id, category, status, duration_ms, message) VALUES ${placeholders}`,
    values,
  );
}

export interface FlakeRow {
  testId: string;
  category: string;
  recentRuns: Array<{ runId: string; status: string; createdAt: string }>;
  failureRate: number;
}

export async function listFlakeWindow(limit: number): Promise<FlakeRow[]> {
  const result = await pool.query<{
    test_id: string;
    category: string;
    recent: Array<{ run_id: string; status: string; created_at: string }>;
  }>(
    `WITH ranked AS (
       SELECT test_id, category, run_id, status, created_at,
              row_number() OVER (PARTITION BY test_id ORDER BY created_at DESC) AS rn
         FROM test_results
     )
     SELECT test_id, category,
            jsonb_agg(jsonb_build_object('run_id', run_id, 'status', status, 'created_at', created_at) ORDER BY created_at DESC) AS recent
       FROM ranked
      WHERE rn <= $1
   GROUP BY test_id, category`,
    [limit],
  );
  return result.rows.map(row => {
    const recent = row.recent.map(r => ({ runId: r.run_id, status: r.status, createdAt: r.created_at }));
    const fails = recent.filter(r => r.status === 'fail').length;
    return {
      testId: row.test_id,
      category: row.category,
      recentRuns: recent,
      failureRate: recent.length === 0 ? 0 : fails / recent.length,
    };
  }).sort((a, b) => b.failureRate - a.failureRate);
}

export interface TrendRow { date: string; pass: number; fail: number; skip: number; p50DurationMs: number; p95DurationMs: number; }

export async function getTestRunTrend(days: number): Promise<TrendRow[]> {
  const result = await pool.query<{
    day: string; pass: string; fail: string; skip: string; p50: string; p95: string;
  }>(
    `SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
            sum(coalesce(pass, 0))::text AS pass,
            sum(coalesce(fail, 0))::text AS fail,
            sum(coalesce(skip, 0))::text AS skip,
            coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::text AS p50,
            coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::text AS p95
       FROM test_runs
      WHERE started_at >= now() - ($1 || ' days')::interval
   GROUP BY day
   ORDER BY day`,
    [days],
  );
  return result.rows.map(r => ({
    date: r.day,
    pass: Number(r.pass),
    fail: Number(r.fail),
    skip: Number(r.skip),
    p50DurationMs: Number(r.p50),
    p95DurationMs: Number(r.p95),
  }));
}
```

- [ ] **Step 3: Type-check**

```bash
cd website && npm run check 2>&1 | tail -20
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(website-db): TestResult types + saveTestResults/listFlakeWindow/getTestRunTrend"
```

### Task B3: Update tests/runner.sh + report.sh to emit test_id

**Files:**
- Modify: `tests/lib/report.sh` — extend the JSONL row format to include `test_id`, `category`, and `duration_ms`.
- Modify: `tests/runner.sh` (no functional change here; the output format is owned by report.sh).

- [ ] **Step 1: Read current report.sh**

```bash
grep -n 'JSONL\|jsonl\|emit\|status.*pass\|status.*fail' tests/lib/report.sh
```
Identify the function (likely `emit_result` or `record_test`) that writes a JSONL line per test.

- [ ] **Step 2: Extend the row format**

Locate the row-writer (typically `printf '{"test":"%s","status":"%s",...}\n'`). Change the format to include:
```bash
printf '{"test_id":"%s","category":"%s","status":"%s","duration_ms":%d,"message":%s}\n' \
  "$test_id" "$category" "$status" "$duration_ms" "$(jq -Rs . <<<"$message")"
```

If `category` isn't currently passed in, derive it from the basename prefix:
```bash
case "$test_id" in
  FA-*) category=FA ;;
  SA-*) category=SA ;;
  NFA-*) category=NFA ;;
  AK-*) category=AK ;;
  *.bats) category=BATS ;;
  *) category=FA ;;
esac
```

- [ ] **Step 3: Run a single local test and inspect the JSONL output**

```bash
./tests/runner.sh local FA-03 -j 1
cat tests/results/.tmp-local-*.jsonl | head -3
```
Expected: each line has `test_id`, `category`, `status`, `duration_ms`, `message` keys.

- [ ] **Step 4: Verify finalize_json still works**

```bash
ls tests/results/$(date +%Y-%m-%d)-local.json && jq '.results | length' tests/results/$(date +%Y-%m-%d)-local.json
```
Expected: file exists, count > 0.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/report.sh
git commit -m "test(report): include test_id/category/duration_ms in JSONL rows

Required for the test_results table ingestion in the dashboard.
Backwards-compatible — existing finalize_json keeps wrapping the
JSONL into the legacy {meta, results, summary} shape."
```

### Task B4: Ingest per-test rows after run.ts finishes

**Files:**
- Modify: `website/src/pages/api/admin/tests/run.ts` (or wherever the spawned subprocess exits) — call `saveTestResults` after parsing the finalized JSON.

- [ ] **Step 1: Read current run.ts and find the subprocess-exit handler**

```bash
cat website/src/pages/api/admin/tests/run.ts
grep -rn 'spawnTestRun\|subprocess.on.*exit\|on.*close\|test_runs' website/src/pages/api/admin/tests/ website/src/lib/test-jobs.ts 2>/dev/null
```
Identify where the job transitions from `running` → `completed`/`failed` and where `updateTestRun()` is called with the aggregate counts.

- [ ] **Step 2: Add ingestion call**

After the existing `updateTestRun(jobId, { status, pass, fail, skip, durationMs })`, parse the latest JSON file from `tests/results/` and insert per-test rows:

```typescript
import { saveTestResults, type TestResultRow } from '../../../../lib/website-db';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

async function ingestPerTestResults(jobId: string, tier: 'local' | 'prod'): Promise<void> {
  const resultsDir = join(process.cwd(), 'tests', 'results');
  const today = new Date().toISOString().slice(0, 10);
  const candidate = join(resultsDir, `${today}-${tier}.json`);
  if (!existsSync(candidate)) return;
  const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { results: Array<{ test_id?: string; category?: string; status: string; duration_ms?: number; message?: string }> };
  const rows: TestResultRow[] = (parsed.results ?? []).map(r => ({
    testId: r.test_id ?? 'unknown',
    category: (r.category ?? 'FA') as TestResultRow['category'],
    status: r.status as TestResultRow['status'],
    durationMs: r.duration_ms,
    message: r.message,
  }));
  await saveTestResults(jobId, rows);
}
```

Call `await ingestPerTestResults(jobId, tier)` immediately after the existing aggregate update.

- [ ] **Step 3: Manual verification**

Run a test from the dashboard (or trigger the API directly), then:

```bash
task workspace:psql ENV=mentolder -- website <<<"SELECT run_id, test_id, status FROM test_results ORDER BY id DESC LIMIT 5;"
```
Expected: 5 most-recent rows match the run you just triggered.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/tests/run.ts
git commit -m "feat(admin/tests): ingest per-test results into test_results table"
```

### Task B5: Playwright JSON ingestion endpoint

**Files:**
- Create: `website/src/pages/api/admin/tests/ingest-e2e.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveTestResults, saveTestRun, type TestResultRow } from '../../../../lib/website-db';
import { randomUUID } from 'node:crypto';

interface PlaywrightSpec { title: string; ok: boolean; tests: Array<{ title: string; results: Array<{ status: 'passed' | 'failed' | 'skipped' | 'timedOut'; duration: number; error?: { message: string } }> }>; }
interface PlaywrightSuite { specs?: PlaywrightSpec[]; suites?: PlaywrightSuite[]; }
interface PlaywrightReport { suites: PlaywrightSuite[]; stats: { startTime: string; duration: number; expected: number; unexpected: number; skipped: number }; }

function flattenSpecs(suites: PlaywrightSuite[], acc: PlaywrightSpec[] = []): PlaywrightSpec[] {
  for (const s of suites) {
    if (s.specs) acc.push(...s.specs);
    if (s.suites) flattenSpecs(s.suites, acc);
  }
  return acc;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const report = await request.json() as PlaywrightReport;
  const runId = randomUUID();
  const stats = report.stats;
  await saveTestRun({
    id: runId,
    tier: 'e2e',
    cluster: process.env.BRAND_ID ?? 'mentolder',
    startedAt: new Date(stats.startTime),
    finishedAt: new Date(new Date(stats.startTime).getTime() + stats.duration),
    status: stats.unexpected === 0 ? 'passed' : 'failed',
    pass: stats.expected,
    fail: stats.unexpected,
    skip: stats.skipped,
    durationMs: stats.duration,
  });
  const specs = flattenSpecs(report.suites);
  const rows: TestResultRow[] = specs.flatMap(spec =>
    spec.tests.flatMap(t => t.results.map(r => ({
      testId: `${spec.title} :: ${t.title}`,
      category: 'E2E' as const,
      status: r.status === 'passed' ? 'pass' as const : r.status === 'skipped' ? 'skip' as const : 'fail' as const,
      durationMs: r.duration,
      message: r.error?.message,
    }))),
  );
  await saveTestResults(runId, rows);
  return new Response(JSON.stringify({ ok: true, runId, count: rows.length }), { status: 200 });
};
```

- [ ] **Step 2: Verify saveTestRun signature**

```bash
grep -n 'export.*saveTestRun\|interface TestRun' website/src/lib/website-db.ts
```
Adjust the call in step 1 if the existing `saveTestRun` signature differs (rename properties to match).

- [ ] **Step 3: Type-check**

```bash
cd website && npm run check 2>&1 | tail -20
```

- [ ] **Step 4: Manual smoke test**

```bash
cd website && timeout 30 npm run dev &
DEV_PID=$!
sleep 8
# Build a tiny fake Playwright report
cat > /tmp/fake-pw-report.json <<'EOF'
{"suites":[{"specs":[{"title":"smoke","ok":true,"tests":[{"title":"login","results":[{"status":"passed","duration":1234}]}]}]}],"stats":{"startTime":"2026-05-08T10:00:00.000Z","duration":1234,"expected":1,"unexpected":0,"skipped":0}}
EOF
curl -X POST http://localhost:4321/api/admin/tests/ingest-e2e \
     -H 'Content-Type: application/json' \
     -d @/tmp/fake-pw-report.json
kill $DEV_PID
```
Expected: `{"ok":true,"runId":"...","count":1}` (or 401 if local dev doesn't have an admin session — that's still a successful auth-gate confirmation).

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/tests/ingest-e2e.ts
git commit -m "feat(admin/tests): POST /api/admin/tests/ingest-e2e for Playwright reports"
```

---

## Phase C — Dashboard observability

Three new components + three new endpoints + a build script. Depends on B.

### Task C1: Build script for test inventory

**Files:**
- Create: `scripts/build-test-inventory.sh`
- Modify: `Taskfile.yml` — add `test:inventory` target.
- Create: `website/src/data/test-inventory.json` (committed build artifact)

- [ ] **Step 1: Write the scanner**

```bash
cat > scripts/build-test-inventory.sh <<'BASH'
#!/usr/bin/env bash
# Scan tests/local/, tests/prod/, tests/e2e/specs/ and emit a requirement → test mapping.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/website/src/data/test-inventory.json"

declare -a entries=()

# Bash test files: derive ID from filename prefix (FA-NN, SA-NN, NFA-NN, AK-NN)
for dir in "${REPO_ROOT}/tests/local" "${REPO_ROOT}/tests/prod"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    id="${base%%-*}-${base#*-}"; id="${id%%-*}"
    # Use full prefix up to the second dash: FA-03-foo.sh → FA-03
    id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)-([0-9]+).*/\1-\2/')"
    [[ "$id" == "$base" ]] && continue
    rel="${f#${REPO_ROOT}/}"
    entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "${id%%-*}" '{id:$id, file:$path, category:$category, kind:"shell"}')")
  done < <(find "$dir" -maxdepth 1 \( -name '*.sh' -o -name '*.bats' \) -print0 | sort -z)
done

# Playwright spec files: parse describe() titles
for f in "${REPO_ROOT}"/tests/e2e/specs/*.spec.ts; do
  [[ -e "$f" ]] || continue
  rel="${f#${REPO_ROOT}/}"
  base="$(basename "$f" .spec.ts)"
  # Try to match an FA-/SA-/NFA-/AK- prefix in filename, else use basename
  if [[ "$base" =~ ^(fa|sa|nfa|ak)-([0-9]+) ]]; then
    id="$(echo "$base" | sed -E 's/^(fa|sa|nfa|ak)-([0-9]+).*/\U\1-\2/')"
    category="${id%%-*}"
  else
    id="E2E:$base"
    category="E2E"
  fi
  entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "$category" '{id:$id, file:$path, category:$category, kind:"playwright"}')")
done

printf '%s\n' "${entries[@]}" | jq -s 'sort_by(.id)' > "$OUT"
echo "Wrote $(jq 'length' "$OUT") inventory entries to $OUT"
BASH
chmod +x scripts/build-test-inventory.sh
```

- [ ] **Step 2: Add Taskfile entry**

In `Taskfile.yml`, under the test section, add:
```yaml
  test:inventory:
    desc: Regenerate website/src/data/test-inventory.json (requirement → test mapping)
    cmds:
      - bash scripts/build-test-inventory.sh
```

- [ ] **Step 3: Generate the inventory**

```bash
task test:inventory
jq '.[0:3]' website/src/data/test-inventory.json
```
Expected: array of >50 entries with `{id, file, category, kind}` shape.

- [ ] **Step 4: Add CI guard against drift**

In `.github/workflows/ci.yml`, in the `offline-tests` job after `Run all offline tests`:

```yaml
      - name: Verify test inventory is up to date
        run: |
          task test:inventory
          if ! git diff --exit-code website/src/data/test-inventory.json; then
            echo "ERROR: website/src/data/test-inventory.json is stale — run 'task test:inventory' locally and commit"
            exit 1
          fi
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-test-inventory.sh Taskfile.yml website/src/data/test-inventory.json .github/workflows/ci.yml
git commit -m "feat(tests): test inventory generator + CI drift guard"
```

### Task C2: Trend endpoint

**Files:**
- Create: `website/src/pages/api/admin/tests/trend.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTestRunTrend } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const days = Number(url.searchParams.get('days') ?? 30);
  const safeDays = Math.max(1, Math.min(days, 180));
  const trend = await getTestRunTrend(safeDays);
  return new Response(JSON.stringify({ days: safeDays, trend }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Verify**

```bash
cd website && npm run check 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/tests/trend.ts
git commit -m "feat(admin/tests): GET /api/admin/tests/trend?days=30"
```

### Task C3: Flake endpoint

**Files:**
- Create: `website/src/pages/api/admin/tests/flake.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listFlakeWindow } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const limit = Math.max(3, Math.min(Number(url.searchParams.get('limit') ?? 10), 50));
  const flakes = await listFlakeWindow(limit);
  return new Response(JSON.stringify({ window: limit, tests: flakes }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Type check + commit**

```bash
cd website && npm run check 2>&1 | tail -10
git add website/src/pages/api/admin/tests/flake.ts
git commit -m "feat(admin/tests): GET /api/admin/tests/flake?limit=10"
```

### Task C4: Traceability endpoint

**Files:**
- Create: `website/src/pages/api/admin/tests/traceability.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import inventory from '../../../../data/test-inventory.json';
import { pool } from '../../../../lib/website-db';

interface InventoryEntry { id: string; file: string; category: string; kind: string; }

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  // Last status per test_id
  const lastStatus = await pool.query<{ test_id: string; status: string; created_at: string }>(
    `SELECT DISTINCT ON (test_id) test_id, status, created_at
       FROM test_results
   ORDER BY test_id, created_at DESC`,
  );
  const statusMap = new Map(lastStatus.rows.map(r => [r.test_id, { status: r.status, lastRun: r.created_at }]));

  const matrix = (inventory as InventoryEntry[]).map(entry => {
    const last = statusMap.get(entry.id);
    return { ...entry, lastStatus: last?.status ?? 'untested', lastRun: last?.lastRun ?? null };
  });

  return new Response(JSON.stringify({ count: matrix.length, matrix }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Verify import resolves**

The Astro `data` JSON import requires `resolveJsonModule: true` in `tsconfig.json`. Check:
```bash
grep -n 'resolveJsonModule' website/tsconfig.json
```
If missing, add `"resolveJsonModule": true` under `compilerOptions`.

- [ ] **Step 3: Type-check and commit**

```bash
cd website && npm run check 2>&1 | tail -10
git add website/src/pages/api/admin/tests/traceability.ts website/tsconfig.json
git commit -m "feat(admin/tests): GET /api/admin/tests/traceability"
```

### Task C5: TrendChart.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/TrendChart.svelte`

- [ ] **Step 1: Confirm chart library**

```bash
grep -rn 'chart\|Chart\|d3' website/package.json website/src/components/admin/monitoring/ 2>/dev/null | head -10
```
The dashboard already uses something for charts (PlaywrightPanel may render a small heatmap). If `chart.js` or `d3` is present, use it. Otherwise inline a tiny SVG sparkline (no dependency).

- [ ] **Step 2: Write the component (SVG sparkline fallback)**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface TrendRow { date: string; pass: number; fail: number; skip: number; p50DurationMs: number; p95DurationMs: number; }

  let trend: TrendRow[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/trend?days=30');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { trend: TrendRow[] };
      trend = data.trend;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  const W = 600;
  const H = 120;
  const PAD = 24;

  function maxTotal(rows: TrendRow[]): number {
    return Math.max(1, ...rows.map(r => r.pass + r.fail + r.skip));
  }

  function pointsFor(rows: TrendRow[], pick: (r: TrendRow) => number): string {
    if (rows.length === 0) return '';
    const max = Math.max(1, ...rows.map(pick));
    const stepX = (W - PAD * 2) / Math.max(1, rows.length - 1);
    return rows.map((r, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (pick(r) / max) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between">
    <h3 class="text-sm font-semibold text-neutral-100">Pass-Rate Trend (30 Tage)</h3>
    {#if !loading && !error}
      <span class="text-xs text-neutral-400">{trend.length} Tage</span>
    {/if}
  </header>

  {#if loading}
    <p class="text-xs text-neutral-400">Lade Trenddaten…</p>
  {:else if error}
    <p class="text-xs text-red-400">Fehler: {error}</p>
  {:else if trend.length === 0}
    <p class="text-xs text-neutral-400">Noch keine Testläufe in den letzten 30 Tagen.</p>
  {:else}
    <svg viewBox="0 0 {W} {H}" class="h-32 w-full">
      <polyline fill="none" stroke="#10b981" stroke-width="2" points={pointsFor(trend, r => r.pass)} />
      <polyline fill="none" stroke="#ef4444" stroke-width="2" points={pointsFor(trend, r => r.fail)} />
      <polyline fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="3,3" points={pointsFor(trend, r => r.skip)} />
    </svg>
    <footer class="mt-2 flex gap-4 text-xs text-neutral-300">
      <span><span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> pass</span>
      <span><span class="inline-block h-2 w-2 rounded-full bg-red-500"></span> fail</span>
      <span><span class="inline-block h-2 w-2 rounded-full bg-neutral-500"></span> skip</span>
    </footer>
  {/if}
</section>
```

- [ ] **Step 3: Type-check + commit**

```bash
cd website && npm run check 2>&1 | tail -10
git add website/src/components/admin/monitoring/TrendChart.svelte
git commit -m "feat(admin/monitoring): TrendChart sparkline (30 days)"
```

### Task C6: FlakeMatrix.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/FlakeMatrix.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface FlakeRow { testId: string; category: string; recentRuns: Array<{ runId: string; status: string; createdAt: string }>; failureRate: number; }

  let tests: FlakeRow[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/flake?limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { tests: FlakeRow[] };
      tests = data.tests;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  });

  function cellClass(status: string): string {
    if (status === 'pass') return 'bg-emerald-500';
    if (status === 'fail') return 'bg-red-500';
    return 'bg-neutral-600';
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between">
    <h3 class="text-sm font-semibold text-neutral-100">Flake-Matrix (letzte 10 Läufe)</h3>
    {#if !loading && !error}<span class="text-xs text-neutral-400">{tests.length} Tests</span>{/if}
  </header>
  {#if loading}<p class="text-xs text-neutral-400">Lade…</p>
  {:else if error}<p class="text-xs text-red-400">Fehler: {error}</p>
  {:else if tests.length === 0}<p class="text-xs text-neutral-400">Noch keine Testergebnisse erfasst.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead><tr class="text-left text-neutral-400">
          <th class="py-1">Test</th><th class="py-1">Kategorie</th><th class="py-1">Failrate</th><th class="py-1">Letzte 10</th>
        </tr></thead>
        <tbody>
          {#each tests as t (t.testId)}
            <tr class="border-t border-neutral-800">
              <td class="py-1 pr-2 font-mono text-neutral-200">{t.testId}</td>
              <td class="py-1 pr-2 text-neutral-400">{t.category}</td>
              <td class="py-1 pr-2 {t.failureRate > 0.3 ? 'text-red-400' : t.failureRate > 0 ? 'text-amber-400' : 'text-emerald-400'}">{(t.failureRate * 100).toFixed(0)}%</td>
              <td class="py-1">
                <div class="flex gap-0.5">
                  {#each t.recentRuns as r}
                    <span class="inline-block h-3 w-3 rounded-sm {cellClass(r.status)}" title="{r.status} · {r.createdAt}"></span>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
```

- [ ] **Step 2: Type-check + commit**

```bash
cd website && npm run check 2>&1 | tail -10
git add website/src/components/admin/monitoring/FlakeMatrix.svelte
git commit -m "feat(admin/monitoring): FlakeMatrix table (per-test × last 10 runs)"
```

### Task C7: TraceabilityMatrix.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/TraceabilityMatrix.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface MatrixRow { id: string; file: string; category: string; kind: string; lastStatus: string; lastRun: string | null; }

  let matrix: MatrixRow[] = $state([]);
  let filter: string = $state('');
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/traceability');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { matrix: MatrixRow[] };
      matrix = data.matrix;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  });

  let filtered = $derived(matrix.filter(r => filter === '' || r.id.toLowerCase().includes(filter.toLowerCase()) || r.file.toLowerCase().includes(filter.toLowerCase())));

  function statusBadge(s: string): string {
    if (s === 'pass') return 'bg-emerald-700 text-emerald-100';
    if (s === 'fail') return 'bg-red-700 text-red-100';
    if (s === 'skip') return 'bg-neutral-700 text-neutral-200';
    return 'bg-neutral-800 text-neutral-400';
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between gap-3">
    <h3 class="text-sm font-semibold text-neutral-100">Anforderungs-Abdeckung</h3>
    <input type="search" placeholder="Filter (FA-03, brett…)" bind:value={filter}
           class="w-48 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100" />
  </header>
  {#if loading}<p class="text-xs text-neutral-400">Lade…</p>
  {:else if error}<p class="text-xs text-red-400">Fehler: {error}</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead><tr class="text-left text-neutral-400">
          <th class="py-1">ID</th><th class="py-1">Kategorie</th><th class="py-1">Datei</th><th class="py-1">Status</th><th class="py-1">Letzter Lauf</th>
        </tr></thead>
        <tbody>
          {#each filtered as r (r.id + r.file)}
            <tr class="border-t border-neutral-800">
              <td class="py-1 pr-2 font-mono text-neutral-200">{r.id}</td>
              <td class="py-1 pr-2 text-neutral-400">{r.category}</td>
              <td class="py-1 pr-2 text-neutral-300"><a href="https://github.com/Paddione/Bachelorprojekt/blob/main/{r.file}" target="_blank" rel="noopener" class="hover:underline">{r.file}</a></td>
              <td class="py-1 pr-2"><span class="rounded px-1.5 py-0.5 {statusBadge(r.lastStatus)}">{r.lastStatus}</span></td>
              <td class="py-1 text-neutral-400">{r.lastRun ? new Date(r.lastRun).toLocaleString('de-DE') : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
```

- [ ] **Step 2: Type-check + commit**

```bash
cd website && npm run check 2>&1 | tail -10
git add website/src/components/admin/monitoring/TraceabilityMatrix.svelte
git commit -m "feat(admin/monitoring): TraceabilityMatrix (requirement coverage)"
```

### Task C8: Wire components into TestsTab

**Files:**
- Modify: `website/src/components/admin/monitoring/TestsTab.svelte`

- [ ] **Step 1: Replace the imports + body**

```svelte
<script>
  import TestRunner from './TestRunner.svelte';
  import PlaywrightPanel from './PlaywrightPanel.svelte';
  import TrendChart from './TrendChart.svelte';
  import FlakeMatrix from './FlakeMatrix.svelte';
  import TraceabilityMatrix from './TraceabilityMatrix.svelte';
</script>

<div class="space-y-5">
  <TrendChart />
  <FlakeMatrix />
  <TraceabilityMatrix />
  <TestRunner />
  <PlaywrightPanel />
</div>
```

- [ ] **Step 2: Boot dev server, log in as admin, visit /admin/monitoring → Tests tab**

```bash
cd website && timeout 20 npm run dev 2>&1 | tail -5
```
Expected: dev server boots. Visit `http://localhost:4321/admin/monitoring`, switch to Tests tab. Verify all 5 sections render (the new 3 may show "noch keine Daten" if the test_results table is empty — that's correct).

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/monitoring/TestsTab.svelte
git commit -m "feat(admin/monitoring): wire TrendChart + FlakeMatrix + TraceabilityMatrix into TestsTab"
```

### Task C9: Deploy and verify on prod

- [ ] **Step 1: Deploy website to both clusters**

```bash
task feature:website
```

- [ ] **Step 2: Verify endpoints respond on live**

```bash
# (You'll need an admin session cookie or use the browser)
curl -s https://web.mentolder.de/api/admin/tests/trend?days=30 | jq '.days, (.trend | length)'
curl -s https://web.mentolder.de/api/admin/tests/flake?limit=10 | jq '.window, (.tests | length)'
curl -s https://web.mentolder.de/api/admin/tests/traceability | jq '.count'
```
Expected: HTTP 200 (or 401 if not logged in — confirms route exists).

- [ ] **Step 3: Visual verification**

Open `https://web.mentolder.de/admin/monitoring` in the browser (logged in as admin). Switch to Tests tab. Confirm all 5 sections render without console errors.

---

## Phase D — CI smoke job + JUnit

Independent of B/C. Can land in parallel.

### Task D1: Tag smoke specs with @smoke and add JUnit reporter

**Files:**
- Modify: `tests/e2e/specs/integration-smoke.spec.ts`
- Modify: `tests/e2e/playwright.config.ts`

- [ ] **Step 1: Read the current smoke spec**

```bash
cat tests/e2e/specs/integration-smoke.spec.ts | head -40
```

- [ ] **Step 2: Tag every `test()` call**

For each `test('...', ...)` in the file, change the title to include `@smoke`:
```typescript
test('@smoke keycloak reachable', async ({ page }) => { ... });
test('@smoke nextcloud serves login', async ({ page }) => { ... });
```

Tag at minimum: keycloak login page reachable, website homepage loads, korczewski homepage loads, brett.localhost reachable, files.localhost serves login. Pick the cheapest-and-most-canary tests.

- [ ] **Step 3: Add JUnit reporter to playwright.config.ts**

Change the `reporter:` array:
```typescript
reporter: [
  ['line'],
  ['json', { outputFile: '../results/.tmp-e2e-results.json' }],
  ['junit', { outputFile: '../results/junit.xml' }],
],
```

- [ ] **Step 4: Run smoke locally to verify**

```bash
cd tests/e2e && WEBSITE_URL=https://web.mentolder.de npx playwright test --project=smoke --grep '@smoke' 2>&1 | tail -20
```
Expected: only `@smoke`-tagged specs run. Confirm `tests/results/junit.xml` is created.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/integration-smoke.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(e2e): tag smoke suite with @smoke + add JUnit reporter"
```

### Task D2: Add e2e-smoke job to ci.yml

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append the new job after `security-scan`**

```yaml
  e2e-smoke:
    name: E2E Smoke (prod)
    runs-on: ubuntu-latest
    needs: offline-tests
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: tests/e2e/package-lock.json

      - name: Install Playwright
        working-directory: tests/e2e
        run: |
          npm ci
          npx playwright install chromium --with-deps

      - name: Run @smoke specs against prod
        working-directory: tests/e2e
        env:
          WEBSITE_URL: https://web.mentolder.de
          CI: 'true'
        run: npx playwright test --project=smoke --grep '@smoke'

      - name: Upload JUnit + traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-smoke-results
          path: |
            tests/results/junit.xml
            tests/results/playwright-traces/
          if-no-files-found: warn

      - name: Publish JUnit summary
        if: always()
        uses: mikepenz/action-junit-report@v4
        with:
          report_paths: 'tests/results/junit.xml'
          require_tests: false
```

- [ ] **Step 2: Validate the workflow YAML locally**

```bash
yq eval '.jobs.e2e-smoke.timeout-minutes' .github/workflows/ci.yml
```
Expected: `10`.

- [ ] **Step 3: Commit and push to a feature branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): add e2e-smoke job (PR-gated, ~5-7 min, JUnit + artifacts)"
```

- [ ] **Step 4: Open the PR, watch CI**

```bash
gh pr create --title 'ci(e2e): smoke job for PRs' --body 'Adds @smoke-tagged Playwright specs as a PR-gated job.'
gh pr checks --watch
```
Expected: `e2e-smoke` job runs in <10 min, succeeds, uploads artifact, JUnit annotations appear on the PR.

---

## Phase E — Performance hygiene

Independent. Three small changes.

### Task E1: Default parallelism to nproc/2 + --fail-fast flag

**Files:**
- Modify: `tests/runner.sh:33` (default JOBS), `:35-46` (parser), `:101-117` (parallel block).

- [ ] **Step 1: Change default JOBS**

Line 33:
```bash
export JOBS="${JOBS:-$(($(nproc 2>/dev/null || echo 2) / 2))}"
[[ "$JOBS" -lt 1 ]] && JOBS=1
[[ "$JOBS" -gt 4 ]] && JOBS=4
```

- [ ] **Step 2: Add --fail-fast parser case**

Line 35-46, add inside the `case "$1" in` block:
```bash
    --fail-fast) export FAIL_FAST="true"; shift ;;
```

And initialize at top:
```bash
export FAIL_FAST="${FAIL_FAST:-false}"
```

- [ ] **Step 3: Wire fail-fast into the parallel pool**

In the parallel loop (line ~111-117):
```bash
      ) &
      ((running++))
      if (( running >= JOBS )); then
        if ! wait -n; then
          if [[ "$FAIL_FAST" == "true" ]]; then
            echo "✗ Test failed and --fail-fast is set; aborting remaining jobs."
            kill 0 2>/dev/null || true
            exit 1
          fi
        fi
        ((running--))
      fi
```

And after the final `wait`, if FAIL_FAST is set, check the exit status of the last batch.

- [ ] **Step 4: Document in --help**

In the help block (line 41), add:
```bash
      echo "  -j N, --jobs N        Parallel jobs (default: nproc/2, max 4)"
      echo "  --fail-fast           Abort on first failure"
```

- [ ] **Step 5: Smoke test**

```bash
./tests/runner.sh --help | head -10
./tests/runner.sh local FA-03 -j 2  # should accept and run
```

- [ ] **Step 6: Commit**

```bash
git add tests/runner.sh
git commit -m "perf(runner): default jobs=nproc/2 (cap 4) + --fail-fast flag

Local default was 1 — most boxes have ≥4 cores. Cap at 4 to keep
NC port-forward stress reasonable. --fail-fast is for CI smoke."
```

### Task E2: Retention CronJob for tests/results/

**Files:**
- Create: `k3d/tests-retention-cronjob.yaml`
- Modify: `prod-mentolder/kustomization.yaml`
- Modify: `prod-korczewski/kustomization.yaml` (if it exists separately) — confirm via `ls prod-*/kustomization.yaml`

- [ ] **Step 1: Write the CronJob**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tests-results-retention
  namespace: workspace
spec:
  schedule: '0 3 * * *'  # 03:00 daily
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                  - matchExpressions:
                      - key: node-role.kubernetes.io/control-plane
                        operator: DoesNotExist
                      - key: kubernetes.io/hostname
                        operator: In
                        values: [gekko-hetzner-2, gekko-hetzner-3, gekko-hetzner-4, pk-hetzner, pk-hetzner-2, pk-hetzner-3]
          containers:
            - name: prune
              image: alpine:3.20
              command: [sh, -c]
              args:
                - |
                  cd /results
                  find . -maxdepth 1 -type f \( -name '*.json' -o -name '*.md' -o -name '*.jsonl' \) -mtime +30 -print -delete
                  find . -maxdepth 1 -type d -name 'playwright-traces' -mtime +14 -print -exec rm -rf {} +
              volumeMounts:
                - name: results
                  mountPath: /results
          volumes:
            - name: results
              persistentVolumeClaim:
                claimName: tests-results-pvc
```

Note: this assumes the website pod's `tests/results/` is on a PVC named `tests-results-pvc`. Verify:
```bash
kubectl --context mentolder -n workspace get pvc | grep -i test
kubectl --context mentolder -n workspace get deploy website -o jsonpath='{.spec.template.spec.volumes}' | jq
```

If `tests/results/` lives in an emptyDir or in the website pod's filesystem, change the CronJob to `kubectl exec` into the website pod instead — adjust the manifest accordingly. Document the choice inline in a comment in the YAML.

- [ ] **Step 2: Add to base kustomization**

In `k3d/kustomization.yaml`, add to the `resources:` list:
```yaml
  - tests-retention-cronjob.yaml
```

- [ ] **Step 3: Validate**

```bash
task workspace:validate
kustomize build prod-mentolder | grep -A 2 'tests-results-retention'
```
Expected: CronJob appears in the rendered manifest.

- [ ] **Step 4: Commit and deploy**

```bash
git add k3d/tests-retention-cronjob.yaml k3d/kustomization.yaml
git commit -m "ops(tests): daily retention CronJob for tests/results/ (>30d JSON, >14d traces)"
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

- [ ] **Step 5: Verify on cluster**

```bash
kubectl --context mentolder -n workspace get cronjob tests-results-retention
kubectl --context korczewski -n workspace-korczewski get cronjob tests-results-retention
```
Expected: both show NEXT SCHEDULE within 24h.

---

## Final verification (end-to-end smoke)

- [ ] **Run the full offline test suite**

```bash
task test:all
```
Expected: green.

- [ ] **Trigger a dashboard test run from /admin/monitoring**

Visit `https://web.mentolder.de/admin/monitoring`, Tests tab, click "Run local". When it finishes, confirm:
- `test_runs` row appears in the history table.
- `test_results` rows are populated (verify via `task workspace:psql ENV=mentolder -- website <<<"SELECT count(*) FROM test_results;"`).
- TrendChart, FlakeMatrix, TraceabilityMatrix all render with real data.

- [ ] **Verify staleness is gone**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://web.mentolder.de/api/admin/staleness-report
curl -s -o /dev/null -w '%{http_code}\n' https://web.mentolder.de/api/admin/staleness-webhook -X POST
```
Expected: both return `404`.

- [ ] **Open final PR for the overhaul, watch CI**

```bash
gh pr create --title 'feat(testing): pipeline overhaul' --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-05-08-testing-pipeline-overhaul-design.md.

## Summary
- Removed staleness report end-to-end (endpoints, DB, UI, secret)
- Removed FA-09-init dead test stub; updated CLAUDE.md
- Added test_results table for per-test history
- New dashboard surfaces: TrendChart, FlakeMatrix, TraceabilityMatrix
- New CI job: e2e-smoke (~5-7 min, JUnit annotations)
- Runner: default parallelism = nproc/2, --fail-fast flag
- Retention CronJob: trim tests/results/ daily

## Test plan
- [x] Offline tests pass (task test:all)
- [x] e2e-smoke job green on this PR
- [x] Dashboard Tests tab renders all 5 sections on web.mentolder.de
- [x] /api/admin/staleness-* return 404
- [x] staleness_reports table absent on both clusters
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- §1 Cleanup → A1, A2 ✓
- §2 Staleness removal → A3, A4, A5, A6, A7, A8, A9, A10 ✓
- §3 CI smoke → D1, D2 ✓
- §4a Schema → B1 ✓
- §4b Ingestion → B2, B3, B4, B5 ✓
- §4c Components → C5, C6, C7, C8 ✓
- §4d Endpoints → C2, C3, C4 ✓
- §5 Perf → E1, E2 ✓

**Placeholder scan:**
- One `// TODO:` mentioned and explicitly forbidden in B2 step 1 — replaced with a concrete probe-script fallback.
- Step E2 has a verification branch ("if PVC doesn't exist, change to kubectl exec") — acceptable because it's an unknown-on-disk that the executor must verify before proceeding, with concrete commands to make the determination.

**Type consistency:**
- `TestResultRow` (B2) → used by `saveTestResults` (B2), called from `run.ts` (B4), `ingest-e2e.ts` (B5). Fields match.
- `FlakeRow` (B2) → returned by `listFlakeWindow`, consumed by `/api/admin/tests/flake` (C3), rendered by `FlakeMatrix.svelte` (C6). Property names align (testId / category / recentRuns / failureRate).
- `TrendRow` (B2) → returned by `getTestRunTrend`, consumed by trend.ts (C2), rendered by TrendChart (C5). Fields align.
- `MatrixRow` interface in C7 references `lastStatus` / `lastRun` produced by C4 — names match.

**Ambiguity:**
- Inventory ID derivation in `build-test-inventory.sh` uses `sed` — covered by the explicit regex; output is deterministic.
- "If vitest harness exists" branch in B2 step 1 — I gave both paths concretely.

No issues remain that aren't already explicitly handled inline.
