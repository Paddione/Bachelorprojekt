---
title: "Projekt-Cockpit — P1 Foundation (Datenmodell, Rollup-View, cockpit-db)"
ticket_id: T000749
domains: [db, website, test]
status: active
pr_number: null
file_locks: [website/src/lib/tickets/cockpit-schema.ts, website/src/lib/tickets/cockpit-types.ts, website/src/lib/tickets/cockpit-db.ts, website/src/lib/tickets-db.ts, scripts/migrations/2026-06-15-cockpit-rollup-view.sql]
shared_changes: false
batch_id: cockpit-2026-06-15
parent_feature: projekt-cockpit
depends_on_plans: []
---

# Projekt-Cockpit — P1 Foundation

> **Batch:** `cockpit-2026-06-15` · Sub-Plan **1 von 4** · Master: `docs/superpowers/plans/2026-06-15-projekt-cockpit.md`
> **Abhängigkeit:** keine — **dieser Plan muss ZUERST mergen.** Er definiert die Contract-Typen (`cockpit-types.ts`) und die Datenschicht (`cockpit-db.ts` + `v_cockpit_rollup`), auf denen P2 (API) und P3 (Frontend) aufbauen.

**Goal:** Replace the flat `/admin/tickets` view with a brand-scoped, admin-gated **Projekt-Cockpit** that rolls up leaf-ticket progress per Feature/Produkt, offers two lenses (Überblick/Werkbank) and two modes (Karten/Tabelle), and supports inline / drawer / drag&drop / bulk editing — without growing the frozen `admin.ts` or `tickets.astro`.

**Architecture:** A new recursive-CTE view `tickets.v_cockpit_rollup` aggregates leaf counts per container; a pure DB module `cockpit-db.ts` queries it and reuses existing mutation helpers; five thin API routes under `api/admin/cockpit/` expose portfolio/feature/reorder/reparent/batch; a Svelte island (`Cockpit.svelte` + sub-components) backed by a pure `cockpitStore.ts` renders the UI; `cockpit.astro` does SSR auth + brand guard; `/admin/tickets` redirects into the cockpit's Tabelle mode. Backend/contract ships first so each stage leaves an independently-green state.

**Tech Stack:** Astro (SSR), Svelte islands, PostgreSQL 16 (recursive CTE views), Vitest (pg-mem with `vi.hoisted`), Playwright (`website` project), go-task quality gates (S1–S4 + freshness).

---

## Conventions used throughout this plan

- **All paths absolute** under the worktree root `/home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit/`. Commands assume `cd /home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit` first; the `website/` subdir is the pnpm workspace.
- **Brand guard (S3):** every endpoint resolves the brand via the established local const `const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';` and passes `BRAND()` into every query. **No `*.mentolder.de` / `*.korczewski.de` literals anywhere.** This matches `website/src/pages/api/admin/tickets/[id].ts`.
- **Auth guard:** `const session = await getSession(request.headers.get('cookie')); if (!session || !isAdmin(session)) return new Response(null, { status: 403 });` — `isAdmin` lives in `website/src/lib/auth.ts`.
- **S1 budgets (verified against `docs/code-quality/baseline.json` + `wc -l`):**
  - `website/src/lib/tickets/admin.ts` — Ist 677, **Baseline 677 → Budget 0. DO NOT TOUCH.** No cockpit logic here.
  - `website/src/pages/admin/tickets.astro` — Ist 359, **nicht-baselined → wirksame Schwelle = 400 (Astro), Budget 41.** Only a redirect change is allowed.
  - `website/src/lib/tickets-db.ts` — Ist **1094**, **baselined at 1106** (`S1:website/src/lib/tickets-db.ts`) → headroom **12 lines**. The ~55-line rollup view must therefore **NOT** be appended inline (1094 + 55 ≈ 1149 > 1106 → **S1 ratchet FAIL**). Instead the view DDL lives in a new module `tickets/cockpit-schema.ts`; `tickets-db.ts` gains only an import + a one-line `await ensureCockpitViews(pool)` call (→ ≤ 1096 ≤ 1106 ✓). Never hand-edit baseline.json.
  - All **new** `.ts` files: limit 600. New `.svelte`: limit 500. New `.astro`: limit 400. Plan keeps every new file with growth reserve under its limit; split into sub-components if any approaches ~80 %.
