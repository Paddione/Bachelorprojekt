# System Test Failure Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the missing connection between system-test questionnaires and the bug-ticket system. Failed steps auto-create tickets, rrweb recordings provide visual evidence, a DB trigger re-queues steps for retest when the linked ticket is fixed, and a kanban at `/admin/systemtest/board` makes the loop visible.

**Architecture:** Extend-in-place — new DB tables (`questionnaire_test_evidence`, `questionnaire_test_seed_registry`, `questionnaire_test_fixtures`, `systemtest_failure_outbox`) and column additions to `questionnaire_test_status` and `tickets.tickets`. New TS modules under `website/src/lib/systemtest/`. Seed modules per feature plug into a registry. Failure-kanban reads a single SQL view (`v_systemtest_failure_board`).

**Tech Stack:** Astro + Svelte (website), PostgreSQL 16 (shared-db), Keycloak (admin REST API for test users), rrweb (DOM session recording), Kubernetes CronJob (cleanup), TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-08-systemtest-failure-loop-design.md`

**Codebase conventions to follow:**
- DDL lives inline in `website/src/lib/<feature>-db.ts` with `CREATE TABLE IF NOT EXISTS`. No external migration runner.
- API routes are Astro endpoints under `website/src/pages/api/...`. Admin endpoints check session via existing `verifyAdminSession()` helper in `website/src/lib/auth.ts`.
- Tests live in `tests/` (BATS) and `website/src/lib/*.test.ts` (vitest).
- E2E tests use Playwright via `tests/runner.sh local FA-XX`.
- Kubernetes CronJobs are flat YAML in `k3d/cronjob-*.yaml`.

---

## Task 1: Database schema additions

**Files:**
- Create: `website/src/lib/systemtest/db.ts`
- Modify: `website/src/lib/questionnaire-db.ts` (call `ensureSystemtestSchema()` after existing `ensureQuestionnaireSchema()`)
- Test: `website/src/lib/systemtest/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// website/src/lib/systemtest/db.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool } from '../db';
import { ensureSystemtestSchema } from './db';

describe('systemtest schema', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(getPool());
  });

  it('creates questionnaire_test_evidence', async () => {
    const r = await getPool().query(
      `SELECT to_regclass('public.questionnaire_test_evidence') AS t`
    );
    expect(r.rows[0].t).toBe('questionnaire_test_evidence');
  });

  it('creates questionnaire_test_seed_registry', async () => {
    const r = await getPool().query(
      `SELECT to_regclass('public.questionnaire_test_seed_registry') AS t`
    );
    expect(r.rows[0].t).toBe('questionnaire_test_seed_registry');
  });

  it('creates questionnaire_test_fixtures', async () => {
    const r = await getPool().query(
      `SELECT to_regclass('public.questionnaire_test_fixtures') AS t`
    );
    expect(r.rows[0].t).toBe('questionnaire_test_fixtures');
  });

  it('creates systemtest_failure_outbox', async () => {
    const r = await getPool().query(
      `SELECT to_regclass('public.systemtest_failure_outbox') AS t`
    );
    expect(r.rows[0].t).toBe('systemtest_failure_outbox');
  });

  it('adds back-ref columns to questionnaire_test_status', async () => {
    const r = await getPool().query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='questionnaire_test_status'
       AND column_name IN ('evidence_id','last_failure_ticket_id','retest_pending_at','retest_attempt')`
    );
    expect(r.rows.map(x => x.column_name).sort()).toEqual(
      ['evidence_id', 'last_failure_ticket_id', 'retest_attempt', 'retest_pending_at']
    );
  });

  it('adds source columns to tickets.tickets', async () => {
    const r = await getPool().query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='tickets' AND table_name='tickets'
       AND column_name IN ('source_test_assignment_id','source_test_question_id')`
    );
    expect(r.rows.length).toBe(2);
  });

  it('creates v_systemtest_failure_board view', async () => {
    const r = await getPool().query(
      `SELECT to_regclass('public.v_systemtest_failure_board') AS v`
    );
    expect(r.rows[0].v).toBe('v_systemtest_failure_board');
  });

  it('creates retest trigger on tickets.tickets', async () => {
    const r = await getPool().query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'tickets_resolution_retest'`
    );
    expect(r.rows.length).toBe(1);
  });

  it('is idempotent', async () => {
    await ensureSystemtestSchema(getPool());
    await ensureSystemtestSchema(getPool());
    // No throw = pass
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/systemtest/db.test.ts`
Expected: FAIL — `ensureSystemtestSchema` not defined.

- [ ] **Step 3: Implement the schema module**

```ts
// website/src/lib/systemtest/db.ts
import type { Pool } from 'pg';

export async function ensureSystemtestSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_test_evidence (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id   UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id     UUID NOT NULL REFERENCES questionnaire_questions(id),
      attempt         INT NOT NULL DEFAULT 0,
      replay_path     TEXT,
      partial         BOOLEAN NOT NULL DEFAULT false,
      console_log     JSONB,
      network_log     JSONB,
      recorded_from   TIMESTAMPTZ,
      recorded_to     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_evidence_assignment_question
      ON questionnaire_test_evidence(assignment_id, question_id, attempt);

    CREATE TABLE IF NOT EXISTS questionnaire_test_seed_registry (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id  UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      question_id  UUID REFERENCES questionnaire_questions(id) ON DELETE CASCADE,
      seed_module  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_seed_registry_scope
      ON questionnaire_test_seed_registry
         (template_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));

    CREATE TABLE IF NOT EXISTS questionnaire_test_fixtures (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      question_id   UUID NOT NULL REFERENCES questionnaire_questions(id),
      attempt       INT NOT NULL,
      table_name    TEXT NOT NULL,
      row_id        UUID NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      purged_at     TIMESTAMPTZ,
      purge_error   TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_fixtures_unpurged
      ON questionnaire_test_fixtures(assignment_id) WHERE purged_at IS NULL;

    CREATE TABLE IF NOT EXISTS systemtest_failure_outbox (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL,
      question_id   UUID NOT NULL,
      attempt       INT NOT NULL,
      last_error    TEXT,
      retry_count   INT NOT NULL DEFAULT 0,
      retry_after   TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Idempotent column additions on existing tables
  await pool.query(`
    ALTER TABLE questionnaire_test_status
      ADD COLUMN IF NOT EXISTS evidence_id            UUID,
      ADD COLUMN IF NOT EXISTS last_failure_ticket_id UUID,
      ADD COLUMN IF NOT EXISTS retest_pending_at      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS retest_attempt         INT NOT NULL DEFAULT 0;

    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS source_test_assignment_id UUID,
      ADD COLUMN IF NOT EXISTS source_test_question_id   UUID;
  `);

  // FKs added in a separate step so column additions are safe even before
  // referenced tables exist on a fresh DB.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'qts_evidence_id_fk'
      ) THEN
        ALTER TABLE questionnaire_test_status
          ADD CONSTRAINT qts_evidence_id_fk
          FOREIGN KEY (evidence_id) REFERENCES questionnaire_test_evidence(id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'qts_failure_ticket_fk'
      ) THEN
        ALTER TABLE questionnaire_test_status
          ADD CONSTRAINT qts_failure_ticket_fk
          FOREIGN KEY (last_failure_ticket_id) REFERENCES tickets.tickets(id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_source_assignment_fk'
      ) THEN
        ALTER TABLE tickets.tickets
          ADD CONSTRAINT tickets_source_assignment_fk
          FOREIGN KEY (source_test_assignment_id) REFERENCES questionnaire_assignments(id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_source_question_fk'
      ) THEN
        ALTER TABLE tickets.tickets
          ADD CONSTRAINT tickets_source_question_fk
          FOREIGN KEY (source_test_question_id) REFERENCES questionnaire_questions(id);
      END IF;
    END$$;
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW v_systemtest_failure_board AS
    SELECT
      qts.assignment_id,
      qts.question_id,
      qts.last_result,
      qts.last_result_at,
      qts.retest_pending_at,
      qts.retest_attempt,
      qts.evidence_id,
      qts.last_failure_ticket_id,
      t.id              AS ticket_id,
      t.external_id     AS ticket_external_id,
      t.status          AS ticket_status,
      t.resolution      AS ticket_resolution,
      fix_links.pr_number,
      pr.merged_at      AS pr_merged_at,
      CASE
        WHEN qts.last_result = 'erfüllt'
             AND qts.last_result_at >= now() - INTERVAL '7 days'
             THEN 'green'
        WHEN qts.retest_pending_at IS NOT NULL
             THEN 'retest_pending'
        WHEN fix_links.pr_number IS NOT NULL AND pr.merged_at IS NULL
             THEN 'fix_in_pr'
        WHEN t.id IS NOT NULL
             THEN 'open'
        ELSE NULL
      END AS column_key
    FROM questionnaire_test_status qts
    LEFT JOIN tickets.tickets t ON t.id = qts.last_failure_ticket_id
    LEFT JOIN LATERAL (
      SELECT pr_number FROM tickets.ticket_links
      WHERE from_id = t.id AND kind IN ('fixes','fixed_by') AND pr_number IS NOT NULL
      ORDER BY pr_number DESC LIMIT 1
    ) fix_links ON true
    LEFT JOIN tickets.pr_events pr ON pr.pr_number = fix_links.pr_number
    WHERE qts.last_failure_ticket_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION trg_systemtest_retest() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.resolution = 'fixed'
         AND (OLD.resolution IS DISTINCT FROM 'fixed')
         AND NEW.source_test_assignment_id IS NOT NULL THEN
        UPDATE questionnaire_test_status
           SET retest_pending_at = now(),
               retest_attempt    = retest_attempt + 1
         WHERE assignment_id = NEW.source_test_assignment_id
           AND question_id   = NEW.source_test_question_id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tickets_resolution_retest ON tickets.tickets;
    CREATE TRIGGER tickets_resolution_retest
      AFTER UPDATE OF resolution ON tickets.tickets
      FOR EACH ROW EXECUTE FUNCTION trg_systemtest_retest();
  `);
}
```

- [ ] **Step 4: Wire schema bootstrap into existing startup path**

Modify `website/src/lib/questionnaire-db.ts`. Find `ensureQuestionnaireSchema()` (the function that runs the existing `CREATE TABLE IF NOT EXISTS` block — around line 153) and at the very end of its function body add:

```ts
import { ensureSystemtestSchema } from './systemtest/db';

// ... inside ensureQuestionnaireSchema, after existing CREATE TABLE block:
await ensureSystemtestSchema(client);
```

(Use whichever `client`/`pool` variable the existing function uses.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/systemtest/db.test.ts`
Expected: PASS, all 9 assertions green.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/systemtest/db.ts \
        website/src/lib/systemtest/db.test.ts \
        website/src/lib/questionnaire-db.ts
git commit -m "feat(systemtest): add failure-loop schema (evidence, fixtures, seed registry, trigger, board view)"
```

---

## Task 2: `is_test_data` columns and `excludeTestData()` helper

**Files:**
- Create: `website/src/lib/db/filters.ts`
- Modify: `website/src/lib/systemtest/db.ts` (add `is_test_data` column to seedable tables)
- Test: `website/src/lib/db/filters.test.ts`

**Note:** the canonical list of seedable tables for v1 is `auth.users`, `bookings.bookings`, `tickets.tickets`, `questionnaire_assignments`. Add others when a seed module needs them.

- [ ] **Step 1: Write the failing test**

```ts
// website/src/lib/db/filters.test.ts
import { describe, it, expect } from 'vitest';
import { excludeTestData } from './filters';

describe('excludeTestData', () => {
  it('appends WHERE for SELECT without WHERE', () => {
    const sql = excludeTestData('SELECT * FROM auth.users', 'auth.users');
    expect(sql).toBe('SELECT * FROM auth.users WHERE auth.users.is_test_data = false');
  });

  it('appends AND for SELECT with WHERE', () => {
    const sql = excludeTestData(
      'SELECT * FROM auth.users WHERE active = true',
      'auth.users'
    );
    expect(sql).toBe(
      'SELECT * FROM auth.users WHERE active = true AND auth.users.is_test_data = false'
    );
  });

  it('handles aliased table', () => {
    const sql = excludeTestData(
      'SELECT * FROM auth.users u WHERE u.active = true',
      'u'
    );
    expect(sql).toBe(
      'SELECT * FROM auth.users u WHERE u.active = true AND u.is_test_data = false'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/db/filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// website/src/lib/db/filters.ts
/**
 * Append `<table>.is_test_data = false` to a SELECT query.
 * `tableOrAlias` is the table name (or its alias) used in the FROM clause.
 *
 * Defense-in-depth helper — every prod-facing read on a seedable table calls it
 * so seeded test fixtures never leak into customer views.
 */
