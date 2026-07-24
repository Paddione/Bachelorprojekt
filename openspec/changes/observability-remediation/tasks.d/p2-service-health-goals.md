---
title: "observability-remediation — P2 service-health-goals"
ticket_id: T002151
domains: [website, observability, monitoring]
status: planning
---

# observability-remediation — Implementation Plan (P2: service-health-goals)

This is Partial **P2 (service-health-goals)** of 5: **P1 logging-pipeline-fixes → P2 service-health-goals
→ P3 agent-tracing → P4 alertmanager-secret-fix → P5 tests**. P2 owns the persisted service-health
layer: the two Postgres tables, the CronJob that periodically probes every asset's `health_url`, the
`CRON_SECRET`-gated trigger endpoint that reuses `health.ts`'s `checkUrl`, the admin-gated
`GET /api/admin/ops/health-goals` trend endpoint, and the `HealthTab.svelte` history panel. P5 owns the
*comprehensive* Vitest/Playwright suites; P2 ships exactly **one** focused red→green Vitest test for its
load-bearing pure function (`evaluateGoalStatus`) so the partial is self-verifying without waiting for P5.

This partial fulfils the four `ADDED Requirements` in
`openspec/changes/observability-remediation/specs/service-health-goals.md`: *Persisted service health
check history*, *CronJob triggers periodic health checks*, *Goal status evaluation*, and *Admin UI
surfaces goal history*.

## File Structure

Existing files carry their **verified effective S1 budget** (both `nicht-baselined` → budget =
extension-limit − current lines, cross-checked against `docs/code-quality/baseline.json` and
`intel.json`). `.yaml`/`.sql` have **no** entry in `gates.yaml → s1.limits`, so they are not S1
line-ratcheted — marked `n/a`.

Existing files (modified):

| `path` | ist | budget |
|--------|-----|--------|
| `website/src/pages/api/admin/ops/health.ts` | 80 | 520 |
| `website/src/components/admin/platform/HealthTab.svelte` | 84 | 416 |
| `k3d/kustomization.yaml` | 142 | n/a (YAML — nicht S1-limitiert) |

New files created in this partial (`.ts` limit 600; SQL/YAML not S1-limited):

| `path` | est. lines | limit |
|--------|-----------|-------|
| `website/src/db/migrations/20260724_create_service_health.sql` | ~40 | n/a (SQL) |
| `k3d/service-health-check-cronjob.yaml` | ~55 | n/a (YAML) |
| `website/src/lib/ops/service-health-store.ts` | ~135 | 600 |
| `website/src/lib/ops/__tests__/service-health-store.test.ts` | ~55 | 600 |
| `website/src/pages/api/cron/service-health-check.ts` | ~75 | 600 |
| `website/src/pages/api/admin/ops/health-goals.ts` | ~55 | 600 |

### Cross-cutting decisions (frozen here for the executor)

- **Migration filename.** `date +%Y%m%d` at write time confirmed **`20260724`** (latest existing
  migration is `20260719_add_missing_fk_indexes_batch2.sql`; the repo convention is
  `<YYYYMMDD>_<snake_desc>.sql`). If P2 is implemented on a later day, rename to that day's stamp —
  the literal `20260724` must not be reused stale.
- **Schema placement = `public` (mirror the `error_log` Vorbild), FK crosses into `platform`.** The
  two tables live in the default `public` schema exactly like `error_log`, and reference
  `platform.software_assets(id)` cross-schema (standard, supported). This avoids any
  `platform`-schema-ownership edge case and matches the migration Vorbild one-to-one. Store queries
  therefore fully-qualify only the FK-target reads (`platform.software_assets`).
- **Migration runner.** Applied automatically by `website/src/db/migrate.ts` (`task workspace:deploy`
  runs `pnpm --dir website db:migrate`), tracked idempotently in `schema_migrations`; `IF NOT EXISTS`
  DDL is re-run-safe and backfill-tolerant (SQLSTATE `42P07` handling in the runner).
- **Trigger-endpoint status code = `401`, not the Vorbild's `403`.** `error-log-retention.ts` returns
  `403` on bad `CRON_SECRET`, but the P2 spec scenario *"Trigger endpoint rejects unauthenticated
  requests → the response status is `401`"* is the binding requirement. P2 copies the **auth
  mechanism** verbatim from the Vorbild (Bearer `CRON_SECRET`, read from `process.env` at call time,
  fail-closed when unset) but returns `401` to satisfy the spec. The admin endpoint already returns
  `401` (matching `health.ts`), so both endpoints are consistent at `401`.