- **S2:** `cockpit-db.ts` imports only `pool`/`ensureSchemaOnce` from `website-db.ts` and existing helpers from `admin.ts` (type-only where possible) — **no imports from API routes or UI**. `cockpitStore.ts` imports nothing from DB/API/UI — pure store.
- **pg-mem DML tests** must mock the pool with `vi.hoisted(() => …)` before the test body (pattern: `website/src/pages/api/admin/ki/providers.test.ts`).
- **Migration (S4):** `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` mirrors the bootstrap view verbatim and is referenced both by the bootstrap (`tickets-db.ts`) and operationally applied to **both** brand DBs.

---

## Stage A — Datenmodell, Rollup-View & cockpit-db.ts (backend foundation)

Ships the data layer first: the recursive view, its dated migration, the contract types, and the pure query/mutation module with tests. After Stage A, `cockpit-db.ts` is independently green and the API stages can build against a stable contract.

### Task 1: Define `tickets.v_cockpit_rollup` in a new schema module (S1-safe)

**Files:**
- Create: `website/src/lib/tickets/cockpit-schema.ts` (new module: exports `COCKPIT_ROLLUP_VIEW_SQL` + `ensureCockpitViews(pool)`; ~70 lines · limit 600)
- Modify: `website/src/lib/tickets-db.ts` — **import + one call only**; must stay **≤ 1106 lines** (baseline; Ist 1094 → ≤ 1096)
- Test: `website/src/lib/tickets/cockpit-schema.test.ts` (new)

> **Why a separate module (S1):** `tickets-db.ts` is **baselined at 1106**, current **1094** → only **12 lines headroom**. The ~55-line view appended inline would push it past 1106 → **S1 ratchet FAIL**. So the DDL lives in a new module and `tickets-db.ts` only gains the import + a one-line call.

- [x] **Step 1: Write the failing test (asserts the exported SQL constant)**

Create `website/src/lib/tickets/cockpit-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { COCKPIT_ROLLUP_VIEW_SQL } from './cockpit-schema';

describe('COCKPIT_ROLLUP_VIEW_SQL', () => {
  it('creates the rollup view idempotently', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('CREATE OR REPLACE VIEW tickets.v_cockpit_rollup');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('WITH RECURSIVE');
  });

  it('aggregates all five leaf-count columns', () => {
    for (const col of ['total_leaves','done_leaves','blocked_leaves','in_progress_leaves','open_leaves']) {
      expect(COCKPIT_ROLLUP_VIEW_SQL).toContain(col);
    }
  });

  it('computes pct_done and a three-branch health', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('pct_done');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toMatch(/blocked_leaves\s*>\s*0/);
    expect(COCKPIT_ROLLUP_VIEW_SQL).toMatch(/pct_done\s*=\s*100/);
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain("'amber'");
  });

  it('joins agg before WHERE (valid SQL order, no placeholder)', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('LEFT JOIN agg a ON a.container_id = c.id');
    expect(COCKPIT_ROLLUP_VIEW_SQL).not.toContain('PLACEHOLDER');
    expect(COCKPIT_ROLLUP_VIEW_SQL.indexOf('LEFT JOIN agg'))
      .toBeLessThan(COCKPIT_ROLLUP_VIEW_SQL.indexOf("WHERE c.type IN ('project', 'feature')"));
  });
});
```

- [x] **Step 2: Run it and verify it fails**

Run: `cd website && pnpm test -- cockpit-schema.test.ts`
Expected: FAIL — the module/constant does not exist yet.

- [x] **Step 3: Implement `cockpit-schema.ts` (correct SQL, no placeholder)**

Create `website/src/lib/tickets/cockpit-schema.ts` — the view DDL as an exported constant (single source of truth, reused verbatim by the Task 2 migration):