export function excludeTestData(sql: string, tableOrAlias: string): string {
  const filter = `${tableOrAlias}.is_test_data = false`;
  return /\bWHERE\b/i.test(sql)
    ? `${sql} AND ${filter}`
    : `${sql} WHERE ${filter}`;
}
```

- [ ] **Step 4: Add `is_test_data` columns to the seed-target tables**

Modify `website/src/lib/systemtest/db.ts` — after the column-additions block, add:

```ts
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users') THEN
        ALTER TABLE auth.users
          ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS ix_auth_users_test_data
          ON auth.users(is_test_data) WHERE is_test_data = true;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='bookings' AND table_name='bookings') THEN
        ALTER TABLE bookings.bookings
          ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS ix_bookings_test_data
          ON bookings.bookings(is_test_data) WHERE is_test_data = true;
      END IF;
    END$$;

    ALTER TABLE tickets.tickets
      ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS ix_tickets_test_data
      ON tickets.tickets(is_test_data) WHERE is_test_data = true;

    ALTER TABLE questionnaire_assignments
      ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;
  `);
```

Run `cd website && pnpm vitest run src/lib/systemtest/db.test.ts` to confirm the schema test still passes.

- [ ] **Step 5: Wire `excludeTestData` into the timeline read**

Find the timeline endpoint reading from tables that now carry `is_test_data`. Open `website/src/pages/api/timeline.ts` (or grep for `v_timeline` if the path differs). For any read that touches `tickets.tickets` or `auth.users` directly, wrap with `excludeTestData(sql, 'tickets.tickets')`. The view itself (`bachelorprojekt.v_timeline`) need not be updated — seeded tickets carry `source_test_*` and are filterable by ticket-detail reads.

- [ ] **Step 6: Run tests**

Run: `cd website && pnpm vitest run src/lib/db/filters.test.ts && pnpm vitest run src/lib/systemtest/db.test.ts`
Expected: PASS for all.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/db/filters.ts \
        website/src/lib/db/filters.test.ts \
        website/src/lib/systemtest/db.ts
# plus any timeline route file modified in step 5
git commit -m "feat(systemtest): add is_test_data column + excludeTestData helper"
```

---

## Task 3: rrweb recorder + evidence upload + replay endpoints

**Files:**
- Create: `website/src/lib/systemtest/recorder.ts` (frontend)
- Create: `website/src/pages/api/admin/evidence/upload.ts`
- Create: `website/src/pages/api/admin/evidence/[id]/replay.ts`
- Create: `k3d/pvc-evidence.yaml` (PVC)
- Modify: `k3d/website.yaml` (mount the PVC at `/var/evidence`)
- Modify: `k3d/kustomization.yaml`
- Test: `website/src/pages/api/admin/evidence/upload.test.ts`

- [ ] **Step 1: Add rrweb dependency**

```bash
cd website && pnpm add rrweb rrweb-player
git add website/package.json website/pnpm-lock.yaml
git commit -m "chore(website): add rrweb + rrweb-player"
```

- [ ] **Step 2: Write failing test for upload endpoint**

```ts
// website/src/pages/api/admin/evidence/upload.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from './upload';
import { getPool } from '../../../../lib/db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';

const FAKE_ADMIN_REQ = (body: any) =>
  new Request('http://test/api/admin/evidence/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': 'admin_session=TEST_FIXTURE_SESSION',
    },
    body: JSON.stringify(body),
  });