- **`checkUrl` is reused, never duplicated.** P2's only change to `health.ts` is adding the `export`
  keyword to the existing `checkUrl` (net 0 lines → budget 520 unaffected). The trivial ok/slow/error
  thresholding is re-derived inline in the cron endpoint (3 lines, mirroring `health.ts`) — the
  network primitive is the shared code, per the brief.
- **Fire-and-forget persistence.** `persistHealthCheck` follows `persistError`'s pattern exactly:
  a lazily-created **dedicated** `pg.Pool` (not the shared `db-pool.ts` singleton), a `try/catch`
  that logs to `console.error` and never throws, plus a `__setPoolForTesting` seam.
- **Pure eval core is the testable unit.** `evaluateGoalStatus(dayChecks, goal)` is a pure function
  (no DB, no I/O) → the P2 red→green Vitest test targets it directly, matching the spec's two
  *Goal status evaluation* scenarios exactly. `getGoalTrend`'s DB read and `buildGoalTrend`'s
  grouping get comprehensive coverage in P5.
- **CQ02 (`any`) — net zero.** Every new export is fully typed; the test uses `as unknown as` casts
  (never `as any`), so the global `any` count does not rise.
- **S2 (no import cycles).** `service-health-store.ts` imports only `pg` (leaf). The cron endpoint
  imports the store + `health.ts` + `platform-db`/`platform-links`; the admin endpoint imports the
  store + `auth`. No module imports back into the cron/admin routes → acyclic.
- **S4 (no orphan manifest).** `k3d/service-health-check-cronjob.yaml` is registered in
  `k3d/kustomization.yaml` in the same task it is created (Task 6).

---

## Task 1 — Red test: freeze `evaluateGoalStatus` (FAIL first)

Create the focused red→green anchor for the whole partial. It encodes the spec's two
*Goal status evaluation* scenarios against the **pure** function P2 introduces. The function (and its
module) do not exist yet, so the import cannot resolve → the test fails to even collect. Task 3 makes
it green.

```ts
// website/src/lib/ops/__tests__/service-health-store.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateGoalStatus, type DayCheck, type HealthGoal } from '../service-health-store';

describe('evaluateGoalStatus (P2)', () => {
  const goal: HealthGoal = { maxErrorsPerDay: 2, latencyThresholdMs: null };

  it('is met when the day stays under max_errors_per_day (spec scenario 1)', () => {
    const day: DayCheck[] = [
      { status: 'error', latencyMs: 100 },
      { status: 'ok', latencyMs: 50 },
    ];
    expect(evaluateGoalStatus(day, goal)).toBe('met');
  });

  it('is unmet when the day exceeds max_errors_per_day (spec scenario 2)', () => {
    const day: DayCheck[] = [
      { status: 'error', latencyMs: 100 },
      { status: 'error', latencyMs: 120 },
      { status: 'error', latencyMs: 90 },
    ];
    expect(evaluateGoalStatus(day, goal)).toBe('unmet');
  });

  it('is unmet when the latency threshold is breached even with zero errors', () => {
    const day: DayCheck[] = [{ status: 'slow', latencyMs: 4000 }];
    expect(evaluateGoalStatus(day, { maxErrorsPerDay: 5, latencyThresholdMs: 2000 })).toBe('unmet');
  });
});
```

Run it targeted:

```bash
cd website && pnpm vitest run service-health-store --reporter verbose
```

**expected: FAIL** — the module `src/lib/ops/service-health-store.ts` does not exist yet, so Vitest
reports `Failed to resolve import "../service-health-store"` and the suite cannot run. Tasks 2–3 make
it pass.

---

## Task 2 — Migration: `service_health_checks` + `service_health_goals`

Create `website/src/db/migrations/20260724_create_service_health.sql`. Mirrors the `error_log`
Vorbild (`IF NOT EXISTS`, `OWNER TO website`, explicit `GRANT`s incl. the bigserial sequence). Both
tables FK into `platform.software_assets(id)` with `ON DELETE CASCADE` so removing an asset cleans its
history. The `status` `CHECK` reproduces the spec's four allowed values.