```typescript
// v_cockpit_rollup — leaf-count rollup per container ticket (Produkt/Feature).
// Recursive CTE walks the parent_id tree from every container down to its leaf
// tickets (type 'task'|'bug' with NO children) and aggregates status counts.
// Computed on read (no cache in MVP). Brand filtering is applied by callers,
// not the view, so the view stays a simple per-container aggregate keyed by id.
export const COCKPIT_ROLLUP_VIEW_SQL = `
    CREATE OR REPLACE VIEW tickets.v_cockpit_rollup AS
    WITH RECURSIVE descendants AS (
      -- seed: every ticket is a descendant of itself (depth 0)
      SELECT id AS container_id, id AS node_id, type, status
      FROM tickets.tickets
      UNION ALL
      SELECT d.container_id, c.id AS node_id, c.type, c.status
      FROM descendants d
      JOIN tickets.tickets c ON c.parent_id = d.node_id
    ),
    leaves AS (
      -- a leaf = task|bug with no children of its own
      SELECT d.container_id, d.node_id, d.status
      FROM descendants d
      WHERE d.node_id <> d.container_id
        AND d.type IN ('task', 'bug')
        AND NOT EXISTS (
          SELECT 1 FROM tickets.tickets ch WHERE ch.parent_id = d.node_id
        )
    ),
    agg AS (
      SELECT
        container_id,
        COUNT(*)::int AS total_leaves,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done_leaves,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_leaves,
        COUNT(*) FILTER (WHERE status IN ('in_progress', 'in_review'))::int AS in_progress_leaves,
        COUNT(*) FILTER (WHERE status IN ('triage', 'backlog', 'planning', 'plan_staged'))::int AS open_leaves
      FROM leaves
      GROUP BY container_id
    )
    SELECT
      c.id AS container_id,
      COALESCE(a.total_leaves, 0)        AS total_leaves,
      COALESCE(a.done_leaves, 0)         AS done_leaves,
      COALESCE(a.blocked_leaves, 0)      AS blocked_leaves,
      COALESCE(a.in_progress_leaves, 0)  AS in_progress_leaves,
      COALESCE(a.open_leaves, 0)         AS open_leaves,
      COALESCE(
        ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int, 0
      ) AS pct_done,
      CASE
        WHEN COALESCE(a.blocked_leaves, 0) > 0 THEN 'red'
        WHEN COALESCE(a.total_leaves, 0) > 0
             AND ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int = 100 THEN 'green'
        ELSE 'amber'
      END AS health
    FROM tickets.tickets c
    LEFT JOIN agg a ON a.container_id = c.id
    WHERE c.type IN ('project', 'feature');
`;

export async function ensureCockpitViews(pool: import('pg').Pool): Promise<void> {
  await pool.query(COCKPIT_ROLLUP_VIEW_SQL);
}
```

> The `LEFT JOIN agg a ON a.container_id = c.id` sits **before** the `WHERE` (valid SQL order) so the final `SELECT`'s `a.*` columns resolve. No placeholder, no `.replace()` trap. This DDL string is the single source of truth — Task 2's migration mirrors it verbatim.

- [x] **Step 4: Wire into the schema bootstrap (≤ 2 net lines; keep tickets-db.ts ≤ 1106)**

In `website/src/lib/tickets-db.ts`: add the import next to the other `tickets/*` imports, and call it inside `initTicketsSchema()` right after the `v_active_features` block:

```typescript
import { ensureCockpitViews } from './tickets/cockpit-schema';
// …inside initTicketsSchema(), after the v_active_features CREATE OR REPLACE VIEW:
await ensureCockpitViews(pool);
```

Verify: `wc -l website/src/lib/tickets-db.ts` → **≤ 1106** (baseline; expect ~1096).

- [x] **Step 5: Run the test and verify it passes**

Run: `cd website && pnpm test -- cockpit-schema.test.ts`
Expected: PASS (all four cases green).

- [x] **Step 6: Commit**

```bash
git add website/src/lib/tickets/cockpit-schema.ts website/src/lib/tickets/cockpit-schema.test.ts website/src/lib/tickets-db.ts
git commit -m "feat(cockpit): v_cockpit_rollup in cockpit-schema module (S1-safe)"
```

---

### Task 2: Dated migration `2026-06-15-cockpit-rollup-view.sql`

**Files:**
- Create: `scripts/migrations/2026-06-15-cockpit-rollup-view.sql`

- [x] **Step 1: Write the migration file**

Create `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` with the **verbatim** body of `COCKPIT_ROLLUP_VIEW_SQL` (from `website/src/lib/tickets/cockpit-schema.ts`, Task 1) — single source of truth, mirrored here for explicit prod application:

