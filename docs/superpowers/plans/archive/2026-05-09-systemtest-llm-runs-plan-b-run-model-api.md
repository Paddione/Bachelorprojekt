---
title: Run Model + API Backend — Implementation Plan (Plan B of 3)
domains: [db, website]
status: active
pr_number: null
---

# Run Model + API Backend — Implementation Plan (Plan B of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `systemtest.runs` + `systemtest.run_walks` tables, typed DB helpers, and five REST/SSE endpoints that let the wizard create a run with 12 questionnaire assignments and track walk status in real time — ready for the Playwright MCP demo path.

**Architecture:** No headless API walker (user chose Playwright MCP demo path — no ANTHROPIC_API_KEY needed). `ensureRunsSchema()` is added to the existing `systemtest/db.ts` module and called from `questionnaire-db.ts initDb()`, matching the existing pattern. A new `systemtest-runs-db.ts` provides typed CRUD helpers. Five Astro API routes expose the run lifecycle (create, read, list, start-stub, SSE). `systemtest-demo-prompt.ts` generates the CC-ready instruction string for the wizard's "Demo-Anweisung kopieren" button. Plan C (wizard + run UI) calls these endpoints.

**Tech Stack:** PostgreSQL 16 + pg (shared pool); Astro 4 API routes; TypeScript; vitest + pg-mem for unit tests.

**Reference spec:** `docs/superpowers/specs/2026-05-09-systemtest-llm-runs-design.md` (sections 3, 4, 5.5, 8.2, 9).

**Depends on:** Plan A merged to main (`knowledge.collections` table + `knowledge-db.ts` available).

**Out of scope (Plan B):** headless API walker (`systemtest-walker.ts`), Anthropic API calls, wizard UI, run list page, parent-run page. Those are Plan C.

---

## File Structure

**Created:**
- `website/src/lib/systemtest-runs-db.ts` — typed DB helpers: `createRun`, `getRun`, `listRuns`, `updateRunStatus`, `updateWalkStatus`, `listRunWalks`
- `website/src/lib/systemtest-runs-db.test.ts` — vitest unit tests using pg-mem
- `website/src/lib/systemtest-demo-prompt.ts` — `generateDemoPrompt(args)` → CC-ready prompt string
- `website/src/pages/api/admin/systemtests/runs/index.ts` — GET (list) + POST (create run + walks + assignments)
- `website/src/pages/api/admin/systemtests/runs/[id]/index.ts` — GET (read run with walks)
- `website/src/pages/api/admin/systemtests/runs/[id]/start.ts` — POST stub (status → running)
- `website/src/pages/api/admin/systemtests/runs/[id]/events.ts` — GET SSE (2-second poll)
- `scripts/systemtest-run.sh` — CLI wrapper for POST create

**Modified:**
- `website/src/lib/systemtest/db.ts` — add `ensureRunsSchema(pool)` that creates `systemtest` SQL schema + `runs` + `run_walks` tables
- `website/src/lib/questionnaire-db.ts` — call `ensureRunsSchema(pool)` from `initDb()` (one line + import update)
- `Taskfile.yml` — add `systemtest:run` task

---

## Task 0 — Branch from main (after Plan A merges)

- [ ] **Step 1: Confirm Plan A is merged**

```bash
cd /home/patrick/Bachelorprojekt
git checkout main && git pull origin main
git log --oneline -5
```