```sql
-- Service Health Goal-States — T002151 (observability-remediation P2)
-- 2026-07-24 — Persisted runtime-health history + per-service Soll/Ist thresholds.
-- Populated by the service-health-check CronJob; read by /api/admin/ops/health-goals.
-- Applied by website/src/db/migrate.ts (task workspace:deploy → pnpm --dir website db:migrate).

CREATE TABLE IF NOT EXISTS service_health_checks (
  id         bigserial PRIMARY KEY,
  ts         timestamptz DEFAULT now(),
  asset_id   uuid NOT NULL REFERENCES platform.software_assets(id) ON DELETE CASCADE,
  status     text CHECK (status IN ('ok', 'slow', 'error', 'optional')),
  latency_ms integer
);

CREATE TABLE IF NOT EXISTS service_health_goals (
  asset_id             uuid PRIMARY KEY REFERENCES platform.software_assets(id) ON DELETE CASCADE,
  max_errors_per_day   integer,
  latency_threshold_ms integer,
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE service_health_checks OWNER TO website;
ALTER TABLE service_health_goals  OWNER TO website;

-- Trend query (last 7 days per asset) reads (asset_id, ts) — index it.
CREATE INDEX IF NOT EXISTS service_health_checks_asset_ts_idx
  ON service_health_checks (asset_id, ts DESC);

GRANT SELECT, INSERT, DELETE ON service_health_checks TO website;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_health_goals TO website;
GRANT USAGE, SELECT ON SEQUENCE service_health_checks_id_seq TO website;
```