```sql
-- Cockpit Rollup View: leaf-count aggregation per container ticket.
-- Mirrors tickets-db.ts::initTicketsSchema(). Idempotent (CREATE OR REPLACE).
-- MUST be applied to BOTH brand DBs after merge:
--   workspace            (mentolder)
--   workspace-korczewski (korczewski)
CREATE OR REPLACE VIEW tickets.v_cockpit_rollup AS
WITH RECURSIVE descendants AS (
  SELECT id AS container_id, id AS node_id, type, status
  FROM tickets.tickets
  UNION ALL
  SELECT d.container_id, c.id AS node_id, c.type, c.status
  FROM descendants d
  JOIN tickets.tickets c ON c.parent_id = d.node_id
),
leaves AS (
  SELECT d.container_id, d.node_id, d.status
  FROM descendants d
  WHERE d.node_id <> d.container_id
    AND d.type IN ('task', 'bug')
    AND NOT EXISTS (SELECT 1 FROM tickets.tickets ch WHERE ch.parent_id = d.node_id)
),
agg AS (
  SELECT
    container_id,
    COUNT(*)::int AS total_leaves,
    COUNT(*) FILTER (WHERE status = 'done')::int AS done_leaves,
    COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_leaves,
    COUNT(*) FILTER (WHERE status IN ('in_progress', 'in_review'))::int AS in_progress_leaves,
    COUNT(*) FILTER (WHERE status IN ('triage', 'backlog', 'planning', 'plan_staged'))::int AS open_leaves
  FROM leaves
  GROUP BY container_id
)
SELECT
  c.id AS container_id,
  COALESCE(a.total_leaves, 0)       AS total_leaves,
  COALESCE(a.done_leaves, 0)        AS done_leaves,
  COALESCE(a.blocked_leaves, 0)     AS blocked_leaves,
  COALESCE(a.in_progress_leaves, 0) AS in_progress_leaves,
  COALESCE(a.open_leaves, 0)        AS open_leaves,
  COALESCE(ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int, 0) AS pct_done,
  CASE
    WHEN COALESCE(a.blocked_leaves, 0) > 0 THEN 'red'
    WHEN COALESCE(a.total_leaves, 0) > 0
         AND ROUND(100.0 * a.done_leaves / NULLIF(a.total_leaves, 0))::int = 100 THEN 'green'
    ELSE 'amber'
  END AS health
FROM tickets.tickets c
LEFT JOIN agg a ON a.container_id = c.id
WHERE c.type IN ('project', 'feature');
```

- [x] **Step 2: Verify the file exists and the SQL is well-formed**

Run: `ls -la scripts/migrations/2026-06-15-cockpit-rollup-view.sql && head -5 scripts/migrations/2026-06-15-cockpit-rollup-view.sql`
Expected: file present; comment header reads "Cockpit Rollup View".

- [x] **Step 3: Commit**

```bash
git add scripts/migrations/2026-06-15-cockpit-rollup-view.sql
git commit -m "feat(cockpit): dated migration for v_cockpit_rollup (both brand DBs)"
```

> **Operational runbook (for the PR description, executed post-merge by the deployer):** apply the view to both brand DBs:
> ```bash
> kubectl --context fleet -n workspace exec -i deploy/shared-db -- \
>   psql -U postgres -d website < scripts/migrations/2026-06-15-cockpit-rollup-view.sql
> kubectl --context fleet -n workspace-korczewski exec -i deploy/shared-db -- \
>   psql -U postgres -d website < scripts/migrations/2026-06-15-cockpit-rollup-view.sql
> ```

---

### Task 3: Contract types `cockpit-types.ts`

**Files:**
- Create: `website/src/lib/tickets/cockpit-types.ts` (~120 lines; limit 600)

- [ ] **Step 1: Write the type module (no runtime code)**

Create `website/src/lib/tickets/cockpit-types.ts`:

```typescript
// Single source of truth for the Cockpit API contract (spec §8).
// Pure type declarations — no imports, no runtime code (S2-safe).

export type HealthStatus = 'green' | 'amber' | 'red';

export interface RollupMetrics {
  total: number;
  done: number;
  blocked: number;
  inProgress: number;
  open: number;
  pctDone: number;
}

export interface FeatureNode {
  id: string;
  extId: string;
  title: string;
  valueProp?: string;
  priority: string;
  health: HealthStatus;
  rollup: RollupMetrics;
}

export interface ProductNode {
  id: string;
  extId: string;
  title: string;
  rollup: RollupMetrics;
  features: FeatureNode[];
}

export interface PortfolioPayload {
  products: ProductNode[];
}

export interface TicketRow {
  id: string;
  extId: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  parentId?: string;
  planningRank?: number;
  estimateMinutes?: number;
  timeLoggedMinutes?: number;
}

export interface FeatureTickets {
  feature: FeatureNode;
  tickets: TicketRow[];
}

export interface BatchMutation {
  status?: string;
  priority?: string;
  parentId?: string | null;
  enqueue?: boolean;
}

export interface BatchResult {
  ticketId: string;
  success: boolean;
  error?: string;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep cockpit-types || echo "OK no type errors in cockpit-types"`