Expected: top commit is the Plan A PR merge. The `knowledge.collections` table and `website/src/lib/knowledge-db.ts` must be present.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feature/systemtest-run-model
git status
```

Expected: `On branch feature/systemtest-run-model` · nothing to commit.

---

## Task 1 — Schema: systemtest.runs + run_walks

**Files:**
- Modify: `website/src/lib/systemtest/db.ts`
- Modify: `website/src/lib/questionnaire-db.ts`

The new `systemtest` SQL schema is separate from the public-schema `systemtest_*` tables that already exist (failure outbox, magic tokens). Those pre-existing tables stay untouched; we only add the new schema + two tables.

- [ ] **Step 1: Add `ensureRunsSchema()` to systemtest/db.ts**

Open `website/src/lib/systemtest/db.ts`. After the closing brace of `ensureSystemtestSchema(pool)`, append:

```ts
export async function ensureRunsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS systemtest AUTHORIZATION website;

    CREATE TABLE IF NOT EXISTS systemtest.runs (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name             TEXT NOT NULL,
      brand            TEXT NOT NULL CHECK (brand IN ('mentolder','korczewski')),
      side_objectives  JSONB NOT NULL DEFAULT '[]'::jsonb,
      collection_ids   UUID[] NOT NULL DEFAULT '{}',
      status           TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','completed','failed','cancelled')),
      compliance_score NUMERIC(4,3),
      drift_summary    TEXT,
      llm_model        TEXT NOT NULL DEFAULT 'demo',
      embedding_model  TEXT NOT NULL DEFAULT 'voyage-multilingual-2',
      cost_cents       INT,
      started_at       TIMESTAMPTZ,
      finished_at      TIMESTAMPTZ,
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT runs_objectives_nonempty
        CHECK (jsonb_typeof(side_objectives) = 'array' AND jsonb_array_length(side_objectives) >= 1),
      CONSTRAINT runs_collections_nonempty
        CHECK (cardinality(collection_ids) >= 1)
    );

    CREATE TABLE IF NOT EXISTS systemtest.run_walks (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id            UUID NOT NULL REFERENCES systemtest.runs(id) ON DELETE CASCADE,
      template_number   INT  NOT NULL CHECK (template_number BETWEEN 1 AND 12),
      template_id       UUID NOT NULL,
      assignment_id     UUID NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','completed','failed','cancelled')),
      compliance_score  NUMERIC(4,3),
      agent_observation TEXT,
      outcome_json      JSONB,
      started_at        TIMESTAMPTZ,
      finished_at       TIMESTAMPTZ,
      error_message     TEXT,
      UNIQUE (run_id, template_number)
    );

    CREATE INDEX IF NOT EXISTS run_walks_run_id ON systemtest.run_walks(run_id);
  `);
}
```

Note: `template_id` and `assignment_id` store plain UUIDs without FK constraints to keep schema bootstrapping order-independent. `created_by` is likewise stored as plain UUID (admin users may or may not have a matching `customers` row).

- [ ] **Step 2: Call `ensureRunsSchema` from questionnaire-db.ts initDb**

Open `website/src/lib/questionnaire-db.ts`.

Update the import that currently reads:
```ts
import { ensureSystemtestSchema } from './systemtest/db';
```
to:
```ts
import { ensureSystemtestSchema, ensureRunsSchema } from './systemtest/db';
```

Find the line `await ensureSystemtestSchema(pool);` (around line 326) and add immediately after:
```ts
  await ensureRunsSchema(pool);
```

- [ ] **Step 3: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx tsc --noEmit 2>&1 | grep -E 'systemtest/db|questionnaire-db' | head -5 || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/systemtest/db.ts website/src/lib/questionnaire-db.ts
git commit -m "feat(systemtest): add systemtest.runs + run_walks schema"
```

---

## Task 2 — DB helpers: systemtest-runs-db.ts (TDD)

**Files:**
- Create: `website/src/lib/systemtest-runs-db.ts`
- Create: `website/src/lib/systemtest-runs-db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `website/src/lib/systemtest-runs-db.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import * as rdb from './systemtest-runs-db';

let pool: ReturnType<typeof import('pg').Pool>;

beforeAll(async () => {
  const db = newDb();
  db.public.none(`
    CREATE SCHEMA systemtest;
    CREATE TABLE systemtest.runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      brand text NOT NULL,
      side_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
      collection_ids text[] NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'pending',
      compliance_score numeric(4,3),
      drift_summary text,
      llm_model text NOT NULL DEFAULT 'demo',
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      cost_cents int,
      started_at timestamptz,
      finished_at timestamptz,
      created_by uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE systemtest.run_walks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id uuid NOT NULL REFERENCES systemtest.runs(id) ON DELETE CASCADE,
      template_number int NOT NULL,
      template_id uuid NOT NULL,
      assignment_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      compliance_score numeric(4,3),
      agent_observation text,
      outcome_json jsonb,
      started_at timestamptz,
      finished_at timestamptz,
      error_message text,
      UNIQUE (run_id, template_number)
    );
  `);
  const { Pool } = db.adapters.createPg();
  pool = new Pool() as any;
  rdb.__setPoolForTests(pool as any);
});

afterAll(() => (pool as any).end());

beforeEach(async () => {
  await (pool as any).query('TRUNCATE systemtest.run_walks, systemtest.runs CASCADE');
});

const makeWalks = () =>
  Array.from({ length: 12 }, (_, i) => ({
    templateNumber: i + 1,
    templateId:   `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    assignmentId: `00000000-0000-0000-0001-${String(i + 1).padStart(12, '0')}`,
  }));