> Spec coverage: *Persisted service health check history* — Scenario "A check result is persisted"
> is satisfied by the `ts DEFAULT now()`; Scenario "An invalid status is rejected" by the `CHECK`
> constraint (P5's BATS/Vitest exercises both against a live/mocked DB).

---

## Task 3 — `service-health-store.ts`: pool, persist, pure eval, trend read (makes Task 1 green)

Create `website/src/lib/ops/service-health-store.ts` (new `lib/ops/` dir). It is the single DB
gateway for the new tables plus the pure `evaluateGoalStatus`. `persistHealthCheck` copies the
`persistError` pattern (dedicated lazy pool, best-effort catch, `__setPoolForTesting`).
`getGoalTrend` reads the last-N-day rows and delegates per-day classification to the pure helpers.

```ts
// website/src/lib/ops/service-health-store.ts
import { Pool } from 'pg';

// Dedicated, lazily-created pool — NOT the shared db-pool.ts singleton (same
// rationale as error-log-store.ts: keep this module import-cheap and avoid
// db-pool's heavier module-level setup leaking into unrelated Vitest files).
let _pool: Pool | null = null;
export function getServiceHealthPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

// Test-only: inject a mock pool instead of lazily connecting to a real database.
export function __setPoolForTesting(mockPool: Pool | null): void {
  _pool = mockPool;
}

export type HealthStatus = 'ok' | 'slow' | 'error' | 'optional';
export type GoalStatus = 'met' | 'unmet';

export interface HealthCheckInput {
  assetId: string;
  status: HealthStatus;
  latencyMs: number | null;
}

export interface HealthGoal {
  maxErrorsPerDay: number | null;
  latencyThresholdMs: number | null;
}

export interface DayCheck {
  status: HealthStatus;
  latencyMs: number | null;
}

/** Fire-and-forget insert of one probe result — never throws (mirrors persistError). */
export async function persistHealthCheck(entry: HealthCheckInput): Promise<void> {
  try {
    await getServiceHealthPool().query(
      `INSERT INTO service_health_checks (asset_id, status, latency_ms) VALUES ($1, $2, $3)`,
      [entry.assetId, entry.status, entry.latencyMs],
    );
  } catch (err) {
    console.error('[service-health] persistHealthCheck insert failed:', err);
  }
}

/**
 * Pure Soll/Ist evaluation for a single day's checks against one goal.
 * Goal-Modell B (design.md): met unless the error count exceeds max_errors_per_day
 * OR the day's worst latency breaches latency_threshold_ms. Null thresholds are ignored.
 */
export function evaluateGoalStatus(dayChecks: DayCheck[], goal: HealthGoal): GoalStatus {
  const errors = dayChecks.filter((c) => c.status === 'error').length;
  if (goal.maxErrorsPerDay !== null && errors > goal.maxErrorsPerDay) return 'unmet';
  if (goal.latencyThresholdMs !== null) {
    const worstLatency = dayChecks.reduce((max, c) => Math.max(max, c.latencyMs ?? 0), 0);
    if (worstLatency > goal.latencyThresholdMs) return 'unmet';
  }
  return 'met';
}

export interface GoalTrendDay {
  date: string; // YYYY-MM-DD (UTC)
  status: GoalStatus | 'no-data';
}

export interface GoalTrend {
  assetId: string;
  slug: string;
  name: string;
  days: GoalTrendDay[];
}

interface GoalRow {
  asset_id: string;
  slug: string;
  name: string;
  max_errors_per_day: number | null;
  latency_threshold_ms: number | null;
}

interface CheckRow {
  asset_id: string;
  day: string; // YYYY-MM-DD
  status: HealthStatus;
  latency_ms: number | null;
}

/** Pure: build the last-N-day trend cells from goals + windowed check rows. */
export function buildGoalTrend(goals: GoalRow[], checks: CheckRow[], days: number): GoalTrend[] {
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  return goals.map((g) => {
    const goal: HealthGoal = {
      maxErrorsPerDay: g.max_errors_per_day,
      latencyThresholdMs: g.latency_threshold_ms,
    };
    const cells: GoalTrendDay[] = dayKeys.map((date) => {
      const dayChecks = checks
        .filter((c) => c.asset_id === g.asset_id && c.day === date)
        .map<DayCheck>((c) => ({ status: c.status, latencyMs: c.latency_ms }));
      return { date, status: dayChecks.length === 0 ? 'no-data' : evaluateGoalStatus(dayChecks, goal) };
    });
    return { assetId: g.asset_id, slug: g.slug, name: g.name, days: cells };
  });
}

/** Read the last `days` days of checks + goals and assemble the per-service trend. */
export async function getGoalTrend(days = 7): Promise<GoalTrend[]> {
  const pool = getServiceHealthPool();
  const goalRes = await pool.query<GoalRow>(
    `SELECT g.asset_id, a.slug, a.name, g.max_errors_per_day, g.latency_threshold_ms
       FROM service_health_goals g
       JOIN platform.software_assets a ON a.id = g.asset_id
      ORDER BY a.sort_order ASC, a.name ASC`,
  );
  const checkRes = await pool.query<CheckRow>(
    `SELECT asset_id,
            to_char((ts AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
            status,
            latency_ms
       FROM service_health_checks
      WHERE ts >= now() - make_interval(days => $1)`,
    [days],
  );
  return buildGoalTrend(goalRes.rows, checkRes.rows, days);
}
```

Re-run Task 1's targeted test — it must now go **green**:

```bash
cd website && pnpm vitest run service-health-store --reporter verbose
```

---

## Task 4 — Export `checkUrl` from `health.ts` (reuse, don't duplicate)

The only edit to `website/src/pages/api/admin/ops/health.ts` (80 lines, budget 520): add the `export`
keyword to the existing `checkUrl` so the cron endpoint (Task 5) reuses the same network primitive.
Net **0 lines** — budget 520 unchanged.

```ts
// website/src/pages/api/admin/ops/health.ts — line 18
// before:
//   function checkUrl(url: string, timeoutMs = 5000): Promise<{ latencyMs: number; ok: boolean }> {
// after:
export function checkUrl(url: string, timeoutMs = 5000): Promise<{ latencyMs: number; ok: boolean }> {
```

Nothing else in `health.ts` changes; its `GET`, `ServiceCheck` type, and probe loop stay intact.

---

## Task 5 — Cron trigger endpoint `service-health-check.ts`

Create `website/src/pages/api/cron/service-health-check.ts` (sibling of `error-log-retention.ts`).
Copies the Vorbild's auth mechanism verbatim (Bearer `CRON_SECRET` from `process.env`, fail-closed)
but returns **`401`** per the spec scenario. For each `software_assets` row with a non-empty
`health_url` on the current cluster it reuses `checkUrl`, re-derives status with `health.ts`'s exact
thresholds, and persists via `persistHealthCheck`.

```ts
// website/src/pages/api/cron/service-health-check.ts
import type { APIRoute } from 'astro';
import { checkUrl } from '../admin/ops/health';
import { listSoftwareAssets } from '../../../lib/platform-db';
import { resolveHealthUrl } from '../../../lib/platform-links';
import { persistHealthCheck, type HealthStatus } from '../../../lib/ops/service-health-store';

export const POST: APIRoute = async ({ request, locals }) => {
  // CRON_SECRET is a runtime ConfigMap value — read from process.env at call
  // time (same convention as error-log-retention.ts / cors.ts). Fail-closed.
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const currentCluster = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  let assets;
  try {
    assets = await listSoftwareAssets();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    locals.requestLogger.error({ err: e }, '[service-health-check]');
    return new Response(JSON.stringify({ error: `DB unreachable: ${message}` }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const probeable = assets.filter(
    (a) => a.health_url && a.health_url.trim() !== '' && a.clusters.includes(currentCluster),
  );

  let inserted = 0;
  await Promise.all(
    probeable.map(async (asset) => {
      const url = resolveHealthUrl(asset, currentCluster) ?? '';
      const optional = asset.base_status === 'optional';
      let status: HealthStatus;
      let latencyMs: number | null;
      try {
        const { latencyMs: lat, ok } = await checkUrl(url);
        latencyMs = lat;
        if (!ok) status = optional ? 'optional' : 'error';
        else status = lat > 2000 ? 'slow' : 'ok';
      } catch {
        status = optional ? 'optional' : 'error';
        latencyMs = null;
      }
      await persistHealthCheck({ assetId: asset.id, status, latencyMs });
      inserted += 1;
    }),
  );

  locals.requestLogger.info(`[service-health-check] persisted ${inserted} checks`);
  return new Response(JSON.stringify({ inserted }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

> Spec coverage: *CronJob triggers periodic health checks* — "run persists a check for every asset"
> (one `persistHealthCheck` per probeable asset → `inserted` equals the probeable count) and
> "rejects unauthenticated requests" (`401`, and the early return runs before any insert → no rows).

---

## Task 6 — CronJob manifest + kustomization registration

Create `k3d/service-health-check-cronjob.yaml` (Vorbild: `error-log-retention-cronjob.yaml`) — same
hardened `curlimages/curl` container, `CRON_SECRET` from `workspace-secrets`, POST to the in-cluster
website Service via the envsubst'd `${WEBSITE_NAMESPACE}`. Runs every 15 minutes (health history needs
finer granularity than the nightly retention job). No brand-domain literal → S3-clean.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: service-health-check
  namespace: workspace
  labels:
    app: cronjobs
spec:
  schedule: "*/15 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsNonRoot: true
            runAsUser: 65534
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: curl
              image: curlimages/curl:8.7.1@sha256:25d29daeb9b14b89e2fa8cc17c70e4b188bca1466086907c2d9a4b56b59d8e21
              securityContext:
                allowPrivilegeEscalation: false
                runAsNonRoot: true
                runAsUser: 65534
                capabilities:
                  drop: ["ALL"]
              command:
                - sh
                - -c
                - |
                  curl -sf -X POST \
                    -H "Authorization: Bearer $CRON_SECRET" \
                    http://website.${WEBSITE_NAMESPACE}.svc.cluster.local/api/cron/service-health-check
              resources:
                requests:
                  cpu: 10m
                  memory: 32Mi
                limits:
                  memory: 64Mi
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: CRON_SECRET
```

Register it in `k3d/kustomization.yaml` (S4 orphan gate) immediately after the existing retention
CronJob entry:

```yaml
# k3d/kustomization.yaml — insert after line 50 (`- error-log-retention-cronjob.yaml`)
  - service-health-check-cronjob.yaml
```

Validate the kustomize build resolves the new resource:

```bash
task workspace:validate
```

---

## Task 7 — Admin endpoint `health-goals.ts` (GET, admin-gated)

Create `website/src/pages/api/admin/ops/health-goals.ts`. Same auth/error shape as `health.ts`
(`getSession` + `isAdmin`, `401` otherwise; `503` on DB failure). Delegates the trend assembly to
`getGoalTrend(7)`.

```ts
// website/src/pages/api/admin/ops/health-goals.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getGoalTrend } from '../../../../lib/ops/service-health-store';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const trends = await getGoalTrend(7);
    return new Response(JSON.stringify({ trends, generatedAt: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ error: `DB unreachable: ${message}` }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

> Spec coverage: *Admin UI surfaces goal history* — the `GET` returns 7 day-cells per service;
> "Non-admin is rejected" → `401`.

---

## Task 8 — `HealthTab.svelte`: 7-day goal-trend panel

Extend `website/src/components/admin/platform/HealthTab.svelte` (84 lines, budget 416) with a second
`onMount` fetch against `/api/admin/ops/health-goals` and a per-service 7-cell ampel row rendered
**below** the existing point-in-time grid. The existing probe panel is untouched. Estimated add ~60
lines → ~144/500.

### 8a — script additions (after the existing `fetchHealth` block, before `onMount`)

```ts
  // ── Goal-trend history (P2) ───────────────────────────────────────────
  interface GoalTrendDay {
    date: string;
    status: 'met' | 'unmet' | 'no-data';
  }
  interface GoalTrend {
    assetId: string;
    slug: string;
    name: string;
    days: GoalTrendDay[];
  }
  interface GoalTrendData {
    trends: GoalTrend[];
    generatedAt: string;
  }

  let trendData: GoalTrendData | null = null;
  let trendError: string | null = null;

  async function fetchGoals() {
    try {
      const r = await fetch('/api/admin/ops/health-goals');
      if (!r.ok) throw new Error('Goal trend fetch failed');
      trendData = await r.json();
    } catch (e) {
      trendError = e instanceof Error ? e.message : 'Goal trend fetch failed';
    }
  }
```

Extend the existing `onMount(fetchHealth);` to also load the trend:

```ts
  onMount(() => {
    fetchHealth();
    fetchGoals();
  });
```

### 8b — markup (append inside the outer `<div class="space-y-6">`, after the point-in-time `{/if}` block, before its closing `</div>`)

```svelte
  <div class="admin-card" data-testid="health-goals-panel">
    <div class="flex items-center gap-2 mb-4">
      <h4 class="font-bold uppercase tracking-wider text-xs text-admin-text-mute">7-Tage Goal-Trend</h4>
    </div>

    {#if trendError}
      <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">{trendError}</div>
    {:else if trendData}
      {#if trendData.trends.length === 0}
        <p class="text-xs text-admin-text-disabled">Noch keine Goals konfiguriert.</p>
      {:else}
        <div class="space-y-2">
          {#each trendData.trends as t}
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium">{t.name}</span>
              <div class="flex items-center gap-1">
                {#each t.days as d}
                  <div
                    class="w-3 h-3 rounded-sm {
                      d.status === 'met' ? 'bg-green-500' :
                      d.status === 'unmet' ? 'bg-red-500' :
                      'bg-gray-600/40'}"
                    data-testid="health-goal-cell"
                    data-status={d.status}
                    title="{d.date}: {d.status}"
                  ></div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="h-6 bg-admin-surface rounded animate-pulse"></div>
    {/if}
  </div>
```

Confirm the file stays under budget and introduces no `any`:

```bash
cd website && wc -l src/components/admin/platform/HealthTab.svelte   # expect ~144 (< 500)
! grep -nE ': any|<any>|as any' src/components/admin/platform/HealthTab.svelte
```

---

## Task 9 — Verify (mandatory gate commands)

Run, in order, from the worktree root
(`/home/patrick/Bachelorprojekt/.worktrees/observability-remediation`), and confirm each passes before
handing off to P3:

```bash
# 1. targeted P2 unit test green (from Task 1/3) — proves the pure eval core
cd website && pnpm vitest run service-health-store --reporter verbose
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation

# 2. CQ02 — any-count must not rise (limit 200)
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"

# 3. manifest structure (new CronJob resolves in the kustomize build)
task workspace:validate

# 4. regenerate generated artefacts — test-inventory (new test file), repo-index, …
task test:inventory
task freshness:regenerate

# 5. mandatory CI-equivalent gates
task test:changed          # website vitest --changed + domain BATS + quality
task freshness:check       # freshness + quality:check (S1–S4 ratchet + baseline-key assertion)
```

- `task test:inventory` is required because Task 1 adds a new test file
  (`website/src/lib/ops/__tests__/service-health-store.test.ts`); commit the regenerated
  `website/src/data/test-inventory.json` alongside the code (CI fails on drift).
- `task freshness:check` is the load-bearing S1–S4 gate: the new `.ts` files stay under 600
  (largest is `service-health-store.ts` at ~135), `health.ts`/`HealthTab.svelte` do not grow past
  their 520/416 budgets, no import cycle is introduced (S2), no brand-domain hostname literal appears
  (S3 — the CronJob uses envsubst'd `${WEBSITE_NAMESPACE}`), and the new `k3d/*.yaml` is referenced in
  `kustomization.yaml` (S4).
- The **comprehensive** goal-evaluation, CronJob-insert, and Playwright trend-panel suites land in
  **P5** (tests always last); P2's own targeted `evaluateGoalStatus` test is green here.