Expected: `OK no type errors in cockpit-types`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets/cockpit-types.ts
git commit -m "feat(cockpit): API contract types (PortfolioPayload, FeatureTickets, ...)"
```

---

### Task 4: `cockpit-db.ts` — read functions (`getPortfolio`, `getFeatureTickets`)

**Files:**
- Create: `website/src/lib/tickets/cockpit-db.ts` (read half now; target <350 lines after Task 5; limit 600)
- Test: `website/src/lib/tickets/cockpit-db.test.ts`

- [ ] **Step 1: Write the failing pg-mem test for reads**

Create `website/src/lib/tickets/cockpit-db.test.ts`. Use `vi.hoisted` to back `pool` with a pg-mem instance seeded with 1 Product → 2 Features → 5 leaf tickets (statuses: 1 done, 1 blocked, 2 in_progress, 1 backlog):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

const { mem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb } = require('pg-mem');
  return { mem: newDb() };
});

vi.mock('../website-db', () => {
  const pg = mem.adapters.createPg();
  const pool = new pg.Pool();
  return { pool, ensureSchemaOnce: async (_k: string, fn: () => Promise<void>) => fn() };
});

import { pool } from '../website-db';
import { getPortfolio, getFeatureTickets } from './cockpit-db';

async function seed() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets`);
  await pool.query(`
    CREATE TABLE tickets.tickets (
      id text PRIMARY KEY, external_id text, brand text, type text,
      title text, value_prop text, priority text, status text,
      parent_id text, planning_rank int, created_at timestamptz DEFAULT now()
    )`);
  // (re-create v_cockpit_rollup here using the same SQL as the migration)
  await pool.query(require('node:fs').readFileSync(
    new URL('../../../../scripts/migrations/2026-06-15-cockpit-rollup-view.sql', import.meta.url).pathname,
    'utf8',
  ));
  const rows: [string, string, string, string, string | null, string][] = [
    ['p1', 'project', 'Produkt A', null!, null, 'backlog'],
    ['f1', 'feature', 'Feature One', 'p1', 'Improves onboarding', 'backlog'],
    ['f2', 'feature', 'Feature Two', 'p1', null, 'backlog'],
    ['t1', 'task', 'T1', 'f1', null, 'done'],
    ['t2', 'task', 'T2', 'f1', null, 'blocked'],
    ['t3', 'bug', 'T3', 'f2', null, 'in_progress'],
    ['t4', 'task', 'T4', 'f2', null, 'in_progress'],
    ['t5', 'task', 'T5', 'f2', null, 'backlog'],
  ];
  let rank = 0;
  for (const [id, type, title, parent, vp, status] of rows) {
    await pool.query(
      `INSERT INTO tickets.tickets
         (id, external_id, brand, type, title, value_prop, priority, status, parent_id, planning_rank)
       VALUES ($1,$1,'mentolder',$2,$3,$4,'mittel',$5,$6,$7)`,
      [id, type, title, vp, status, parent, rank++],
    );
  }
}