const collectionIds = ['00000000-0000-0000-0002-000000000001'];

describe('systemtest-runs-db', () => {
  test('createRun returns run with 12 walks', async () => {
    const run = await rdb.createRun({
      name: 'Test-Run', brand: 'mentolder',
      sideObjectives: ['Ziel 1'], collectionIds, walks: makeWalks(),
    });
    expect(run.id).toBeTruthy();
    expect(run.walks).toHaveLength(12);
    expect(run.walks[0].template_number).toBe(1);
    expect(run.walks[11].template_number).toBe(12);
  });

  test('getRun returns null for unknown id', async () => {
    const r = await rdb.getRun('00000000-0000-0000-0000-000000000099');
    expect(r).toBeNull();
  });

  test('updateRunStatus changes status', async () => {
    const run = await rdb.createRun({
      name: 'R', brand: 'mentolder', sideObjectives: ['Z'], collectionIds, walks: makeWalks(),
    });
    await rdb.updateRunStatus(run.id, 'running');
    const updated = await rdb.getRun(run.id);
    expect(updated?.status).toBe('running');
    expect(updated?.started_at).not.toBeNull();
  });

  test('listRuns returns created run, filterable by brand', async () => {
    await rdb.createRun({ name: 'R-ment', brand: 'mentolder', sideObjectives: ['Z'], collectionIds, walks: makeWalks() });
    await rdb.createRun({ name: 'R-korz', brand: 'korczewski', sideObjectives: ['Z'], collectionIds, walks: makeWalks() });
    const all = await rdb.listRuns();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ment = await rdb.listRuns('mentolder');
    expect(ment.every(r => r.brand === 'mentolder')).toBe(true);
  });

  test('updateWalkStatus sets agent_observation', async () => {
    const run = await rdb.createRun({
      name: 'R2', brand: 'mentolder', sideObjectives: ['Z'], collectionIds, walks: makeWalks(),
    });
    const walk = run.walks[0];
    await rdb.updateWalkStatus(walk.id, 'completed', { agent_observation: 'Alles gut.' });
    const updated = await rdb.getRun(run.id);
    expect(updated?.walks[0].status).toBe('completed');
    expect(updated?.walks[0].agent_observation).toBe('Alles gut.');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx vitest run src/lib/systemtest-runs-db.test.ts 2>&1 | tail -5
```

Expected: all 5 tests fail with `Cannot find module './systemtest-runs-db'`.

- [ ] **Step 3: Implement the module**

Create `website/src/lib/systemtest-runs-db.ts`:

```ts
import { Pool } from 'pg';

let pool: Pool | null = null;
function p(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.PGHOST     ?? 'shared-db',
      port:     Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'website',
      user:     process.env.PGUSER     ?? 'website',
      password: process.env.PGPASSWORD,
    });
  }
  return pool;
}

export function __setPoolForTests(testPool: Pool): void { pool = testPool; }

export type RunStatus  = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WalkStatus = RunStatus;

export interface RunWalk {
  id: string;
  run_id: string;
  template_number: number;
  template_id: string;
  assignment_id: string;
  status: WalkStatus;
  compliance_score: number | null;
  agent_observation: string | null;
  outcome_json: unknown | null;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
}

export interface Run {
  id: string;
  name: string;
  brand: string;
  side_objectives: string[];
  collection_ids: string[];
  status: RunStatus;
  compliance_score: number | null;
  drift_summary: string | null;
  llm_model: string;
  embedding_model: string;
  cost_cents: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_by: string | null;
  created_at: Date;
  walks: RunWalk[];
}

export interface CreateRunArgs {
  name: string;
  brand: string;
  sideObjectives: string[];
  collectionIds: string[];
  createdBy?: string | null;
  walks: Array<{ templateNumber: number; templateId: string; assignmentId: string }>;
}

export async function createRun(args: CreateRunArgs): Promise<Run> {
  const client = await p().connect();
  try {
    await client.query('BEGIN');

    const runRes = await client.query(
      `INSERT INTO systemtest.runs
         (name, brand, side_objectives, collection_ids, llm_model, created_by)
       VALUES ($1, $2, $3::jsonb, $4::uuid[], 'demo', $5)
       RETURNING *`,
      [args.name, args.brand, JSON.stringify(args.sideObjectives),
       args.collectionIds, args.createdBy ?? null],
    );
    const run = runRes.rows[0];

    const walks: RunWalk[] = [];
    for (const w of args.walks) {
      const wRes = await client.query(
        `INSERT INTO systemtest.run_walks
           (run_id, template_number, template_id, assignment_id)
         VALUES ($1, $2, $3::uuid, $4::uuid)
         RETURNING *`,
        [run.id, w.templateNumber, w.templateId, w.assignmentId],
      );
      walks.push(wRes.rows[0]);
    }

    await client.query('COMMIT');
    return { ...run, walks };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRun(id: string): Promise<Run | null> {
  const runRes = await p().query('SELECT * FROM systemtest.runs WHERE id = $1', [id]);
  if (!runRes.rows[0]) return null;
  const walksRes = await p().query(
    'SELECT * FROM systemtest.run_walks WHERE run_id = $1 ORDER BY template_number',
    [id],
  );
  return { ...runRes.rows[0], walks: walksRes.rows };
}

export async function listRuns(brand?: string): Promise<Omit<Run, 'walks'>[]> {
  const r = brand
    ? await p().query('SELECT * FROM systemtest.runs WHERE brand = $1 ORDER BY created_at DESC', [brand])
    : await p().query('SELECT * FROM systemtest.runs ORDER BY created_at DESC');
  return r.rows;
}

export async function updateRunStatus(
  id: string,
  status: RunStatus,
  opts: {
    compliance_score?: number | null;
    drift_summary?: string | null;
  } = {},
): Promise<void> {
  const sets: string[] = ['status = $2'];
  const params: unknown[] = [id, status];

  if (status === 'running') sets.push('started_at = now()');
  if (status === 'completed' || status === 'failed') sets.push('finished_at = now()');

  if (opts.compliance_score !== undefined) {
    params.push(opts.compliance_score);
    sets.push(`compliance_score = $${params.length}`);
  }
  if (opts.drift_summary !== undefined) {
    params.push(opts.drift_summary);
    sets.push(`drift_summary = $${params.length}`);
  }

  await p().query(`UPDATE systemtest.runs SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function updateWalkStatus(
  walkId: string,
  status: WalkStatus,
  opts: {
    compliance_score?: number | null;
    agent_observation?: string | null;
    error_message?: string | null;
  } = {},
): Promise<void> {
  const sets: string[] = ['status = $2'];
  const params: unknown[] = [walkId, status];

  if (status === 'running') sets.push('started_at = now()');
  if (status === 'completed' || status === 'failed') sets.push('finished_at = now()');

  if (opts.compliance_score !== undefined) {
    params.push(opts.compliance_score);
    sets.push(`compliance_score = $${params.length}`);
  }
  if (opts.agent_observation !== undefined) {
    params.push(opts.agent_observation);
    sets.push(`agent_observation = $${params.length}`);
  }
  if (opts.error_message !== undefined) {
    params.push(opts.error_message);
    sets.push(`error_message = $${params.length}`);
  }

  await p().query(`UPDATE systemtest.run_walks SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function listRunWalks(runId: string): Promise<RunWalk[]> {
  const r = await p().query(
    'SELECT * FROM systemtest.run_walks WHERE run_id = $1 ORDER BY template_number',
    [runId],
  );
  return r.rows;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bunx vitest run src/lib/systemtest-runs-db.test.ts 2>&1 | tail -5
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/systemtest-runs-db.ts website/src/lib/systemtest-runs-db.test.ts
git commit -m "feat(systemtest): systemtest-runs-db helpers + vitest (TDD)"
```

---

## Task 3 — Demo prompt generator

**Files:**
- Create: `website/src/lib/systemtest-demo-prompt.ts`

The "Demo-Anweisung kopieren" button needs a CC-ready prompt. This module produces that string from a run's metadata.

- [ ] **Step 1: Implement**

Create `website/src/lib/systemtest-demo-prompt.ts`:

```ts
export interface DemoPromptWalk {
  templateNumber: number;
  assignmentId: string;
}

export interface DemoPromptArgs {
  runId: string;
  brand: string;
  domain: string;
  sideObjectives: string[];
  collectionNames: string[];
  walks: DemoPromptWalk[];
}

export function generateDemoPrompt(args: DemoPromptArgs): string {
  const { runId, brand: _brand, domain, sideObjectives, collectionNames, walks } = args;

  const objectives = sideObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n');
  const collections = collectionNames.length > 0 ? collectionNames.join(', ') : '—';

  const walkBlocks = walks
    .map(w =>
      `### System-Test ${w.templateNumber}\n` +
      `URL: https://web.${domain}/portal/fragebogen/${w.assignmentId}\n` +
      `After submitting: PUT https://web.${domain}/api/admin/questionnaires/assignments/${w.assignmentId}\n` +
      `  body: { "status": "reviewed", "coach_notes": "<1-2 sentence observation>" }`,
    )
    .join('\n\n');

  return [
    `Drive the system-test walk for run ${runId} using the Playwright MCP tools.`,
    '',
    '== Side objectives ==',
    objectives,
    '',
    '== Knowledge collections ==',
    collections,
    '',
    '== Instructions ==',
    'For each of the 12 system-test templates below:',
    '1. Open the portal URL in the browser (use your admin session).',
    '2. For each step: click erfüllt | teilweise | nicht_erfüllt, fill the Details field with a',
    '   1-2 sentence justification, click "Speichern & Weiter".',
    '3. At the last step: click "Testprotokoll absenden".',
    '4. PUT coach_notes + status=reviewed via the admin API (body shown below each walk).',
    '',
    'Use mcp__plugin_playwright_playwright__browser_* tools throughout.',
    '',
    '== Walks ==',
    '',
    walkBlocks,
    '',
    `Run page: https://web.${domain}/admin/systemtests/${runId}`,
  ].join('\n');
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx tsc --noEmit 2>&1 | grep 'demo-prompt' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/systemtest-demo-prompt.ts
git commit -m "feat(systemtest): demo prompt generator for Playwright MCP path"
```

---

## Task 4 — API endpoints (create, read, start-stub, SSE)

**Files:**
- Create: `website/src/pages/api/admin/systemtests/runs/index.ts`
- Create: `website/src/pages/api/admin/systemtests/runs/[id]/index.ts`
- Create: `website/src/pages/api/admin/systemtests/runs/[id]/start.ts`
- Create: `website/src/pages/api/admin/systemtests/runs/[id]/events.ts`

- [ ] **Step 1: Implement POST + GET list**

Create `website/src/pages/api/admin/systemtests/runs/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createRun, listRuns } from '../../../../../lib/systemtest-runs-db';
import { listQTemplates, createQAssignment } from '../../../../../lib/questionnaire-db';
import { getCustomerByEmail } from '../../../../../lib/website-db';

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonErr('Unauthorized', 401);

  const brand = url.searchParams.get('brand') ?? undefined;
  const runs = await listRuns(brand);
  return new Response(JSON.stringify(runs), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return jsonErr('Unauthorized', 401);

  const body = await request.json() as {
    name?: string; brand?: string;
    side_objectives?: string[];
    collection_ids?: string[];
  };

  if (!body.name?.trim()) return jsonErr('name erforderlich', 400);
  if (!['mentolder', 'korczewski'].includes(body.brand ?? '')) return jsonErr('brand muss mentolder|korczewski sein', 400);
  if (!body.side_objectives?.length) return jsonErr('mindestens ein Nebenziel erforderlich', 400);
  if (!body.collection_ids?.length) return jsonErr('mindestens eine Wissensquelle erforderlich', 400);

  const customer = await getCustomerByEmail(session.email).catch(() => null);

  const allTemplates = await listQTemplates();
  const systemTestTemplates = allTemplates
    .filter(t => t.is_system_test && t.status === 'published')
    .sort((a, b) => a.title.localeCompare(b.title));

  if (systemTestTemplates.length !== 12) {
    return jsonErr(`Benötige 12 System-Test-Vorlagen, gefunden: ${systemTestTemplates.length}`, 409);
  }

  const walks: Array<{ templateNumber: number; templateId: string; assignmentId: string }> = [];
  for (let i = 0; i < systemTestTemplates.length; i++) {
    const tpl = systemTestTemplates[i];
    const assignment = await createQAssignment({
      customerId: customer?.id ?? '00000000-0000-0000-0000-000000000000',
      templateId: tpl.id,
    });
    walks.push({ templateNumber: i + 1, templateId: tpl.id, assignmentId: assignment.id });
  }

  const run = await createRun({
    name: body.name!.trim(),
    brand: body.brand!,
    sideObjectives: body.side_objectives!,
    collectionIds: body.collection_ids!,
    createdBy: customer?.id ?? null,
    walks,
  });

  return new Response(JSON.stringify(run), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Implement GET run detail**

Create `website/src/pages/api/admin/systemtests/runs/[id]/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getRun } from '../../../../../../lib/systemtest-runs-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const run = await getRun(params.id!);
  if (!run) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  return new Response(JSON.stringify(run), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Implement POST start stub**

Create `website/src/pages/api/admin/systemtests/runs/[id]/start.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getRun, updateRunStatus } from '../../../../../../lib/systemtest-runs-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const run = await getRun(params.id!);
  if (!run) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  if (run.status !== 'pending') {
    return new Response(JSON.stringify({ error: `run is already ${run.status}` }), { status: 409 });
  }

  await updateRunStatus(params.id!, 'running');
  return new Response(
    JSON.stringify({ status: 'running', message: 'Drive walks via Demo-Anweisung + Playwright MCP' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
```

- [ ] **Step 4: Implement SSE stream**

Create `website/src/pages/api/admin/systemtests/runs/[id]/events.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getRun } from '../../../../../../lib/systemtest-runs-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;
  const enc = new TextEncoder();
  const sse = (data: unknown) => enc.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(ctrl) {
      let lastDigest = '';
      const signal = request.signal;
      let alive = true;
      signal.addEventListener('abort', () => { alive = false; });

      while (alive) {
        const run = await getRun(id).catch(() => null);
        if (!run) { ctrl.enqueue(sse({ error: 'not_found' })); ctrl.close(); return; }

        const digest = JSON.stringify({
          status: run.status,
          walks: run.walks.map(w => ({ id: w.id, status: w.status, score: w.compliance_score })),
        });
        if (digest !== lastDigest) {
          ctrl.enqueue(sse({ run, ts: Date.now() }));
          lastDigest = digest;
        }

        if (['completed', 'failed', 'cancelled'].includes(run.status)) {
          ctrl.enqueue(sse({ done: true }));
          ctrl.close();
          return;
        }

        await new Promise(res => setTimeout(res, 2000));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
```

- [ ] **Step 5: Type-check all**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'systemtests' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/systemtests/
git commit -m "feat(api): systemtest runs CRUD + start-stub + SSE endpoints"
```

---

## Task 5 — scripts/systemtest-run.sh + Taskfile

**Files:**
- Create: `scripts/systemtest-run.sh`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Create the script**

Create `scripts/systemtest-run.sh`:

```bash
#!/usr/bin/env bash
# scripts/systemtest-run.sh — create a new LLM system-test run via the API.
# Prints the demo prompt to stdout if no cookie file found.
#
# Usage:
#   bash scripts/systemtest-run.sh <env> <name> <objectives>
#     env:        mentolder | korczewski
#     name:       run name (quoted)
#     objectives: comma-separated side objectives
set -euo pipefail

ENV="${1:?Usage: $0 <env> <name> <objectives>}"
NAME="${2:?}"
OBJECTIVES_CSV="${3:?}"

source scripts/env-resolve.sh "$ENV"
DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN not set}"
BRAND="${BRAND_NAME:-mentolder}"

objectives_json=$(python3 -c "
import json,sys
print(json.dumps([o.strip() for o in sys.argv[1].split(',') if o.strip()]))" "$OBJECTIVES_CSV")

BASE_URL="https://web.${DOMAIN}"
COOKIE_FILE="${TMPDIR:-/tmp}/.systemtest-cookie"

if [ ! -f "$COOKIE_FILE" ]; then
  echo "⚠ No cookie at $COOKIE_FILE — use the admin UI at ${BASE_URL}/admin/systemtests/new"
  exit 0
fi

# Fetch all built-in collection IDs
collection_ids=$(curl -sf -b "$COOKIE_FILE" "${BASE_URL}/api/admin/knowledge/collections" \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps([c['id'] for c in data if c['source'] != 'custom']))")

body=$(python3 -c "
import json,sys
print(json.dumps({'name': sys.argv[1], 'brand': sys.argv[2], 'side_objectives': json.loads(sys.argv[3]), 'collection_ids': json.loads(sys.argv[4])})
)" "$NAME" "$BRAND" "$objectives_json" "$collection_ids")

response=$(curl -sf -b "$COOKIE_FILE" -X POST "${BASE_URL}/api/admin/systemtests/runs" \
  -H 'Content-Type: application/json' -d "$body")

run_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✓ Run created: $run_id"
echo "  View: ${BASE_URL}/admin/systemtests/${run_id}"
```

```bash
chmod +x /home/patrick/Bachelorprojekt/scripts/systemtest-run.sh
```

- [ ] **Step 2: Add Taskfile entry**

In `Taskfile.yml`, find the `knowledge:reindex` block added in Plan A. Immediately after it, add:

```yaml
  systemtest:run:
    desc: "Create a new system-test run via admin API (demo path: Playwright MCP)"
    vars:
      ENV:        '{{.ENV | default "mentolder"}}'
      NAME:       '{{.NAME | default ""}}'
      OBJECTIVES: '{{.OBJECTIVES | default ""}}'
    preconditions:
      - sh: '[ -n "{{.NAME}}" ]'
        msg: "NAME is required"
      - sh: '[ -n "{{.OBJECTIVES}}" ]'
        msg: "OBJECTIVES is required (comma-separated side objectives)"
    cmds:
      - bash scripts/systemtest-run.sh "{{.ENV}}" "{{.NAME}}" "{{.OBJECTIVES}}"
```

- [ ] **Step 3: Validate Taskfile**

```bash
task --list-all | grep 'systemtest:run'
```

Expected: one matching line.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add scripts/systemtest-run.sh Taskfile.yml
git commit -m "feat(systemtest): systemtest-run.sh + task systemtest:run"
```

---

## Task 6 — Deploy schema + open PR

- [ ] **Step 1: Deploy to mentolder**

```bash
task workspace:deploy ENV=mentolder
kubectl --context mentolder -n workspace rollout restart deployment/website
kubectl --context mentolder -n workspace rollout status deployment/website --timeout=120s
```

Expected: website restarts. Check logs for `ensureRunsSchema`:

```bash
task workspace:logs ENV=mentolder -- website 2>&1 | grep -E 'ensureRuns|runs|run_walks' | head -5
```

- [ ] **Step 2: Verify tables on mentolder**

```bash
kubectl --context mentolder -n workspace exec statefulset/shared-db -- \
  psql -U postgres -d website -c "\dt systemtest.*"
```

Expected: `systemtest.runs` and `systemtest.run_walks` listed.

- [ ] **Step 3: Deploy to korczewski**

```bash
task workspace:deploy ENV=korczewski
kubectl --context korczewski -n workspace-korczewski rollout restart deployment/website
kubectl --context korczewski -n workspace-korczewski rollout status deployment/website --timeout=120s
kubectl --context korczewski -n workspace-korczewski exec statefulset/shared-db -- \
  psql -U postgres -d website -c "\dt systemtest.*"
```

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin feature/systemtest-run-model
gh pr create --title "feat(systemtest): run model + API backend (Plan B)" --body "$(cat <<'EOF'
## Summary
- New `systemtest.runs` + `systemtest.run_walks` tables via `ensureRunsSchema()` in questionnaire-db initDb
- `systemtest-runs-db.ts`: createRun, getRun, listRuns, updateRunStatus, updateWalkStatus (vitest 5/5)
- `systemtest-demo-prompt.ts`: generates CC + Playwright MCP instruction string
- API: POST/GET /api/admin/systemtests/runs (create + list)
- API: GET /api/admin/systemtests/runs/[id] (detail with walks)
- API: POST /api/admin/systemtests/runs/[id]/start (stub: pending → running)
- API: GET /api/admin/systemtests/runs/[id]/events (SSE, 2s poll)
- `scripts/systemtest-run.sh` + `task systemtest:run`
- Demo path only — no headless API walker; user drives walks via Playwright MCP
- Plan B of 3 — wizard + run UI in Plan C

## Test plan
- [x] vitest: systemtest-runs-db 5/5 pass
- [x] astro check: no errors on new API routes
- [x] Schema verified on mentolder + korczewski
- [ ] Full E2E wizard walk (Plan C)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

User merges (auto-merge convention).

---

## Done with Plan B

After merge, `systemtest.runs` and `systemtest.run_walks` are live. The API is callable. Plan C builds the wizard, run list, and parent-run page on top.