describe('POST /api/admin/evidence/upload', () => {
  beforeAll(async () => {
    await ensureSystemtestSchema(getPool());
  });

  it('creates evidence row from a chunked rrweb upload', async () => {
    const pool = getPool();
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text) VALUES ($1, 1, 'q') RETURNING id`,
      [tplId]
    )).rows[0].id;
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status) VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId]
    )).rows[0].id;

    const res = await POST(FAKE_ADMIN_REQ({
      assignmentId: aId,
      questionId:   qId,
      attempt: 0,
      chunk: { events: [{ type: 0, data: {}, timestamp: 1 }], chunkIndex: 0, isFinal: true },
      consoleLog: [],
      networkLog: [],
    }) as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.evidenceId).toMatch(/^[0-9a-f-]{36}$/);

    const row = await pool.query(
      `SELECT replay_path, partial FROM questionnaire_test_evidence WHERE id = $1`,
      [json.evidenceId]
    );
    expect(row.rows[0].partial).toBe(false);
    expect(row.rows[0].replay_path).toMatch(/\.rrweb$/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/pages/api/admin/evidence/upload.test.ts`
Expected: FAIL — endpoint not found.

- [ ] **Step 4: Implement upload endpoint**

```ts
// website/src/pages/api/admin/evidence/upload.ts
import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import { verifyAdminSession } from '../../../../lib/auth';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EVIDENCE_ROOT = process.env.EVIDENCE_ROOT ?? '/var/evidence';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  const admin = await verifyAdminSession(request);
  if (!admin) return new Response('unauthorized', { status: 401 });

  const body = await request.json();
  const { assignmentId, questionId, attempt, chunk, consoleLog, networkLog } = body;

  // Reject anything that isn't a clean UUID — these are joined into a filesystem path.
  if (!UUID_RE.test(assignmentId) || !UUID_RE.test(questionId)) {
    return new Response('bad ids', { status: 400 });
  }
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 1000) {
    return new Response('bad attempt', { status: 400 });
  }

  const pool = getPool();
  const existing = await pool.query(
    `SELECT id, replay_path FROM questionnaire_test_evidence
     WHERE assignment_id=$1 AND question_id=$2 AND attempt=$3`,
    [assignmentId, questionId, attempt]
  );

  let id: string, replayPath: string;
  if (existing.rows.length === 0) {
    const dir = path.join(EVIDENCE_ROOT, assignmentId, questionId);
    await fs.mkdir(dir, { recursive: true });
    replayPath = path.join(dir, `${attempt}.rrweb`);
    const ins = await pool.query(
      `INSERT INTO questionnaire_test_evidence
        (assignment_id, question_id, attempt, replay_path, recorded_from)
       VALUES ($1,$2,$3,$4, now())
       RETURNING id`,
      [assignmentId, questionId, attempt, replayPath]
    );
    id = ins.rows[0].id;
  } else {
    id = existing.rows[0].id;
    replayPath = existing.rows[0].replay_path;
  }

  // Append the chunk's events as JSONL (one JSON object per line).
  const lines = chunk.events.map((e: any) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(replayPath, lines);

  if (chunk.isFinal) {
    await pool.query(
      `UPDATE questionnaire_test_evidence
         SET recorded_to = now(),
             console_log = $2,
             network_log = $3
       WHERE id = $1`,
      [id, JSON.stringify(consoleLog ?? []), JSON.stringify(networkLog ?? [])]
    );
  }

  return new Response(JSON.stringify({ evidenceId: id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 5: Implement replay endpoint**

```ts
// website/src/pages/api/admin/evidence/[id]/replay.ts
import type { APIRoute } from 'astro';
import { getPool } from '../../../../../lib/db';
import { verifyAdminSession } from '../../../../../lib/auth';
import { createReadStream } from 'node:fs';

export const GET: APIRoute = async ({ params, request }) => {
  const admin = await verifyAdminSession(request);
  if (!admin) return new Response('unauthorized', { status: 401 });

  const r = await getPool().query(
    `SELECT replay_path FROM questionnaire_test_evidence WHERE id=$1`,
    [params.id]
  );
  if (r.rows.length === 0) return new Response('not found', { status: 404 });

  const stream = createReadStream(r.rows[0].replay_path);
  return new Response(stream as any, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
};
```

- [ ] **Step 6: Implement frontend recorder**

```ts
// website/src/lib/systemtest/recorder.ts
import { record } from 'rrweb';

const FLUSH_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

export interface RecorderHandle {
  finalize(): Promise<{ evidenceId: string | null; partial: boolean }>;
  cancel(): void;
}

interface RecorderOpts {
  assignmentId: string;
  questionId: string;
  attempt: number;
}

export function startRecorder(opts: RecorderOpts): RecorderHandle {
  const events: any[] = [];
  const consoleLog: any[] = [];
  const networkLog: any[] = [];
  let chunkIndex = 0;
  let evidenceId: string | null = null;
  let partial = false;
  let bufferBytes = 0;

  const stop = record({
    emit(event) {
      events.push(event);
      bufferBytes += JSON.stringify(event).length;
      if (bufferBytes > MAX_BUFFER) {
        const drop = Math.floor(events.length * 0.25);
        events.splice(0, drop);
        bufferBytes = events.reduce((s, e) => s + JSON.stringify(e).length, 0);
        partial = true;
      }
    },
  });

  for (const lvl of ['error', 'warn'] as const) {
    const orig = console[lvl];
    console[lvl] = (...args: any[]) => {
      consoleLog.push({ level: lvl, args: args.map(String), at: Date.now() });
      orig(...args);
    };
  }
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const t0 = Date.now();
    try {
      const res = await origFetch(...args);
      networkLog.push({ url: String(args[0]), status: res.status, ms: Date.now() - t0 });
      if (networkLog.length > 20) networkLog.shift();
      return res;
    } catch (e) {
      networkLog.push({ url: String(args[0]), error: String(e), ms: Date.now() - t0 });
      throw e;
    }
  };

  async function flush(isFinal: boolean): Promise<void> {
    if (events.length === 0 && !isFinal) return;
    const chunk = { events: events.splice(0), chunkIndex: chunkIndex++, isFinal };
    bufferBytes = 0;
    const body = JSON.stringify({ ...opts, chunk, consoleLog, networkLog });
    const delays = [5_000, 15_000, 45_000];
    for (let attemptN = 0; ; attemptN++) {
      try {
        const res = await fetch('/api/admin/evidence/upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        evidenceId = json.evidenceId;
        return;
      } catch {
        if (attemptN >= delays.length) {
          partial = true;
          events.unshift(...chunk.events);
          return;
        }
        await new Promise(r => setTimeout(r, delays[attemptN]));
      }
    }
  }

  const interval = setInterval(() => { void flush(false); }, FLUSH_MS);

  const handlePageHide = () => {
    if (events.length > 0) {
      const blob = new Blob([JSON.stringify({
        ...opts,
        chunk: { events: events.splice(0), chunkIndex: chunkIndex++, isFinal: true },
        consoleLog, networkLog,
      })], { type: 'application/json' });
      navigator.sendBeacon('/api/admin/evidence/upload', blob);
    }
  };
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handlePageHide);

  return {
    async finalize() {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      stop?.();
      await flush(true);
      return { evidenceId, partial };
    },
    cancel() {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      stop?.();
    },
  };
}
```

- [ ] **Step 7: Add PVC manifest**

```yaml
# k3d/pvc-evidence.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: evidence-pvc
  namespace: workspace
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 5Gi
```

- [ ] **Step 8: Mount the PVC on the website pod**

In `k3d/website.yaml`, find the website Deployment's `spec.template.spec.containers[0]` and add:

```yaml
        volumeMounts:
        - name: evidence
          mountPath: /var/evidence
        # ... existing volumeMounts ...
      volumes:
      - name: evidence
        persistentVolumeClaim:
          claimName: evidence-pvc
        # ... existing volumes ...
```

Add the PVC manifest to `k3d/kustomization.yaml`:

```yaml
resources:
  # ... existing entries ...
  - pvc-evidence.yaml
```

- [ ] **Step 9: Run tests + validate manifests**

```bash
cd website && pnpm vitest run src/pages/api/admin/evidence/upload.test.ts
cd .. && task workspace:validate
```

Expected: vitest PASS, kustomize dry-run clean.

- [ ] **Step 10: Commit**

```bash
git add website/src/lib/systemtest/recorder.ts \
        website/src/pages/api/admin/evidence/upload.ts \
        website/src/pages/api/admin/evidence/upload.test.ts \
        website/src/pages/api/admin/evidence/[id]/replay.ts \
        k3d/pvc-evidence.yaml \
        k3d/website.yaml \
        k3d/kustomization.yaml
git commit -m "feat(systemtest): rrweb recorder + evidence upload/replay endpoints + PVC"
```

---

## Task 4: Seed registry, magic-link, and seed endpoint

**Files:**
- Create: `website/src/lib/auth/magic-link.ts`
- Create: `website/src/lib/systemtest/seed-context.ts`
- Create: `website/src/lib/systemtest-seeds/auth-only.ts`
- Create: `website/src/lib/systemtest-seeds/booking-flow.ts`
- Create: `website/src/lib/systemtest-seeds/coaching-project.ts`
- Create: `website/src/lib/systemtest-seeds/livestream-viewer.ts`
- Create: `website/src/pages/api/admin/systemtest/seed.ts`
- Create: `website/src/pages/api/auth/magic.ts`
- Test: `website/src/lib/systemtest-seeds/auth-only.test.ts`
- Test: `website/src/pages/api/admin/systemtest/seed.test.ts`

- [ ] **Step 1: Define `SeedContext` and `SeedResult` types**

```ts
// website/src/lib/systemtest/seed-context.ts
import type { PoolClient } from 'pg';

export interface SeedContext {
  assignmentId: string;
  questionId: string;
  attempt: number;
  role: 'admin' | 'coach' | 'customer' | 'guest';
  db: PoolClient; // open transaction
  keycloakAdmin: KeycloakAdminClient;
  /** Records the row in questionnaire_test_fixtures. The seed module is responsible
   *  for writing is_test_data=true on the underlying row. */
  track(table: string, rowId: string): Promise<void>;
}

export interface SeedResult {
  testUser: { id: string; email: string; password: string };
  magicLink: string;
  fixturesSummary: string;
}

export type SeedFn = (ctx: SeedContext) => Promise<SeedResult>;

export interface KeycloakAdminClient {
  createUser(opts: { email: string; password: string; role: string; isTestData: true }): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  mintActionToken(userId: string, redirectUri: string, ttlSec: number): Promise<string>;
}
```

- [ ] **Step 2: Implement `magic-link.ts` and the magic redeem route**

```ts
// website/src/lib/auth/magic-link.ts
import type { KeycloakAdminClient } from '../systemtest/seed-context';

export async function mintMagicLink(
  kc: KeycloakAdminClient,
  userId: string,
  redirectUri: string
): Promise<string> {
  const token = await kc.mintActionToken(userId, redirectUri, 300); // 5min TTL
  const base = process.env.PUBLIC_URL ?? '';
  return `${base}/api/auth/magic?token=${encodeURIComponent(token)}&to=${encodeURIComponent(redirectUri)}`;
}
```

```ts
// website/src/pages/api/auth/magic.ts
import type { APIRoute } from 'astro';
import { kcClient } from '../../../lib/keycloak';
import { issueSession } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const to = url.searchParams.get('to') ?? '/';
  if (!token) return new Response('missing token', { status: 400 });

  const verified = await kcClient().redeemActionToken(token);
  if (!verified.ok) {
    // textContent-style assembly via DOM in browser would be safer than HTML;
    // server-side this is a static string with no interpolation, so it's safe.
    return new Response(
      '<!doctype html><html><body>' +
      '<p>Magic link expired.</p>' +
      '<p>Ask the admin to <em>Reissue magic link</em> from the questionnaire.</p>' +
      '</body></html>',
      { status: 410, headers: { 'content-type': 'text/html' } }
    );
  }

  const cookie = await issueSession(verified.userId);
  return new Response(null, {
    status: 302,
    headers: { 'set-cookie': cookie, 'location': to },
  });
};
```

`kcClient().redeemActionToken` is a thin wrapper around Keycloak's existing token endpoint — implement in `website/src/lib/keycloak.ts` if not already present, calling Keycloak's `POST /realms/<realm>/protocol/openid-connect/token`. Reuse existing OIDC config from `KEYCLOAK_*` env vars.

- [ ] **Step 3: Write failing test for `auth-only` seed**

```ts
// website/src/lib/systemtest-seeds/auth-only.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import authOnly from './auth-only';
import type { SeedContext } from '../systemtest/seed-context';
import { getPool } from '../db';
import { ensureSystemtestSchema } from '../systemtest/db';

function fakeKc() {
  return {
    createUser: vi.fn().mockResolvedValue({ id: 'kc-user-id-1' }),
    deleteUser: vi.fn(),
    mintActionToken: vi.fn().mockResolvedValue('FAKE_TOKEN'),
  };
}

describe('auth-only seed', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('creates a test user with the requested role and returns a magic link', async () => {
    const tracked: Array<{ t: string; id: string }> = [];
    const client = await getPool().connect();
    const ctx: SeedContext = {
      assignmentId: '11111111-1111-1111-1111-111111111111',
      questionId:   '22222222-2222-2222-2222-222222222222',
      attempt: 0,
      role: 'customer',
      db: client,
      keycloakAdmin: fakeKc(),
      track: async (t, id) => { tracked.push({ t, id }); },
    };
    try {
      await client.query('BEGIN');
      const result = await authOnly(ctx);
      expect(result.testUser.email).toMatch(/^test-.*@.*$/);
      expect(result.magicLink).toContain('token=FAKE_TOKEN');
      expect(tracked).toEqual([{ t: 'auth.users', id: 'kc-user-id-1' }]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/systemtest-seeds/auth-only.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `auth-only` seed**

```ts
// website/src/lib/systemtest-seeds/auth-only.ts
import type { SeedFn } from '../systemtest/seed-context';
import { mintMagicLink } from '../auth/magic-link';

const authOnly: SeedFn = async (ctx) => {
  const email = `test-${ctx.assignmentId.slice(0, 8)}-${ctx.attempt}@systemtest.local`;
  const password = `T3st!${ctx.assignmentId.slice(0, 8)}`;
  const { id: userId } = await ctx.keycloakAdmin.createUser({
    email, password, role: ctx.role, isTestData: true,
  });
  await ctx.track('auth.users', userId);

  const magicLink = await mintMagicLink(
    ctx.keycloakAdmin, userId, `/admin/fragebogen/${ctx.assignmentId}`
  );

  return {
    testUser: { id: userId, email, password },
    magicLink,
    fixturesSummary: `1 test user created (role=${ctx.role})`,
  };
};

export default authOnly;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/systemtest-seeds/auth-only.test.ts`
Expected: PASS.

- [ ] **Step 7: Implement remaining three seed modules**

```ts
// website/src/lib/systemtest-seeds/booking-flow.ts
import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const bookingFlow: SeedFn = async (ctx) => {
  const base = await authOnly(ctx);
  const r = await ctx.db.query(
    `INSERT INTO bookings.bookings
       (customer_user_id, slot_at, status, is_test_data)
     VALUES ($1, now() + interval '7 days', 'draft', true)
     RETURNING id`,
    [base.testUser.id]
  );
  await ctx.track('bookings.bookings', r.rows[0].id);
  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} + 1 draft booking 1 week out`,
  };
};
export default bookingFlow;
```

```ts
// website/src/lib/systemtest-seeds/coaching-project.ts
import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const coachingProject: SeedFn = async (ctx) => {
  const base = await authOnly(ctx);
  const t = await ctx.db.query(
    `INSERT INTO tickets.tickets
       (type, status, title, customer_id, brand, is_test_data)
     VALUES ('project', 'in_progress', 'Systemtest project', $1,
             current_setting('app.brand_id', true), true)
     RETURNING id`,
    [base.testUser.id]
  );
  await ctx.track('tickets.tickets', t.rows[0].id);
  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} + 1 in-progress project ticket`,
  };
};
export default coachingProject;
```

```ts
// website/src/lib/systemtest-seeds/livestream-viewer.ts
import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const livestreamViewer: SeedFn = async (ctx) => {
  const base = await authOnly(ctx);
  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} (livestream room joined ad-hoc by tester)`,
  };
};
export default livestreamViewer;
```

- [ ] **Step 8: Implement the seed endpoint**

```ts
// website/src/pages/api/admin/systemtest/seed.ts
import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import { verifyAdminSession } from '../../../../lib/auth';
import { kcAdmin } from '../../../../lib/keycloak';
import authOnly from '../../../../lib/systemtest-seeds/auth-only';
import bookingFlow from '../../../../lib/systemtest-seeds/booking-flow';
import coachingProject from '../../../../lib/systemtest-seeds/coaching-project';
import livestreamViewer from '../../../../lib/systemtest-seeds/livestream-viewer';
import type { SeedFn } from '../../../../lib/systemtest/seed-context';

const REGISTRY: Record<string, SeedFn> = {
  'auth-only': authOnly,
  'booking-flow': bookingFlow,
  'coaching-project': coachingProject,
  'livestream-viewer': livestreamViewer,
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await verifyAdminSession(request);
  if (!admin) return new Response('unauthorized', { status: 401 });

  const { assignmentId, questionId } = await request.json();
  const pool = getPool();

  const meta = await pool.query(
    `SELECT q.test_role, t.id AS template_id, qts.retest_attempt,
            COALESCE(reg_q.seed_module, reg_t.seed_module) AS seed_module
     FROM questionnaire_questions q
     JOIN questionnaire_templates t ON t.id = q.template_id
     JOIN questionnaire_assignments a ON a.template_id = t.id
     LEFT JOIN questionnaire_test_status qts
       ON qts.assignment_id = a.id AND qts.question_id = q.id
     LEFT JOIN questionnaire_test_seed_registry reg_q
       ON reg_q.template_id = t.id AND reg_q.question_id = q.id
     LEFT JOIN questionnaire_test_seed_registry reg_t
       ON reg_t.template_id = t.id AND reg_t.question_id IS NULL
     WHERE a.id = $1 AND q.id = $2`,
    [assignmentId, questionId]
  );
  if (meta.rows.length === 0) return new Response('not found', { status: 404 });
  const { test_role: role, retest_attempt, seed_module } = meta.rows[0];
  const fn = REGISTRY[seed_module];
  if (!fn) return new Response(`unknown seed module: ${seed_module}`, { status: 500 });
  const attempt = retest_attempt ?? 0;

  const lockKey = hashLockKey(assignmentId, questionId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

    const result = await fn({
      assignmentId, questionId, attempt,
      role: role ?? 'customer',
      db: client,
      keycloakAdmin: kcAdmin(),
      track: async (table: string, rowId: string) => {
        await client.query(
          `INSERT INTO questionnaire_test_fixtures
             (assignment_id, question_id, attempt, table_name, row_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [assignmentId, questionId, attempt, table, rowId]
        );
      },
    });
    await client.query('COMMIT');
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return new Response(`seed failed: ${(e as Error).message}`, { status: 500 });
  } finally {
    client.release();
  }
};

function hashLockKey(a: string, b: string): number {
  const s = `${a}|${b}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
```

- [ ] **Step 9: Write end-to-end test for the seed endpoint**

```ts
// website/src/pages/api/admin/systemtest/seed.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { POST } from './seed';
import { getPool } from '../../../../lib/db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';

vi.mock('../../../../lib/keycloak', () => ({
  kcAdmin: () => ({
    createUser: async () => ({ id: 'kc-test-uid' }),
    deleteUser: async () => {},
    mintActionToken: async () => 'TOKEN',
  }),
}));

describe('POST /api/admin/systemtest/seed', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('runs the registered seed module and returns a magic link', async () => {
    const pool = getPool();
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('test', true) RETURNING id`
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, test_role)
       VALUES ($1, 1, 'q', 'customer') RETURNING id`,
      [tplId]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_seed_registry (template_id, question_id, seed_module)
       VALUES ($1, $2, 'auth-only')`,
      [tplId, qId]
    );
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId]
    )).rows[0].id;

    const req = new Request('http://x/api/admin/systemtest/seed', {
      method: 'POST',
      headers: { 'cookie': 'admin_session=TEST_FIXTURE_SESSION' },
      body: JSON.stringify({ assignmentId: aId, questionId: qId }),
    });
    const res = await POST({ request: req } as any);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.magicLink).toContain('token=TOKEN');
    expect(j.testUser.email).toMatch(/^test-.*$/);
  });
});
```

- [ ] **Step 10: Run all task-4 tests**

Run: `cd website && pnpm vitest run src/lib/systemtest-seeds/ src/pages/api/admin/systemtest/seed.test.ts`
Expected: PASS for all.

- [ ] **Step 11: Commit**

```bash
git add website/src/lib/auth/magic-link.ts \
        website/src/lib/systemtest/seed-context.ts \
        website/src/lib/systemtest-seeds/ \
        website/src/pages/api/admin/systemtest/seed.ts \
        website/src/pages/api/admin/systemtest/seed.test.ts \
        website/src/pages/api/auth/magic.ts
git commit -m "feat(systemtest): seed registry, 4 seed modules, magic-link auth flow"
```

---

## Task 5: Failure-bridge + outbox worker

**Files:**
- Create: `website/src/lib/systemtest/failure-bridge.ts`
- Modify: `website/src/lib/questionnaire-db.ts`
- Test: `website/src/lib/systemtest/failure-bridge.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// website/src/lib/systemtest/failure-bridge.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool } from '../db';
import { ensureSystemtestSchema } from './db';
import { openFailureTicket } from './failure-bridge';

describe('openFailureTicket', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('creates a bug ticket with source_test back-refs and updates status', async () => {
    const pool = getPool();
    const tplId = (await pool.query(
      `INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`
    )).rows[0].id;
    const qId = (await pool.query(
      `INSERT INTO questionnaire_questions
         (template_id, position, question_text, test_expected_result)
       VALUES ($1, 1, 'Does the booking page render?', 'Page should show 3 slots')
       RETURNING id`,
      [tplId]
    )).rows[0].id;
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status)
       VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
      [tplId]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_status
        (assignment_id, question_id, last_result, last_result_at)
       VALUES ($1, $2, 'nicht_erfüllt', now())`,
      [aId, qId]
    );
    const evId = (await pool.query(
      `INSERT INTO questionnaire_test_evidence (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 0, '/var/evidence/x.rrweb') RETURNING id`,
      [aId, qId]
    )).rows[0].id;

    const ticketId = await openFailureTicket(pool, {
      assignmentId: aId, questionId: qId, evidenceId: evId,
      details: 'no slots showed up',
    });

    const t = await pool.query(
      `SELECT type, source_test_assignment_id, source_test_question_id, title
       FROM tickets.tickets WHERE id = $1`,
      [ticketId]
    );
    expect(t.rows[0].type).toBe('bug');
    expect(t.rows[0].source_test_assignment_id).toBe(aId);
    expect(t.rows[0].source_test_question_id).toBe(qId);
    expect(t.rows[0].title).toContain('Systemtest:');

    const qts = await pool.query(
      `SELECT last_failure_ticket_id FROM questionnaire_test_status
       WHERE assignment_id = $1 AND question_id = $2`,
      [aId, qId]
    );
    expect(qts.rows[0].last_failure_ticket_id).toBe(ticketId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/systemtest/failure-bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `failure-bridge.ts`**

```ts
// website/src/lib/systemtest/failure-bridge.ts
import type { Pool } from 'pg';

interface OpenFailureOpts {
  assignmentId: string;
  questionId: string;
  evidenceId?: string | null;
  details?: string | null;
}

export async function openFailureTicket(pool: Pool, opts: OpenFailureOpts): Promise<string> {
  const meta = await pool.query(
    `SELECT t.title AS template_title, q.position, q.question_text, q.test_expected_result
     FROM questionnaire_questions q
     JOIN questionnaire_templates t ON t.id = q.template_id
     WHERE q.id = $1`,
    [opts.questionId]
  );
  if (meta.rows.length === 0) throw new Error(`question ${opts.questionId} not found`);
  const { template_title, position, question_text, test_expected_result } = meta.rows[0];

  const titleStem = (question_text ?? '').slice(0, 80);
  const title = `Systemtest: ${template_title} — Q${position}: ${titleStem}`;
  const replayLink = opts.evidenceId
    ? `/api/admin/evidence/${opts.evidenceId}/replay`
    : '(no recording available)';
  const description = [
    `**Erwartetes Ergebnis:** ${test_expected_result ?? '(none)'}`,
    `**Tester-Notiz:** ${opts.details ?? '(none)'}`,
    `**Replay:** ${replayLink}`,
    `**Assignment:** /admin/fragebogen/${opts.assignmentId}`,
  ].join('\n\n');

  const t = await pool.query(
    `INSERT INTO tickets.tickets
       (type, status, severity, title, description,
        source_test_assignment_id, source_test_question_id)
     VALUES ('bug', 'triage', 'major', $1, $2, $3, $4)
     RETURNING id`,
    [title, description, opts.assignmentId, opts.questionId]
  );
  const ticketId = t.rows[0].id;

  await pool.query(
    `UPDATE questionnaire_test_status
       SET last_failure_ticket_id = $3, evidence_id = COALESCE($4, evidence_id)
     WHERE assignment_id = $1 AND question_id = $2`,
    [opts.assignmentId, opts.questionId, ticketId, opts.evidenceId ?? null]
  );

  return ticketId;
}

export async function enqueueOutboxRetry(pool: Pool, opts: {
  assignmentId: string; questionId: string; attempt: number; error: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO systemtest_failure_outbox
       (assignment_id, question_id, attempt, last_error, retry_after)
     VALUES ($1, $2, $3, $4, now() + interval '5 minutes')`,
    [opts.assignmentId, opts.questionId, opts.attempt, opts.error]
  );
}
```

- [ ] **Step 4: Wire bridge into the answer-save path**

In `website/src/lib/questionnaire-db.ts` find the function that writes to `questionnaire_test_status` (search for `INSERT INTO questionnaire_test_status` near line 598). After that INSERT, add:

```ts
import { openFailureTicket, enqueueOutboxRetry } from './systemtest/failure-bridge';

// ... after the existing INSERT INTO questionnaire_test_status:
if (
  isSystemTestTemplate &&            // already known by the caller
  result === 'nicht_erfüllt'
) {
  try {
    await openFailureTicket(pool, {
      assignmentId, questionId, evidenceId, details: detailsText,
    });
  } catch (e) {
    await enqueueOutboxRetry(pool, {
      assignmentId, questionId, attempt,
      error: (e as Error).message,
    }).catch(() => {});
  }
}
```

(`isSystemTestTemplate`, `evidenceId`, `attempt`, `detailsText` are all in scope at the call site or trivially derivable.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/systemtest/failure-bridge.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/systemtest/failure-bridge.ts \
        website/src/lib/systemtest/failure-bridge.test.ts \
        website/src/lib/questionnaire-db.ts
git commit -m "feat(systemtest): auto-create failure ticket from nicht_erfüllt answer + outbox fallback"
```

---

## Task 6: Retest trigger verification + reconciler

The trigger itself was created in Task 1; this task verifies it fires correctly and adds the reconciler safety net.

**Files:**
- Create: `website/src/lib/systemtest/reconciler.ts`
- Test: `website/src/lib/systemtest/reconciler.test.ts`
- Test: `website/src/lib/systemtest/retest-trigger.test.ts`

- [ ] **Step 1: Write trigger test**

```ts
// website/src/lib/systemtest/retest-trigger.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool } from '../db';
import { ensureSystemtestSchema } from './db';

async function setupFailedStatus(pool: any) {
  const tplId = (await pool.query(`INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`)).rows[0].id;
  const qId = (await pool.query(
    `INSERT INTO questionnaire_questions (template_id, position, question_text) VALUES ($1, 1, 'q') RETURNING id`,
    [tplId]
  )).rows[0].id;
  const aId = (await pool.query(
    `INSERT INTO questionnaire_assignments (customer_id, template_id, status) VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`,
    [tplId]
  )).rows[0].id;
  await pool.query(
    `INSERT INTO questionnaire_test_status (assignment_id, question_id, last_result, last_result_at, retest_attempt)
     VALUES ($1, $2, 'nicht_erfüllt', now(), 0)`,
    [aId, qId]
  );
  const tId = (await pool.query(
    `INSERT INTO tickets.tickets (type, status, title, source_test_assignment_id, source_test_question_id)
     VALUES ('bug', 'triage', 'fail', $1, $2) RETURNING id`,
    [aId, qId]
  )).rows[0].id;
  return { aId, qId, tId };
}

describe('retest trigger', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('sets retest_pending_at when ticket.resolution flips to fixed', async () => {
    const pool = getPool();
    const { aId, qId, tId } = await setupFailedStatus(pool);

    await pool.query(`UPDATE tickets.tickets SET resolution = 'fixed' WHERE id = $1`, [tId]);

    const r = await pool.query(
      `SELECT retest_pending_at, retest_attempt FROM questionnaire_test_status
       WHERE assignment_id = $1 AND question_id = $2`,
      [aId, qId]
    );
    expect(r.rows[0].retest_pending_at).not.toBeNull();
    expect(r.rows[0].retest_attempt).toBe(1);
  });

  it('does NOT set retest_pending_at on resolution=wontfix', async () => {
    const pool = getPool();
    const { aId, qId, tId } = await setupFailedStatus(pool);

    await pool.query(`UPDATE tickets.tickets SET resolution = 'wontfix' WHERE id = $1`, [tId]);

    const r = await pool.query(
      `SELECT retest_pending_at FROM questionnaire_test_status
       WHERE assignment_id = $1 AND question_id = $2`,
      [aId, qId]
    );
    expect(r.rows[0].retest_pending_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run trigger test**

Run: `cd website && pnpm vitest run src/lib/systemtest/retest-trigger.test.ts`
Expected: PASS for both cases (trigger created in Task 1).

If it fails, fix the trigger SQL in `systemtest/db.ts`.

- [ ] **Step 3: Write failing test for reconciler**

```ts
// website/src/lib/systemtest/reconciler.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool } from '../db';
import { ensureSystemtestSchema } from './db';
import { runReconciler } from './reconciler';

describe('runReconciler', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('catches resolution=fixed updates that bypassed the trigger', async () => {
    const pool = getPool();
    // Setup: identical to the trigger test, then bypass the trigger:
    // SET session_replication_role = replica;
    // UPDATE tickets.tickets SET resolution='fixed' ...;
    // SET session_replication_role = origin;
    // Then verify retest_pending_at IS NULL.
    // Then runReconciler() and verify it's now set.
    const tplId = (await pool.query(`INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`)).rows[0].id;
    const qId = (await pool.query(`INSERT INTO questionnaire_questions (template_id, position, question_text) VALUES ($1, 1, 'q') RETURNING id`, [tplId])).rows[0].id;
    const aId = (await pool.query(`INSERT INTO questionnaire_assignments (customer_id, template_id, status) VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`, [tplId])).rows[0].id;
    const tId = (await pool.query(
      `INSERT INTO tickets.tickets (type, status, title, source_test_assignment_id, source_test_question_id)
       VALUES ('bug', 'triage', 'fail', $1, $2) RETURNING id`,
      [aId, qId]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_status
         (assignment_id, question_id, last_result, last_result_at, last_failure_ticket_id, retest_attempt)
       VALUES ($1, $2, 'nicht_erfüllt', now(), $3, 0)`,
      [aId, qId, tId]
    );

    await pool.query(`SET session_replication_role = replica`);
    await pool.query(`UPDATE tickets.tickets SET resolution = 'fixed' WHERE id = $1`, [tId]);
    await pool.query(`SET session_replication_role = origin`);

    let qts = await pool.query(`SELECT retest_pending_at FROM questionnaire_test_status WHERE assignment_id=$1 AND question_id=$2`, [aId, qId]);
    expect(qts.rows[0].retest_pending_at).toBeNull();

    const r = await runReconciler(pool);
    expect(r.patched).toBeGreaterThan(0);

    qts = await pool.query(`SELECT retest_pending_at, retest_attempt FROM questionnaire_test_status WHERE assignment_id=$1 AND question_id=$2`, [aId, qId]);
    expect(qts.rows[0].retest_pending_at).not.toBeNull();
    expect(qts.rows[0].retest_attempt).toBe(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/systemtest/reconciler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement reconciler**

```ts
// website/src/lib/systemtest/reconciler.ts
import type { Pool } from 'pg';

export async function runReconciler(pool: Pool): Promise<{ patched: number }> {
  const r = await pool.query(`
    UPDATE questionnaire_test_status qts
       SET retest_pending_at = COALESCE(qts.retest_pending_at, now()),
           retest_attempt    = qts.retest_attempt + 1
      FROM tickets.tickets t
     WHERE t.id = qts.last_failure_ticket_id
       AND t.resolution = 'fixed'
       AND qts.retest_pending_at IS NULL
       AND t.source_test_assignment_id = qts.assignment_id
       AND t.source_test_question_id   = qts.question_id
    RETURNING qts.assignment_id
  `);
  return { patched: r.rowCount ?? 0 };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/systemtest/reconciler.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/systemtest/reconciler.ts \
        website/src/lib/systemtest/reconciler.test.ts \
        website/src/lib/systemtest/retest-trigger.test.ts
git commit -m "test(systemtest): retest trigger + reconciler safety net"
```

---

## Task 7: Failure kanban page + API

**Files:**
- Create: `website/src/pages/api/admin/systemtest/board.ts`
- Create: `website/src/pages/admin/systemtest/board.astro`
- Create: `website/src/components/SystemtestBoardCard.svelte`
- Create: `website/src/components/SystemtestReplayDrawer.svelte`
- Test: `website/src/pages/api/admin/systemtest/board.test.ts`
- Test: `tests/e2e/FA-30-systemtest-failure-loop.spec.ts`

- [ ] **Step 1: Write failing API test**

```ts
// website/src/pages/api/admin/systemtest/board.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { GET } from './board';
import { getPool } from '../../../../lib/db';
import { ensureSystemtestSchema } from '../../../../lib/systemtest/db';

describe('GET /api/admin/systemtest/board', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('groups rows by column_key', async () => {
    const pool = getPool();
    // Seed at least one open failure so the view returns a row.
    const tplId = (await pool.query(`INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`)).rows[0].id;
    const qId = (await pool.query(`INSERT INTO questionnaire_questions (template_id, position, question_text) VALUES ($1, 1, 'q') RETURNING id`, [tplId])).rows[0].id;
    const aId = (await pool.query(`INSERT INTO questionnaire_assignments (customer_id, template_id, status) VALUES (gen_random_uuid(), $1, 'in_progress') RETURNING id`, [tplId])).rows[0].id;
    const tId = (await pool.query(
      `INSERT INTO tickets.tickets (type, status, title, source_test_assignment_id, source_test_question_id)
       VALUES ('bug', 'triage', 'fail', $1, $2) RETURNING id`,
      [aId, qId]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_status
         (assignment_id, question_id, last_result, last_result_at, last_failure_ticket_id)
       VALUES ($1, $2, 'nicht_erfüllt', now(), $3)`,
      [aId, qId, tId]
    );

    const req = new Request('http://x/api/admin/systemtest/board', {
      method: 'GET', headers: { 'cookie': 'admin_session=TEST_FIXTURE_SESSION' },
    });
    const res = await GET({ request: req } as any);
    const j = await res.json();
    expect(j.columns).toEqual(
      expect.objectContaining({
        open: expect.any(Array),
        fix_in_pr: expect.any(Array),
        retest_pending: expect.any(Array),
        green: expect.any(Array),
      })
    );
    expect(j.columns.open.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement the API endpoint**

```ts
// website/src/pages/api/admin/systemtest/board.ts
import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import { verifyAdminSession } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const admin = await verifyAdminSession(request);
  if (!admin) return new Response('unauthorized', { status: 401 });

  const pool = getPool();
  const r = await pool.query(`SELECT * FROM v_systemtest_failure_board ORDER BY last_result_at DESC`);
  const columns: Record<string, any[]> = { open: [], fix_in_pr: [], retest_pending: [], green: [] };
  for (const row of r.rows) {
    if (row.column_key && columns[row.column_key]) columns[row.column_key].push(row);
  }
  const outbox = await pool.query(
    `SELECT count(*)::int AS n FROM systemtest_failure_outbox WHERE retry_count >= 12`
  );
  return new Response(
    JSON.stringify({ columns, undelivered: outbox.rows[0].n }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};
```

- [ ] **Step 3: Implement the Svelte card component**

```svelte
<!-- website/src/components/SystemtestBoardCard.svelte -->
<script lang="ts">
  export let row: {
    assignment_id: string;
    question_id: string;
    ticket_external_id: string | null;
    last_result_at: string;
    retest_attempt: number;
    evidence_id: string | null;
  };
  export let onOpen: (row: any) => void;
</script>

<button class="card" on:click={() => onOpen(row)}>
  <header>
    {#if row.ticket_external_id}<span class="ticket">{row.ticket_external_id}</span>{/if}
    <span class="age">{new Date(row.last_result_at).toLocaleString()}</span>
  </header>
  <p>Q in assignment {row.assignment_id.slice(0, 8)}…</p>
  {#if row.retest_attempt > 0}
    <span class="badge">attempt {row.retest_attempt + 1}</span>
  {/if}
</button>

<style>
  .card { display: block; width: 100%; padding: 0.75rem; background: var(--card-bg, #1a1a1a); border-radius: 6px; text-align: left; cursor: pointer; }
  .ticket { font-family: monospace; color: var(--accent, #d4a373); margin-right: 0.5rem; }
  .age { font-size: 0.8rem; opacity: 0.7; }
  .badge { display: inline-block; margin-top: 0.25rem; padding: 0.1rem 0.4rem; background: var(--brass, #c08552); color: black; border-radius: 3px; font-size: 0.75rem; }
</style>
```

- [ ] **Step 4: Implement the replay drawer**

```svelte
<!-- website/src/components/SystemtestReplayDrawer.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import rrwebPlayer from 'rrweb-player';
  import 'rrweb-player/dist/style.css';
  export let evidenceId: string;
  export let onClose: () => void;
  let mount: HTMLDivElement;
  let player: any;

  onMount(async () => {
    const res = await fetch(`/api/admin/evidence/${evidenceId}/replay`);
    const text = await res.text();
    const events = text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    player = new rrwebPlayer({ target: mount, props: { events, autoPlay: false } });
  });
  onDestroy(() => player?.$destroy?.());
</script>

<aside class="drawer">
  <button class="close" on:click={onClose}>×</button>
  <h3>Session replay</h3>
  <div bind:this={mount}></div>
</aside>

<style>
  .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: min(900px, 90vw); background: var(--bg, #0a0a0a); border-left: 1px solid #333; padding: 1rem; overflow: auto; z-index: 100; }
  .close { position: absolute; top: 0.5rem; right: 0.5rem; background: transparent; color: white; font-size: 1.5rem; border: 0; cursor: pointer; }
</style>
```

- [ ] **Step 5: Implement the kanban page (using safe DOM construction, no innerHTML)**

```astro
---
// website/src/pages/admin/systemtest/board.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
---
<AdminLayout title="Systemtest Board">
  <h1>Systemtest Failure Board</h1>
  <div id="board" class="cols"></div>

  <script>
    const cols = ['open','fix_in_pr','retest_pending','green'];
    const labels: Record<string,string> = {
      open:'Open', fix_in_pr:'Fix in PR', retest_pending:'Retest pending', green:'Green (7d)'
    };

    function cardElement(row: any): HTMLElement {
      const btn = document.createElement('button');
      btn.dataset.evidence = row.evidence_id ?? '';
      btn.dataset.assignment = row.assignment_id;
      btn.dataset.ticket = row.ticket_id ?? '';

      const ticketSpan = document.createElement('span');
      ticketSpan.className = 'ticket';
      ticketSpan.textContent = row.ticket_external_id ?? '(no ticket)';
      btn.appendChild(ticketSpan);

      btn.appendChild(document.createTextNode(' · '));

      const ageSpan = document.createElement('span');
      ageSpan.className = 'age';
      ageSpan.textContent = new Date(row.last_result_at).toLocaleString();
      btn.appendChild(ageSpan);

      if (row.retest_attempt > 0) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `attempt ${row.retest_attempt + 1}`;
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => {
        if (row.ticket_id) window.open(`/admin/tickets/${row.ticket_id}`, '_blank');
      });
      return btn;
    }

    function columnElement(key: string, count: number): HTMLElement {
      const col = document.createElement('section');
      col.className = 'col';
      const h2 = document.createElement('h2');
      h2.textContent = `${labels[key]} (${count})`;
      const cards = document.createElement('div');
      cards.className = 'cards';
      cards.dataset.col = key;
      col.appendChild(h2);
      col.appendChild(cards);
      return col;
    }

    function bannerElement(n: number): HTMLElement {
      const banner = document.createElement('div');
      banner.className = 'banner';
      banner.textContent = `${n} failure(s) couldn't be ticketed automatically`;
      return banner;
    }

    async function load() {
      const r = await fetch('/api/admin/systemtest/board');
      const data = await r.json();
      const root = document.getElementById('board')!;
      root.replaceChildren();

      if (data.undelivered > 0) root.appendChild(bannerElement(data.undelivered));

      for (const k of cols) {
        const col = columnElement(k, data.columns[k].length);
        const cards = col.querySelector('[data-col]')!;
        for (const row of data.columns[k]) cards.appendChild(cardElement(row));
        root.appendChild(col);
      }
    }

    load();
    setInterval(load, 30_000);
  </script>

  <style>
    .cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .col { background: #111; padding: 1rem; border-radius: 6px; min-height: 60vh; }
    .col h2 { font-size: 1rem; margin: 0 0 1rem; }
    .cards { display: flex; flex-direction: column; gap: 0.5rem; }
    .cards button { display: block; width: 100%; padding: 0.6rem; background: #1a1a1a; color: white; border: 0; border-radius: 4px; text-align: left; cursor: pointer; }
    .ticket { font-family: monospace; color: #d4a373; }
    .age { font-size: 0.8rem; opacity: 0.7; }
    .badge { display: inline-block; margin-left: 0.5rem; padding: 0.05rem 0.4rem; background: #c08552; color: black; border-radius: 3px; font-size: 0.75rem; }
    .banner { grid-column: 1 / -1; background: #5a3a00; padding: 0.5rem 1rem; border-radius: 4px; }
  </style>
</AdminLayout>
```

(Replay-drawer wiring to the cards is a follow-up — for v1 the click opens the ticket detail page, which has its own replay link. Mounting `SystemtestReplayDrawer` next to the board is left as a small enhancement once the rest is shipped.)

- [ ] **Step 6: Write Playwright E2E (FA-30)**

```ts
// tests/e2e/FA-30-systemtest-failure-loop.spec.ts
import { test, expect } from '@playwright/test';

test('FA-30: failed system-test step shows up on the kanban', async ({ page }) => {
  // Pre-seed: assume FA30_ASSIGNMENT_ID + FA30_QUESTION_ID env vars point at a
  // pre-created system-test assignment. Other FA-XX specs in tests/e2e/ document
  // how they wire fixtures — follow the same pattern (e.g. fetch a setup endpoint
  // before the test or run a seeding script in tests/runner.sh).

  await page.goto('/admin/login');
  // ... admin login flow used by other tests/e2e specs ...

  await page.goto(`/admin/fragebogen/${process.env.FA30_ASSIGNMENT_ID}`);
  await page.click('button:has-text("Seed test data")');
  await expect(page.locator('text=Testbenutzer')).toBeVisible();

  await page.click(`[data-question-id="${process.env.FA30_QUESTION_ID}"] button:has-text("nicht erfüllt")`);
  await page.fill('textarea[name="details"]', 'page rendered blank');
  await page.click('button:has-text("Speichern")');

  await page.goto('/admin/systemtest/board');
  await expect(page.locator('section.col:has(h2:text-matches("Open"))')).toContainText('page rendered blank');
});
```

- [ ] **Step 7: Run tests**

```bash
cd website && pnpm vitest run src/pages/api/admin/systemtest/board.test.ts
cd .. && ./tests/runner.sh local FA-30
```

Expected: API test PASS. E2E may initially be skipped if FA-30 fixture env vars aren't set; document them in `tests/runner.sh` env section in this commit.

- [ ] **Step 8: Commit**

```bash
git add website/src/pages/api/admin/systemtest/board.ts \
        website/src/pages/api/admin/systemtest/board.test.ts \
        website/src/pages/admin/systemtest/board.astro \
        website/src/components/SystemtestBoardCard.svelte \
        website/src/components/SystemtestReplayDrawer.svelte \
        tests/e2e/FA-30-systemtest-failure-loop.spec.ts
git commit -m "feat(systemtest): failure kanban page + board API + FA-30 e2e"
```

---

## Task 8: Cleanup CronJob

**Files:**
- Create: `website/src/lib/systemtest/cleanup.ts`
- Create: `website/scripts/systemtest-job.ts`
- Create: `k3d/cronjob-systemtest-cleanup.yaml`
- Modify: `k3d/kustomization.yaml`
- Test: `website/src/lib/systemtest/cleanup.test.ts`

- [ ] **Step 1: Write failing test for purge logic**

```ts
// website/src/lib/systemtest/cleanup.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { getPool } from '../db';
import { ensureSystemtestSchema } from './db';
import { purgeFixturesFor } from './cleanup';

describe('purgeFixturesFor', () => {
  beforeAll(async () => { await ensureSystemtestSchema(getPool()); });

  it('deletes is_test_data rows after grace window and is idempotent', async () => {
    const pool = getPool();
    const tplId = (await pool.query(`INSERT INTO questionnaire_templates (title, is_system_test) VALUES ('t', true) RETURNING id`)).rows[0].id;
    const qId = (await pool.query(`INSERT INTO questionnaire_questions (template_id, position, question_text) VALUES ($1, 1, 'q') RETURNING id`, [tplId])).rows[0].id;
    const aId = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, archived_at)
       VALUES (gen_random_uuid(), $1, 'archived', now() - interval '25 hours') RETURNING id`,
      [tplId]
    )).rows[0].id;
    const ticketId = (await pool.query(
      `INSERT INTO tickets.tickets (type, status, title, is_test_data) VALUES ('bug', 'triage', 'x', true) RETURNING id`
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_test_fixtures (assignment_id, question_id, attempt, table_name, row_id)
       VALUES ($1, $2, 0, 'tickets.tickets', $3)`,
      [aId, qId, ticketId]
    );

    const summary = await purgeFixturesFor(pool, { graceHours: 24 });
    expect(summary.purged).toBeGreaterThan(0);

    const t = await pool.query(`SELECT id FROM tickets.tickets WHERE id = $1`, [ticketId]);
    expect(t.rows.length).toBe(0);

    const summary2 = await purgeFixturesFor(pool, { graceHours: 24 });
    expect(summary2.purged).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/systemtest/cleanup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement cleanup**

```ts
// website/src/lib/systemtest/cleanup.ts
import type { Pool } from 'pg';

const ALLOWED_TABLES = new Set([
  'auth.users',
  'bookings.bookings',
  'tickets.tickets',
  'questionnaire_assignments',
]);

export async function purgeFixturesFor(
  pool: Pool, opts: { graceHours: number }
): Promise<{ purged: number; errors: number }> {
  const r = await pool.query(
    `SELECT f.id, f.table_name, f.row_id
     FROM questionnaire_test_fixtures f
     JOIN questionnaire_assignments a ON a.id = f.assignment_id
     WHERE f.purged_at IS NULL
       AND a.status IN ('submitted','reviewed','archived','dismissed')
       AND COALESCE(a.archived_at, a.dismissed_at, a.reviewed_at, a.submitted_at)
           < now() - ($1 || ' hours')::interval`,
    [opts.graceHours]
  );

  let purged = 0, errors = 0;
  for (const row of r.rows) {
    if (!ALLOWED_TABLES.has(row.table_name)) {
      await pool.query(
        `UPDATE questionnaire_test_fixtures
           SET purge_error = 'table_name not in ALLOWED_TABLES'
         WHERE id = $1`, [row.id]
      );
      errors++; continue;
    }
    try {
      // Note: row.table_name is whitelisted above, so substituting it here is safe.
      await pool.query(
        `DELETE FROM ${row.table_name} WHERE id = $1 AND is_test_data = true`,
        [row.row_id]
      );
      await pool.query(
        `UPDATE questionnaire_test_fixtures SET purged_at = now() WHERE id = $1`,
        [row.id]
      );
      purged++;
    } catch (e) {
      await pool.query(
        `UPDATE questionnaire_test_fixtures SET purge_error = $2 WHERE id = $1`,
        [row.id, (e as Error).message]
      );
      errors++;
    }
  }
  return { purged, errors };
}

export async function drainOutbox(pool: Pool): Promise<{ retried: number; succeeded: number }> {
  const { openFailureTicket } = await import('./failure-bridge');
  const due = await pool.query(
    `SELECT * FROM systemtest_failure_outbox
     WHERE retry_after <= now() AND retry_count < 12
     ORDER BY retry_after LIMIT 50`
  );
  let succeeded = 0;
  for (const row of due.rows) {
    try {
      await openFailureTicket(pool, {
        assignmentId: row.assignment_id,
        questionId: row.question_id,
      });
      await pool.query(`DELETE FROM systemtest_failure_outbox WHERE id = $1`, [row.id]);
      succeeded++;
    } catch (e) {
      await pool.query(
        `UPDATE systemtest_failure_outbox
           SET retry_count = retry_count + 1,
               retry_after = now() + interval '5 minutes',
               last_error  = $2
         WHERE id = $1`,
        [row.id, (e as Error).message]
      );
    }
  }
  return { retried: due.rowCount ?? 0, succeeded };
}
```

- [ ] **Step 4: Implement the script entrypoint**

```ts
// website/scripts/systemtest-job.ts
import { getPool } from '../src/lib/db';
import { purgeFixturesFor, drainOutbox } from '../src/lib/systemtest/cleanup';
import { runReconciler } from '../src/lib/systemtest/reconciler';

const mode = process.argv[2];
const pool = getPool();

(async () => {
  if (mode === 'cleanup-fixtures') {
    const r = await purgeFixturesFor(pool, { graceHours: 24 });
    console.log(JSON.stringify({ mode, ...r }));
  } else if (mode === 'drain-outbox') {
    const out = await drainOutbox(pool);
    const recon = await runReconciler(pool);
    console.log(JSON.stringify({ mode, outbox: out, reconciler: recon }));
  } else {
    console.error(`unknown mode: ${mode}`);
    process.exit(1);
  }
  await pool.end();
})();
```

- [ ] **Step 5: Add the CronJob manifest**

```yaml
# k3d/cronjob-systemtest-cleanup.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: systemtest-cleanup
  namespace: workspace
spec:
  schedule: "0 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: systemtest-cleanup
            image: registry.local/website:latest
            workingDir: /app/website
            command: ["node", "scripts/systemtest-job.js", "cleanup-fixtures"]
            envFrom:
            - secretRef: { name: workspace-secrets }
            - configMapRef: { name: domains-config }
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: systemtest-outbox
  namespace: workspace
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: systemtest-outbox
            image: registry.local/website:latest
            workingDir: /app/website
            command: ["node", "scripts/systemtest-job.js", "drain-outbox"]
            envFrom:
            - secretRef: { name: workspace-secrets }
            - configMapRef: { name: domains-config }
```

Add to `k3d/kustomization.yaml`:

```yaml
resources:
  # ... existing entries ...
  - cronjob-systemtest-cleanup.yaml
```

- [ ] **Step 6: Run tests + validate**

```bash
cd website && pnpm vitest run src/lib/systemtest/cleanup.test.ts
cd .. && task workspace:validate
```

Expected: PASS, kustomize dry-run clean.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/systemtest/cleanup.ts \
        website/src/lib/systemtest/cleanup.test.ts \
        website/scripts/systemtest-job.ts \
        k3d/cronjob-systemtest-cleanup.yaml \
        k3d/kustomization.yaml
git commit -m "feat(systemtest): cleanup + outbox-drain CronJobs"
```

---

## Task 9: Tester-facing copy + sticky panel

**Files:**
- Modify: `website/src/pages/admin/fragebogen/[assignmentId].astro`
- Modify: `website/src/lib/questionnaire-db.ts`

- [ ] **Step 1: Add the sticky guidance panel for system-test templates**

In `[assignmentId].astro`, find where the page renders the assignment header. Add (conditionally, only when `template.is_system_test === true`):

```astro
{template.is_system_test && (
  <aside class="systemtest-guidance">
    <strong>Wenn dir etwas auffällt — auch nur tangential — schreib es auf.</strong>
    <p>
      Verwirrung ist Signal. Lieber eine geschwätzige <code>teilweise</code>-Notiz mit
      Fragezeichen als ein sauberes <code>erfüllt</code>, das einen echten Defekt versteckt.
    </p>
    <p>
      <em>AI-Tester:</em> dasselbe gilt für dich. Wenn etwas anders aussieht als erwartet
      und das Testskript es nicht abdeckt, dokumentiere es im Notizfeld. Wenn dich eine
      Fehlermeldung verwirrt, beschreibe was verwirrend war. Halte dich nicht zurück.
    </p>
  </aside>
)}

<style>
  .systemtest-guidance {
    position: sticky; top: 0; z-index: 10;
    background: rgba(192, 133, 82, 0.1);
    border-left: 3px solid var(--brass, #c08552);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    border-radius: 0 4px 4px 0;
  }
</style>
```

- [ ] **Step 2: Set default `instructions` text on system-test templates**

In `website/src/lib/questionnaire-db.ts`, find the function that creates new templates (search for `INSERT INTO questionnaire_templates`). When `is_system_test=true` and no `instructions` was passed, default to:

```ts
const SYSTEM_TEST_DEFAULT_INSTRUCTIONS = `
Wenn dir etwas auffällt — auch nur tangential — schreib es auf.
Verwirrung ist Signal. Lieber eine geschwätzige \`teilweise\`-Notiz mit
Fragezeichen als ein sauberes \`erfüllt\`, das einen echten Defekt versteckt.

AI-Tester: dasselbe gilt für dich. Wenn etwas anders aussieht als erwartet,
das Testskript es aber nicht abdeckt, dokumentiere es im Notizfeld. Wenn
dich eine Fehlermeldung verwirrt, beschreibe was verwirrend war. Halte dich
nicht zurück.
`.trim();
```

- [ ] **Step 3: Manual visual check**

Run: `cd website && pnpm dev` and load `http://localhost:4321/admin/fragebogen/<some-system-test-assignment>` to verify the sticky panel renders, the spec language is correct, and the panel doesn't cover the question content.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/fragebogen/[assignmentId].astro \
        website/src/lib/questionnaire-db.ts
git commit -m "feat(systemtest): tester-facing guidance copy + sticky panel for AI testers"
```

---

## Task 10: Feature flag, manual rollout checklist, and Keycloak orphan cleanup

**Files:**
- Create: `website/src/lib/systemtest/feature-flag.ts`
- Modify: `website/src/lib/systemtest/cleanup.ts` (wire Keycloak deletion)
- Modify: `website/src/pages/admin/fragebogen/[assignmentId].astro` (gate `[Seed]` + recorder)
- Modify: `website/src/pages/admin/systemtest/board.astro` (gate page render)

- [ ] **Step 1: Add the feature flag**

```ts
// website/src/lib/systemtest/feature-flag.ts
export function isSystemtestLoopEnabled(): boolean {
  return process.env.SYSTEMTEST_LOOP_ENABLED === 'true';
}
```

- [ ] **Step 2: Gate the seed button and recorder**

In `[assignmentId].astro`, wrap the `[Seed test data]` button render and the recorder boot in `{isSystemtestLoopEnabled() && (...)}`.

- [ ] **Step 3: Gate the kanban page**

At the top of `board.astro`:

```astro
---
import { isSystemtestLoopEnabled } from '../../../lib/systemtest/feature-flag';
if (!isSystemtestLoopEnabled()) {
  return Astro.redirect('/admin?msg=systemtest-loop-disabled');
}
---
```

- [ ] **Step 4: Wire Keycloak orphan deletion in cleanup**

Modify `purgeFixturesFor` in `cleanup.ts`: when `row.table_name === 'auth.users'`, after the DB row is deleted (or if the row was already gone), call `kcAdmin().deleteUser(row.row_id)`. Wrap in a try/catch that records `purge_error` but doesn't fail the whole job.

- [ ] **Step 5: Run the manual rollout checklist (one-off, document outcomes in commit message)**

For each cluster (mentolder, korczewski):
1. Set `SYSTEMTEST_LOOP_ENABLED=false` in `environments/<env>.yaml` first; deploy.
2. Run `task website:deploy ENV=<env>` and verify the existing flow doesn't regress.
3. Flip `SYSTEMTEST_LOOP_ENABLED=true`; redeploy.
4. Verify magic-link redeem works in incognito + non-incognito.
5. Verify rrweb playback renders a 5-min recording without lag.
6. Trigger cleanup cron manually (`kubectl create job --from=cronjob/systemtest-cleanup test-run -n workspace`) and verify a known fixture is purged.
7. Run a real failed system-test step and verify a ticket appears in `/admin/tickets` AND on `/admin/systemtest/board`.
8. Mark the ticket `resolution='fixed'` and verify the kanban moves the card to `Retest pending`.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/systemtest/cleanup.ts \
        website/src/lib/systemtest/feature-flag.ts \
        website/src/pages/admin/fragebogen/[assignmentId].astro \
        website/src/pages/admin/systemtest/board.astro
git commit -m "feat(systemtest): SYSTEMTEST_LOOP_ENABLED feature flag + Keycloak orphan cleanup"
```

- [ ] **Step 7: Roll out**

After mentolder and korczewski are both green on the manual checklist with the flag flipped on, fire `task feature:website` to ensure both clusters are running the same build.

---

## Self-review notes

**Spec coverage:** §1–11 are all covered. §3 architecture in plan header; §4 data model in Tasks 1+2; §5.1–5.3 in Tasks 3–4; §5.4–5.5 in Tasks 5–6; §5.6 in Task 7; §5.7 in Task 8; §6 in Task 9; §8 error handling distributed across Tasks 3 (recorder retry), 4 (transaction rollback), 5 (outbox), 6 (reconciler), 8 (purge fail-soft); §9 testing scaffolding in every task; §10 phases map directly to Task numbering plus Task 10's feature flag.

**Open questions from spec §11:**
- Keycloak action-token vs homegrown table — left to Task 4 implementation time (engineer decides based on Keycloak server capability check).
- Green-tail length — defaulted to 7 days inline in the view (Task 1).
- Retest preserves vs clears `details_text` — preserved by default (failure-bridge in Task 5 doesn't clear it; the answer-save path on retest writes a new `questionnaire_test_status` row but the prior answer's `details_text` is unaffected).

**Known gap:** Task 7's E2E test (FA-30) presumes a fixture API for setting up a system-test assignment. If `tests/e2e/` doesn't already have such a helper, the engineer may need to build one or run FA-30 against a manually-seeded assignment for the first iteration. Not a blocker.

**Type consistency check:** `SeedFn`, `SeedContext`, `SeedResult`, `KeycloakAdminClient` defined once in `seed-context.ts` and reused across Tasks 4, 5, 8, 10. `openFailureTicket(pool, opts)` signature stable across Tasks 5 and 8. `runReconciler(pool)`, `purgeFixturesFor(pool, opts)`, `drainOutbox(pool)` consistent. `ensureSystemtestSchema(pool)` callable from tests, the bootstrap, and is idempotent.