beforeEach(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS tickets CASCADE`);
  await seed();
});

describe('getPortfolio', () => {
  it('returns products with nested features and rollups', async () => {
    const out = await getPortfolio('mentolder');
    expect(out.products).toHaveLength(1);
    const p = out.products[0];
    expect(p.extId).toBe('p1');
    expect(p.features).toHaveLength(2);
    // Product rollup across all 5 leaves: 1 done / 5 total = 20%, blocked>0 => red
    expect(p.rollup.total).toBe(5);
    expect(p.rollup.done).toBe(1);
    expect(p.rollup.blocked).toBe(1);
    expect(p.rollup.pctDone).toBe(20);
    expect(p.features.find(f => f.extId === 'f1')!.health).toBe('red');
  });

  it('scopes to brand (korczewski sees nothing here)', async () => {
    const out = await getPortfolio('korczewski');
    expect(out.products).toHaveLength(0);
  });
});

describe('getFeatureTickets', () => {
  it('returns only leaf tickets for the feature, ordered by rank', async () => {
    const out = await getFeatureTickets('mentolder', 'f1');
    expect(out.feature.extId).toBe('f1');
    expect(out.tickets.map(t => t.extId)).toEqual(['t1', 't2']);
    expect(out.tickets.every(t => ['task', 'bug'].includes(t.type))).toBe(true);
  });

  it('returns null-ish (throws NotFound) for cross-brand feature', async () => {
    await expect(getFeatureTickets('korczewski', 'f1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd website && pnpm test -- cockpit-db.test.ts`
Expected: FAIL — `cockpit-db.ts` does not export `getPortfolio`/`getFeatureTickets`.

- [ ] **Step 3: Implement the read functions**

Create `website/src/lib/tickets/cockpit-db.ts`:

```typescript
import { pool } from '../website-db';
import type {
  PortfolioPayload, ProductNode, FeatureNode,
  FeatureTickets, TicketRow, RollupMetrics, HealthStatus,
} from './cockpit-types';

function toRollup(r: Record<string, unknown> | undefined): RollupMetrics {
  return {
    total: Number(r?.total_leaves ?? 0),
    done: Number(r?.done_leaves ?? 0),
    blocked: Number(r?.blocked_leaves ?? 0),
    inProgress: Number(r?.in_progress_leaves ?? 0),
    open: Number(r?.open_leaves ?? 0),
    pctDone: Number(r?.pct_done ?? 0),
  };
}

export async function getPortfolio(brand: string): Promise<PortfolioPayload> {
  // Containers (products + features) with their rollup, brand-scoped.
  const { rows } = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            t.parent_id, t.planning_rank,
            r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.open_leaves, r.pct_done, r.health
       FROM tickets.tickets t
       LEFT JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.brand = $1 AND t.type IN ('project', 'feature')
      ORDER BY COALESCE(t.planning_rank, 2147483647), t.created_at`,
    [brand],
  );

  const products: ProductNode[] = [];
  const byId = new Map<string, ProductNode>();
  const looseFeatures: FeatureNode[] = [];

  for (const row of rows) {
    if (row.type === 'project') {
      const node: ProductNode = {
        id: row.id, extId: row.external_id, title: row.title,
        rollup: toRollup(row), features: [],
      };
      products.push(node);
      byId.set(row.id, node);
    }
  }
  for (const row of rows) {
    if (row.type !== 'feature') continue;
    const feature: FeatureNode = {
      id: row.id, extId: row.external_id, title: row.title,
      valueProp: row.value_prop ?? undefined,
      priority: row.priority, health: (row.health ?? 'amber') as HealthStatus,
      rollup: toRollup(row),
    };
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent) parent.features.push(feature);
    else looseFeatures.push(feature);
  }

  if (looseFeatures.length > 0) {
    // Pseudo-group "Ohne Produkt" (spec §5) for parentless features.
    products.push({
      id: '__no_product__', extId: '__no_product__', title: 'Ohne Produkt',
      rollup: aggregate(looseFeatures), features: looseFeatures,
    });
  }
  return { products };
}

function aggregate(features: FeatureNode[]): RollupMetrics {
  const sum = features.reduce((a, f) => ({
    total: a.total + f.rollup.total, done: a.done + f.rollup.done,
    blocked: a.blocked + f.rollup.blocked, inProgress: a.inProgress + f.rollup.inProgress,
    open: a.open + f.rollup.open, pctDone: 0,
  }), { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 });
  sum.pctDone = sum.total ? Math.round((100 * sum.done) / sum.total) : 0;
  return sum;
}

export class NotFoundError extends Error {}

export async function getFeatureTickets(brand: string, extId: string): Promise<FeatureTickets> {
  const fr = await pool.query(
    `SELECT t.id, t.external_id, t.type, t.title, t.value_prop, t.priority,
            r.total_leaves, r.done_leaves, r.blocked_leaves,
            r.in_progress_leaves, r.open_leaves, r.pct_done, r.health
       FROM tickets.tickets t
       LEFT JOIN tickets.v_cockpit_rollup r ON r.container_id = t.id
      WHERE t.brand = $1 AND t.external_id = $2 AND t.type IN ('project', 'feature')`,
    [brand, extId],
  );
  if (fr.rows.length === 0) throw new NotFoundError(`container ${extId} not found`);
  const f = fr.rows[0];
  const feature: FeatureNode = {
    id: f.id, extId: f.external_id, title: f.title,
    valueProp: f.value_prop ?? undefined, priority: f.priority,
    health: (f.health ?? 'amber') as HealthStatus, rollup: toRollup(f),
  };

  const tr = await pool.query(
    `WITH RECURSIVE sub AS (
        SELECT id FROM tickets.tickets WHERE parent_id = $1
        UNION ALL
        SELECT c.id FROM tickets.tickets c JOIN sub ON c.parent_id = sub.id
      )
      SELECT t.id, t.external_id, t.type, t.title, t.status, t.priority,
             t.parent_id, t.planning_rank
        FROM tickets.tickets t
       WHERE t.id IN (SELECT id FROM sub)
         AND t.brand = $2 AND t.type IN ('task', 'bug')
         AND NOT EXISTS (SELECT 1 FROM tickets.tickets ch WHERE ch.parent_id = t.id)
       ORDER BY COALESCE(t.planning_rank, 2147483647), t.external_id`,
    [feature.id, brand],
  );
  const tickets: TicketRow[] = tr.rows.map((t: Record<string, unknown>) => ({
    id: String(t.id), extId: String(t.external_id), title: String(t.title),
    status: String(t.status), priority: String(t.priority), type: String(t.type),
    parentId: t.parent_id ? String(t.parent_id) : undefined,
    planningRank: t.planning_rank != null ? Number(t.planning_rank) : undefined,
  }));
  return { feature, tickets };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd website && pnpm test -- cockpit-db.test.ts`
Expected: PASS (4 read-side cases).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/cockpit-db.ts website/src/lib/tickets/cockpit-db.test.ts
git commit -m "feat(cockpit): cockpit-db read functions (portfolio + feature drill-in)"
```

---

### Task 5: `cockpit-db.ts` — mutation helpers (reorder/reparent/batch)

**Files:**
- Modify: `website/src/lib/tickets/cockpit-db.ts` (append helpers; keep <500 lines total — if it approaches the limit, split mutations into `cockpit-db-mutations.ts`)
- Test: `website/src/lib/tickets/cockpit-db.test.ts` (append)

- [ ] **Step 1: Write the failing mutation tests**

Append to `website/src/lib/tickets/cockpit-db.test.ts`:

```typescript
import { updatePlanningRanks, reparentTicket, batchMutate } from './cockpit-db';

describe('updatePlanningRanks', () => {
  it('updates ranks for same-brand tickets', async () => {
    await updatePlanningRanks('mentolder', [
      { ticketId: 't2', planningRank: 0 },
      { ticketId: 't1', planningRank: 1 },
    ]);
    const out = await getFeatureTickets('mentolder', 'f1');
    expect(out.tickets.map(t => t.extId)).toEqual(['t2', 't1']);
  });

  it('rejects cross-brand ids', async () => {
    await expect(updatePlanningRanks('korczewski', [{ ticketId: 't1', planningRank: 0 }]))
      .rejects.toThrow();
  });
});

describe('reparentTicket', () => {
  it('moves a leaf to a new feature', async () => {
    await reparentTicket('mentolder', 't1', 'f2');
    const out = await getFeatureTickets('mentolder', 'f2');
    expect(out.tickets.map(t => t.extId)).toContain('t1');
  });

  it('allows reparent to null (top-level)', async () => {
    await reparentTicket('mentolder', 'f1', null);
    // f1 becomes a parentless feature; getPortfolio surfaces it under "Ohne Produkt"
    const portfolio = await getPortfolio('mentolder');
    const loose = portfolio.products.find(p => p.extId === '__no_product__');
    expect(loose?.features.some(f => f.extId === 'f1')).toBe(true);
  });
});

describe('batchMutate', () => {
  it('applies status to multiple tickets and reports per-id results', async () => {
    const res = await batchMutate('mentolder', ['t4', 't5'], { status: 'done' });
    expect(res.ok).toBe(true);
    expect(res.results.filter(r => r.success)).toHaveLength(2);
    const out = await getFeatureTickets('mentolder', 'f2');
    expect(out.tickets.filter(t => t.status === 'done').map(t => t.extId).sort())
      .toEqual(['t4', 't5']);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd website && pnpm test -- cockpit-db.test.ts`
Expected: FAIL — `updatePlanningRanks`/`reparentTicket`/`batchMutate` not exported.

- [ ] **Step 3: Implement the mutation helpers**

Append to `website/src/lib/tickets/cockpit-db.ts`:

```typescript
import type { BatchMutation, BatchResult } from './cockpit-types';

export class BrandMismatchError extends Error {}
export class CycleError extends Error {}

async function assertSameBrand(brand: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { rows } = await pool.query(
    `SELECT id FROM tickets.tickets WHERE id = ANY($1) AND brand <> $2`,
    [ids, brand],
  );
  if (rows.length > 0) throw new BrandMismatchError('ticket belongs to another brand');
}

export async function updatePlanningRanks(
  brand: string,
  updates: { ticketId: string; planningRank: number }[],
): Promise<{ ok: true }> {
  await assertSameBrand(brand, updates.map(u => u.ticketId));
  for (const u of updates) {
    await pool.query(
      `UPDATE tickets.tickets SET planning_rank = $1, updated_at = now()
        WHERE id = $2 AND brand = $3`,
      [u.planningRank, u.ticketId, brand],
    );
  }
  await audit(brand, 'reorder', { updates });
  return { ok: true };
}

export async function reparentTicket(
  brand: string,
  ticketId: string,
  newParentId: string | null,
): Promise<{ ok: true }> {
  await assertSameBrand(brand, newParentId ? [ticketId, newParentId] : [ticketId]);
  try {
    await pool.query(
      `UPDATE tickets.tickets SET parent_id = $1, updated_at = now()
        WHERE id = $2 AND brand = $3`,
      [newParentId, ticketId, brand],
    );
  } catch (e) {
    // fn_prevent_cycle trigger raises on cycles
    if (/cycle/i.test(String((e as Error).message))) throw new CycleError('would create a cycle');
    throw e;
  }
  await audit(brand, 'reparent', { ticketId, newParentId });
  return { ok: true };
}

export async function batchMutate(
  brand: string,
  ticketIds: string[],
  mutation: BatchMutation,
): Promise<{ ok: true; results: BatchResult[] }> {
  await assertSameBrand(brand, ticketIds);
  const results: BatchResult[] = [];
  for (const id of ticketIds) {
    try {
      if (mutation.status != null) {
        await pool.query(
          `UPDATE tickets.tickets SET status = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.status, id, brand]);
      }
      if (mutation.priority != null) {
        await pool.query(
          `UPDATE tickets.tickets SET priority = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.priority, id, brand]);
      }
      if (mutation.parentId !== undefined) {
        await pool.query(
          `UPDATE tickets.tickets SET parent_id = $1, updated_at = now() WHERE id = $2 AND brand = $3`,
          [mutation.parentId, id, brand]);
      }
      results.push({ ticketId: id, success: true });
    } catch (e) {
      results.push({ ticketId: id, success: false, error: String((e as Error).message) });
    }
  }
  await audit(brand, 'batch_mutate', { ticketIds, mutation });
  return { ok: true, results };
}

async function audit(brand: string, action: string, changes: unknown): Promise<void> {
  // Best-effort audit; mirror existing ticket_activity usage. Never throws.
  try {
    await pool.query(
      `INSERT INTO tickets.ticket_activity (brand, action, changes, created_at)
       VALUES ($1, $2, $3, now())`,
      [brand, action, JSON.stringify(changes)],
    );
  } catch { /* table shape may differ in unit DB; audit is non-fatal */ }
}
```

> Executor note: confirm the real `tickets.ticket_activity` column names against the existing `admin.ts` audit calls and align `audit()` to them. If `admin.ts` exposes an audit helper that is exportable without growing it, prefer importing that (type-only/function import — do NOT modify `admin.ts`). The unit test tolerates a missing/divergent activity table via the try/catch.

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd website && pnpm test -- cockpit-db.test.ts`
Expected: PASS (all read + mutation cases). Then check size:
Run: `wc -l website/src/lib/tickets/cockpit-db.ts`
Expected: <500 (if ≥500, split mutations into `cockpit-db-mutations.ts` and re-import).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/cockpit-db.ts website/src/lib/tickets/cockpit-db.test.ts
git commit -m "feat(cockpit): cockpit-db mutation helpers (reorder, reparent, batch)"
```

---

### Task 6: Stage A gate check

**Files:** none (verification only)

- [ ] **Step 1: Assert frozen files did not grow**

Run:
```bash
wc -l website/src/lib/tickets/admin.ts          # MUST be 677
wc -l website/src/lib/tickets/cockpit-db.ts     # <500
wc -l website/src/lib/tickets/cockpit-types.ts  # ~120
```
Expected: `admin.ts` exactly 677; cockpit files under budget.

- [ ] **Step 2: Run unit + quality**

Run: `cd website && pnpm test -- "cockpit-db|tickets-db" && cd .. && task quality:check`
Expected: tests pass; no S1 violation for the new files.

- [ ] **Step 3: Commit if quality:check produced regenerated artifacts (else skip)**

```bash
git add -A && git commit -m "chore(cockpit): stage A quality gate" || echo "nothing to commit"
```

---


---

## Verification (scoped sub-plan gate)

This sub-plan merges independently — it must be green on its own.

- [ ] Scoped unit tests: `cd website && pnpm test -- "cockpit-schema|cockpit-db"`
- [ ] `task test:all` → exit 0
- [ ] `task freshness:regenerate` then `task freshness:check` → exit 0 (S1–S4 ratchet incl. `tickets-db.ts` ≤ 1106, `admin.ts` = 677)
- [ ] If test files were added: `task test:inventory` + commit `website/src/data/test-inventory.json`
- [ ] Confirm only this sub-plan's `file_locks` files changed
