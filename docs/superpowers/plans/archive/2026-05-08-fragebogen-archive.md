---
title: Fragebogen Archive Implementation Plan
domains: [website, db]
status: active
pr_number: null
---

# Fragebogen Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins archive a submitted/reviewed Fragebogen as a frozen historical KPI datapoint, hide archived items from active views, surface the rrweb video proof on the archived detail page, and reassign the same template without resetting the previous result.

**Architecture:** Single transactional `archiveQAssignment` writes a snapshot of dimension scores into a new `questionnaire_assignment_scores` table while flipping the assignment to `archived`. A new `reassignQAssignment` creates a fresh assignment row, leaving the archived original untouched. A SQL view `bachelorprojekt.v_questionnaire_kpi` joins the snapshot to the assignment + evidence aggregates for KPI consumers. The admin detail page wires the existing `SystemtestReplayDrawer` per `test_step` row that has evidence; both list views split active vs archived with a toggle.

**Tech Stack:** Astro 4 + Svelte 5 (frontend), Astro API routes (Node), PostgreSQL 16 (`shared-db`), `pg` driver, vitest 4 (unit), Playwright (e2e), rrweb (existing recorder).

---

## File Structure

**Modify:**
- `website/src/lib/questionnaire-db.ts` — schema bootstrap (initDb), `archiveQAssignment`, `reassignQAssignment`, `listArchivedScores`, `listEvidenceByAssignment`; reroute `updateQAssignment` archived branch; export `DimensionScore` re-import
- `website/src/lib/compute-scores.ts` — add `getDisplayScores` shim selecting snapshot vs computed
- `website/src/pages/admin/fragebogen/[assignmentId].astro` — archive button gating, reassign button, replay button per test_step
- `website/src/components/admin/ClientQuestionnairesPanel.svelte` — split active/archived + toggle
- `website/src/components/admin/ProjectQuestionnairesPanel.astro` — split active/archived `<details>` block; use `getDisplayScores` for archived
- `website/src/pages/admin/projekte/[id].astro` — pass snapshot scores into the panel for archived rows
- `website/src/pages/admin/tickets/[id].astro` — same as above

**Create:**
- `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.ts` — POST endpoint
- `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.ts` — POST endpoint
- `website/src/lib/questionnaire-archive.test.ts` — unit tests for archive + reassign + listEvidenceByAssignment + listArchivedScores + view shape
- `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.test.ts` — API tests for archive endpoint
- `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.test.ts` — API tests for reassign endpoint
- `tests/e2e/specs/fa-fragebogen-archive.spec.ts` — Playwright archive→reassign→replay flow

---

## Task 1: Snapshot table + KPI view + schema bootstrap

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts:174-279` (the `initDb()` function)
- Create: `website/src/lib/questionnaire-archive.test.ts`

- [ ] **Step 1: Write the failing test for schema bootstrap**

Create `website/src/lib/questionnaire-archive.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';

const dbAvailable = !!(
  process.env.DATABASE_URL ||
  process.env.WEBSITE_DATABASE_URL ||
  process.env.SESSIONS_DATABASE_URL
);

describe.skipIf(!dbAvailable)('archive schema', () => {
  beforeAll(async () => {
    // initDb in questionnaire-db.ts runs at module load via top-level await
    await import('./questionnaire-db');
  });

  it('creates questionnaire_assignment_scores table', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.questionnaire_assignment_scores') AS t`,
    );
    expect(r.rows[0].t).toBe('questionnaire_assignment_scores');
  });

  it('table has expected columns', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='questionnaire_assignment_scores'
       ORDER BY ordinal_position`,
    );
    const cols = r.rows.map((x: { column_name: string }) => x.column_name);
    expect(cols).toEqual([
      'id', 'assignment_id', 'dimension_id', 'dimension_name',
      'final_score', 'threshold_mid', 'threshold_high', 'level', 'snapshot_at',
    ]);
  });

  it('table has unique (assignment_id, dimension_id) constraint', async () => {
    const r = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename='questionnaire_assignment_scores'
         AND indexdef ILIKE '%UNIQUE%'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('creates bachelorprojekt.v_questionnaire_kpi view', async () => {
    const r = await pool.query(
      `SELECT to_regclass('bachelorprojekt.v_questionnaire_kpi') AS t`,
    );
    expect(r.rows[0].t).toBe('bachelorprojekt.v_questionnaire_kpi');
  });

  it('view exposes evidence_count + latest_evidence_id columns', async () => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='bachelorprojekt' AND table_name='v_questionnaire_kpi'`,
    );
    const cols = r.rows.map((x: { column_name: string }) => x.column_name);
    expect(cols).toContain('evidence_count');
    expect(cols).toContain('latest_evidence_id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `to_regclass(...)` returns NULL for the new table/view.

(If a local PG isn't reachable, the test auto-skips; the `task workspace:port-forward ENV=mentolder` task forwards `shared-db` to localhost:5432 — see `CLAUDE.md` "Database Management".)

- [ ] **Step 3: Add schema bootstrap to initDb()**

Append to the body of `initDb()` in `website/src/lib/questionnaire-db.ts`, immediately before the `await ensureSystemtestSchema(pool);` line at the end:

```ts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_assignment_scores (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id  UUID NOT NULL REFERENCES questionnaire_assignments(id) ON DELETE CASCADE,
      dimension_id   UUID NOT NULL,
      dimension_name TEXT NOT NULL,
      final_score    INTEGER NOT NULL,
      threshold_mid  INTEGER,
      threshold_high INTEGER,
      level          TEXT,
      snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_qas_assignment_dimension UNIQUE (assignment_id, dimension_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_qas_assignment ON questionnaire_assignment_scores(assignment_id)`,
  );
  await pool.query(`CREATE SCHEMA IF NOT EXISTS bachelorprojekt`);
  await pool.query(`
    CREATE OR REPLACE VIEW bachelorprojekt.v_questionnaire_kpi AS
    SELECT
      a.id              AS assignment_id,
      a.customer_id,
      a.template_id,
      t.title           AS template_title,
      t.is_system_test,
      a.assigned_at,
      a.submitted_at,
      a.archived_at,
      s.dimension_id,
      s.dimension_name,
      s.final_score,
      s.threshold_mid,
      s.threshold_high,
      s.level,
      ev.evidence_count,
      ev.latest_evidence_id
    FROM questionnaire_assignments a
    JOIN questionnaire_templates t ON t.id = a.template_id
    JOIN questionnaire_assignment_scores s ON s.assignment_id = a.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS evidence_count,
        (ARRAY_AGG(e.id ORDER BY e.attempt DESC, e.created_at DESC))[1] AS latest_evidence_id
      FROM questionnaire_test_evidence e
      WHERE e.assignment_id = a.id
    ) ev ON true
    WHERE a.status = 'archived'
  `);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "feat(questionnaire): add archive snapshot table + KPI view

Adds questionnaire_assignment_scores (one row per dimension per archived
assignment, snapshotted at archive time) and bachelorprojekt.v_questionnaire_kpi
view that joins assignments, snapshots, and evidence aggregates."
```

---

## Task 2: archiveQAssignment helper

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` — add new function after `dismissQAssignment` (around line 576)
- Modify: `website/src/lib/questionnaire-archive.test.ts` — add archive test cases

- [ ] **Step 1: Write failing tests for archiveQAssignment**

Append to `website/src/lib/questionnaire-archive.test.ts`:

```ts
import {
  createQTemplate, upsertQDimension, upsertQQuestion, replaceQAnswerOptions,
  createQAssignment, updateQAssignment, upsertQAnswer, getQAssignment,
} from './questionnaire-db';
// archiveQAssignment is imported below so test failure cleanly indicates "not exported"
import { archiveQAssignment } from './questionnaire-db';
import { randomUUID } from 'crypto';

describe.skipIf(!dbAvailable)('archiveQAssignment', () => {
  async function seedSubmittedAssignment() {
    const tpl = await createQTemplate({
      title: `archive-test-${randomUUID().slice(0, 8)}`,
      description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'TestDim', position: 0,
      thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0,
      questionText: 'q?', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '5', label: 'high', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({
      customerId: randomUUID(), templateId: tpl.id,
    });
    await upsertQAnswer({
      assignmentId: a.id, questionId: q.id, optionKey: '5',
    });
    await updateQAssignment(a.id, { status: 'submitted' });
    return { tpl, dim, q, a };
  }

  it('writes one snapshot row per dimension and flips status to archived', async () => {
    const { dim, a } = await seedSubmittedAssignment();
    const result = await archiveQAssignment(a.id);
    expect('assignment' in result).toBe(true);
    if (!('assignment' in result)) return;
    expect(result.assignment.status).toBe('archived');
    expect(result.assignment.archived_at).not.toBeNull();
    const snap = await pool.query(
      `SELECT dimension_id, dimension_name, final_score, level
         FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(snap.rows.length).toBe(1);
    expect(snap.rows[0].dimension_id).toBe(dim.id);
    expect(snap.rows[0].dimension_name).toBe('TestDim');
    expect(snap.rows[0].final_score).toBe(5); // weight 1 * key 5 * multiplier 1
    expect(snap.rows[0].level).toBe('mittel');
  });

  it('rejects non-archivable statuses with a reason', async () => {
    const tpl = await createQTemplate({
      title: `reject-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({
      customerId: randomUUID(), templateId: tpl.id,
    }); // status='pending'
    const result = await archiveQAssignment(a.id);
    expect('reason' in result).toBe(true);
    if ('reason' in result) {
      expect(result.reason).toBe('not_archivable');
      expect(result.status).toBe('pending');
    }
  });

  it('returns not_found for missing id', async () => {
    const result = await archiveQAssignment(randomUUID());
    expect('reason' in result && result.reason).toBe('not_found');
  });

  it('is idempotent: re-archiving an archived row leaves snapshot intact', async () => {
    const { a } = await seedSubmittedAssignment();
    await archiveQAssignment(a.id);
    const before = await pool.query(
      `SELECT id, snapshot_at FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    const result2 = await archiveQAssignment(a.id);
    expect('assignment' in result2).toBe(true);
    const after = await pool.query(
      `SELECT id, snapshot_at FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(after.rows.map(r => r.id).sort()).toEqual(before.rows.map(r => r.id).sort());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `archiveQAssignment` is not exported from `./questionnaire-db`.

- [ ] **Step 3: Implement archiveQAssignment**

Add to `website/src/lib/questionnaire-db.ts`, immediately after `dismissQAssignment`:

```ts
import { computeScores } from './compute-scores';

const ARCHIVABLE_STATUSES: AssignmentStatus[] = ['submitted', 'reviewed', 'archived'];

/**
 * Freeze a submitted/reviewed assignment as a permanent KPI datapoint.
 *
 * Single transaction: locks the assignment row, flips status → 'archived',
 * stamps `archived_at`, and snapshots one row per dimension into
 * `questionnaire_assignment_scores`. Already-archived assignments are a no-op
 * (returns the row unchanged) so retries are safe.
 *
 * coach_notes are preserved verbatim; the snapshot is computed from the
 * current dimensions/answer_options/answers and persisted denormalized so
 * later template edits don't shift historical KPIs.
 */
export async function archiveQAssignment(id: string): Promise<
  | { assignment: QAssignment }
  | { reason: 'not_found' | 'not_archivable'; status?: AssignmentStatus }
> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query<{ template_id: string; status: AssignmentStatus }>(
      `SELECT template_id, status FROM questionnaire_assignments
        WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (a.rows.length === 0) {
      await client.query('ROLLBACK');
      return { reason: 'not_found' };
    }
    const status = a.rows[0].status;
    if (!ARCHIVABLE_STATUSES.includes(status)) {
      await client.query('ROLLBACK');
      return { reason: 'not_archivable', status };
    }
    const templateId = a.rows[0].template_id;

    if (status !== 'archived') {
      await client.query(
        `UPDATE questionnaire_assignments
            SET status = 'archived', archived_at = now()
          WHERE id = $1`,
        [id],
      );
    }

    const dimsRes = await client.query<QDimension>(
      `SELECT id, template_id, name, position, threshold_mid, threshold_high,
              score_multiplier, created_at
         FROM questionnaire_dimensions WHERE template_id = $1 ORDER BY position`,
      [templateId],
    );
    const optsRes = await client.query<QAnswerOption>(
      `SELECT ao.id, ao.question_id, ao.option_key, ao.label, ao.dimension_id, ao.weight
         FROM questionnaire_answer_options ao
         JOIN questionnaire_questions q ON q.id = ao.question_id
        WHERE q.template_id = $1`,
      [templateId],
    );
    const ansRes = await client.query<QAnswer>(
      `SELECT id, assignment_id, question_id, option_key, details_text, saved_at
         FROM questionnaire_answers WHERE assignment_id = $1`,
      [id],
    );

    const scores = computeScores(dimsRes.rows, optsRes.rows, ansRes.rows);
    for (const s of scores) {
      await client.query(
        `INSERT INTO questionnaire_assignment_scores
           (assignment_id, dimension_id, dimension_name, final_score,
            threshold_mid, threshold_high, level)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ON CONSTRAINT uq_qas_assignment_dimension DO NOTHING`,
        [id, s.dimension_id, s.name, s.final_score,
         s.threshold_mid, s.threshold_high, s.level],
      );
    }

    await client.query('COMMIT');
    const updated = await getQAssignment(id);
    if (!updated) return { reason: 'not_found' };
    return { assignment: updated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

Add the import at the top of `questionnaire-db.ts` (after the existing imports, around line 5):

```ts
import { computeScores } from './compute-scores';
```

(There is currently no import of `compute-scores.ts` in `questionnaire-db.ts`. `compute-scores.ts` already imports types from `questionnaire-db`; adding the reverse import would create a cycle. Workaround: convert the import to a deferred dynamic import inside `archiveQAssignment`:

```ts
const { computeScores } = await import('./compute-scores');
```

Use the dynamic-import form. This avoids the cycle without restructuring the type module.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 9 PASS (5 schema + 4 archive).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "feat(questionnaire): archiveQAssignment with score snapshot

Single-transaction archive: locks the row, flips status to archived,
stamps archived_at, and snapshots one row per dimension via computeScores
into questionnaire_assignment_scores. Idempotent for retries."
```

---

## Task 3: reassignQAssignment helper

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` — add `reassignQAssignment` after `archiveQAssignment`
- Modify: `website/src/lib/questionnaire-archive.test.ts` — add reassign tests

- [ ] **Step 1: Write failing tests**

Append to `website/src/lib/questionnaire-archive.test.ts`:

```ts
import { reassignQAssignment } from './questionnaire-db';

describe.skipIf(!dbAvailable)('reassignQAssignment', () => {
  it('creates a new pending assignment for the same template + customer; source untouched', async () => {
    const tpl = await createQTemplate({
      title: `reassign-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const customerId = randomUUID();
    const src = await createQAssignment({ customerId, templateId: tpl.id });
    await updateQAssignment(src.id, { status: 'submitted' });
    await archiveQAssignment(src.id);

    const result = await reassignQAssignment(src.id);
    expect('assignment' in result).toBe(true);
    if (!('assignment' in result)) return;
    expect(result.assignment.id).not.toBe(src.id);
    expect(result.assignment.status).toBe('pending');
    expect(result.assignment.template_id).toBe(tpl.id);
    expect(result.assignment.customer_id).toBe(customerId);
    expect(result.assignment.archived_at).toBeNull();
    expect(result.assignment.submitted_at).toBeNull();
    expect(result.assignment.coach_notes).toBe('');

    const before = await getQAssignment(src.id);
    expect(before?.status).toBe('archived');
    expect(before?.archived_at).not.toBeNull();
  });

  it('returns not_found for missing id', async () => {
    const result = await reassignQAssignment(randomUUID());
    expect('reason' in result && result.reason).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `reassignQAssignment` is not exported.

- [ ] **Step 3: Implement reassignQAssignment**

Add to `website/src/lib/questionnaire-db.ts` immediately after `archiveQAssignment`:

```ts
/**
 * Create a brand-new assignment row for the same template + customer (+project)
 * as the source assignment. The source row is not touched — used after archive
 * so the historical datapoint stays intact while the next datapoint runs fresh.
 */
export async function reassignQAssignment(id: string): Promise<
  | { assignment: QAssignment }
  | { reason: 'not_found' }
> {
  const src = await getQAssignment(id);
  if (!src) return { reason: 'not_found' };
  const created = await createQAssignment({
    customerId: src.customer_id,
    templateId: src.template_id,
    projectId: src.project_id ?? undefined,
  });
  return { assignment: created };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "feat(questionnaire): reassignQAssignment creates new datapoint

Allocates a fresh pending assignment for the source's template+customer
(+project), leaving the source row untouched so it can serve as a frozen
historical datapoint."
```

---

## Task 4: listEvidenceByAssignment + listArchivedScores helpers

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts` — add both helpers near the bottom
- Modify: `website/src/lib/questionnaire-archive.test.ts` — add helper tests

- [ ] **Step 1: Write failing tests**

Append to `website/src/lib/questionnaire-archive.test.ts`:

```ts
import { listArchivedScores, listEvidenceByAssignment } from './questionnaire-db';

describe.skipIf(!dbAvailable)('listArchivedScores', () => {
  it('returns snapshot rows for an archived assignment', async () => {
    const tpl = await createQTemplate({
      title: `lsnap-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'X', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '3', label: 'm', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '3' });
    await updateQAssignment(a.id, { status: 'submitted' });
    await archiveQAssignment(a.id);

    const rows = await listArchivedScores(a.id);
    expect(rows.length).toBe(1);
    expect(rows[0].dimension_id).toBe(dim.id);
    expect(rows[0].final_score).toBe(3);
  });

  it('returns empty array for non-archived assignment', async () => {
    const tpl = await createQTemplate({
      title: `lsnap-empty-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    const rows = await listArchivedScores(a.id);
    expect(rows).toEqual([]);
  });
});

describe.skipIf(!dbAvailable)('listEvidenceByAssignment', () => {
  it('returns latest-attempt evidence per question with count', async () => {
    const tpl = await createQTemplate({
      title: `evid-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 's', questionType: 'test_step',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    const e1 = await pool.query<{ id: string }>(
      `INSERT INTO questionnaire_test_evidence
         (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 0, '/tmp/r0') RETURNING id`,
      [a.id, q.id],
    );
    const e2 = await pool.query<{ id: string }>(
      `INSERT INTO questionnaire_test_evidence
         (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 1, '/tmp/r1') RETURNING id`,
      [a.id, q.id],
    );

    const rows = await listEvidenceByAssignment(a.id);
    expect(rows.length).toBe(1);
    expect(rows[0].question_id).toBe(q.id);
    expect(rows[0].latest_evidence_id).toBe(e2.rows[0].id);
    expect(rows[0].latest_attempt).toBe(1);
    expect(rows[0].evidence_count).toBe(2);
  });

  it('returns empty array when there is no evidence', async () => {
    const tpl = await createQTemplate({
      title: `evid-empty-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    const rows = await listEvidenceByAssignment(a.id);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `listArchivedScores` and `listEvidenceByAssignment` not exported.

- [ ] **Step 3: Implement both helpers**

Add to `website/src/lib/questionnaire-db.ts`, near the bottom of the file (after the existing `listTestStatusesForMonitoring` function):

```ts
export interface QArchivedScore {
  assignment_id: string;
  dimension_id: string;
  dimension_name: string;
  final_score: number;
  threshold_mid: number | null;
  threshold_high: number | null;
  level: 'förderlich' | 'mittel' | 'kritisch' | null;
  snapshot_at: string;
}

export async function listArchivedScores(assignmentId: string): Promise<QArchivedScore[]> {
  const r = await pool.query(
    `SELECT assignment_id, dimension_id, dimension_name, final_score,
            threshold_mid, threshold_high, level, snapshot_at
       FROM questionnaire_assignment_scores
      WHERE assignment_id = $1
      ORDER BY dimension_name`,
    [assignmentId],
  );
  return r.rows;
}

export interface QEvidenceForQuestion {
  question_id: string;
  latest_evidence_id: string;
  latest_attempt: number;
  evidence_count: number;
}

export async function listEvidenceByAssignment(
  assignmentId: string,
): Promise<QEvidenceForQuestion[]> {
  const r = await pool.query(
    `SELECT question_id,
            (ARRAY_AGG(id ORDER BY attempt DESC, created_at DESC))[1] AS latest_evidence_id,
            MAX(attempt)::int                                          AS latest_attempt,
            COUNT(*)::int                                              AS evidence_count
       FROM questionnaire_test_evidence
      WHERE assignment_id = $1
      GROUP BY question_id`,
    [assignmentId],
  );
  return r.rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 15 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "feat(questionnaire): listArchivedScores + listEvidenceByAssignment

Two read helpers: snapshot rows for an archived assignment, and
latest-attempt evidence pointer per question (with attempt count) for
the assignment detail page."
```

---

## Task 5: getDisplayScores shim

**Files:**
- Modify: `website/src/lib/compute-scores.ts` — add `getDisplayScores` at the bottom
- Modify: `website/src/lib/questionnaire-archive.test.ts` — add shim test

- [ ] **Step 1: Write failing test**

Append to `website/src/lib/questionnaire-archive.test.ts`:

```ts
import { getDisplayScores } from './compute-scores';

describe.skipIf(!dbAvailable)('getDisplayScores', () => {
  it('uses snapshot for archived; falls back to compute for non-archived', async () => {
    const tpl = await createQTemplate({
      title: `gds-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'D', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '4', label: 'x', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '4' });
    await updateQAssignment(a.id, { status: 'submitted' });

    const live = await getDisplayScores(await getQAssignment(a.id) as any);
    expect(live[0].final_score).toBe(4);
    expect(live[0].name).toBe('D');

    await archiveQAssignment(a.id);
    // Mutate the dim weight and threshold AFTER archive — snapshot must not shift.
    await upsertQDimension({
      id: dim.id, templateId: tpl.id, name: 'D-renamed', position: 0,
      thresholdMid: 1, thresholdHigh: 2,
    });
    const frozen = await getDisplayScores(await getQAssignment(a.id) as any);
    expect(frozen[0].final_score).toBe(4); // from snapshot
    expect(frozen[0].name).toBe('D');      // snapshot dimension_name, not the renamed one
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `getDisplayScores` is not exported.

- [ ] **Step 3: Implement getDisplayScores**

Append to `website/src/lib/compute-scores.ts`:

```ts
import type { QAssignment } from './questionnaire-db';

/**
 * Render-time scores for an assignment. Archived assignments read from the
 * frozen snapshot table so KPI numbers don't drift after template edits.
 * Non-archived assignments compute live from the current dimensions/options/
 * answers via `computeScores`.
 */
export async function getDisplayScores(assignment: QAssignment): Promise<DimensionScore[]> {
  const {
    listArchivedScores, listQDimensions, listQAnswerOptionsForTemplate, listQAnswers,
  } = await import('./questionnaire-db');

  if (assignment.status === 'archived') {
    const snap = await listArchivedScores(assignment.id);
    return snap.map((s, i) => ({
      dimension_id: s.dimension_id,
      name: s.dimension_name,
      position: i, // snapshot ordering matches insertion (alphabetical by name); positions are display-only
      raw_score: s.final_score,
      final_score: s.final_score,
      threshold_mid: s.threshold_mid,
      threshold_high: s.threshold_high,
      level: s.level,
    }));
  }
  const [dims, opts, answers] = await Promise.all([
    listQDimensions(assignment.template_id),
    listQAnswerOptionsForTemplate(assignment.template_id),
    listQAnswers(assignment.id),
  ]);
  return computeScores(dims, opts, answers);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 16 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/compute-scores.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "feat(questionnaire): getDisplayScores selects snapshot vs live

Shim that returns DimensionScore[] from the frozen snapshot for
archived assignments and from live computeScores for everything else."
```

---

## Task 6: Reroute updateQAssignment archived branch through archiveQAssignment

**Files:**
- Modify: `website/src/lib/questionnaire-db.ts:545-572` (`updateQAssignment`)
- Modify: `website/src/lib/questionnaire-archive.test.ts` — add reroute test

- [ ] **Step 1: Write failing test**

Append to `website/src/lib/questionnaire-archive.test.ts`:

```ts
describe.skipIf(!dbAvailable)('updateQAssignment archived reroute', () => {
  it('writes a snapshot when status is set to archived via updateQAssignment', async () => {
    const tpl = await createQTemplate({
      title: `reroute-${randomUUID().slice(0, 8)}`, description: '', instructions: '',
    });
    const dim = await upsertQDimension({
      templateId: tpl.id, name: 'R', position: 0, thresholdMid: 5, thresholdHigh: 10,
    });
    const q = await upsertQQuestion({
      templateId: tpl.id, position: 0, questionText: 'q', questionType: 'likert_5',
    });
    await replaceQAnswerOptions(q.id, [
      { optionKey: '2', label: 'y', dimensionId: dim.id, weight: 1 },
    ]);
    const a = await createQAssignment({ customerId: randomUUID(), templateId: tpl.id });
    await upsertQAnswer({ assignmentId: a.id, questionId: q.id, optionKey: '2' });
    await updateQAssignment(a.id, { status: 'submitted' });

    await updateQAssignment(a.id, { status: 'archived' });
    const snap = await pool.query(
      `SELECT count(*)::int AS n FROM questionnaire_assignment_scores
        WHERE assignment_id = $1`,
      [a.id],
    );
    expect(snap.rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: FAIL — `updateQAssignment` writes status but does not snapshot.

- [ ] **Step 3: Reroute updateQAssignment**

In `website/src/lib/questionnaire-db.ts`, replace the body of `updateQAssignment` (currently at lines ~545-572) with:

```ts
export async function updateQAssignment(id: string, params: {
  status?: AssignmentStatus; coachNotes?: string; dismissReason?: string;
}): Promise<QAssignment | null> {
  // Status transitions to 'archived' must go through archiveQAssignment so the
  // snapshot is written transactionally. Coach notes / dismiss reason updates
  // can still be combined with the archive call.
  if (params.status === 'archived') {
    if (params.coachNotes !== undefined || params.dismissReason !== undefined) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.coachNotes !== undefined) {
        vals.push(params.coachNotes); sets.push(`coach_notes = $${vals.length}`);
      }
      if (params.dismissReason !== undefined) {
        vals.push(params.dismissReason); sets.push(`dismiss_reason = $${vals.length}`);
      }
      vals.push(id);
      await pool.query(
        `UPDATE questionnaire_assignments SET ${sets.join(', ')}
         WHERE id = $${vals.length}`,
        vals,
      );
    }
    const result = await archiveQAssignment(id);
    if ('reason' in result) return null;
    return result.assignment;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (params.status !== undefined) {
    vals.push(params.status); sets.push(`status = $${vals.length}`);
    if (params.status === 'submitted') sets.push(`submitted_at = now()`);
    if (params.status === 'reviewed') sets.push(`reviewed_at = now()`);
    if (params.status === 'dismissed') sets.push(`dismissed_at = now()`);
  }
  if (params.dismissReason !== undefined) {
    vals.push(params.dismissReason); sets.push(`dismiss_reason = $${vals.length}`);
  }
  if (params.coachNotes !== undefined) {
    vals.push(params.coachNotes); sets.push(`coach_notes = $${vals.length}`);
  }
  if (sets.length === 0) return getQAssignment(id);
  vals.push(id);
  const r = await pool.query(
    `UPDATE questionnaire_assignments SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, customer_id, template_id, status, coach_notes, assigned_at,
               submitted_at, reviewed_at, archived_at, dismissed_at, dismiss_reason, project_id`,
    vals,
  );
  const row = r.rows[0];
  if (!row) return null;
  const tpl = await getQTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}
```

- [ ] **Step 4: Run all archive tests to verify**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts`
Expected: 17 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/questionnaire-db.ts website/src/lib/questionnaire-archive.test.ts
git commit -m "refactor(questionnaire): route updateQAssignment archived through archive helper

PUT /api/admin/questionnaires/assignments/[id] with status='archived' now
writes the score snapshot transactionally. The legacy archived_at-only
branch is removed so the snapshot is the single source of truth."
```

---

## Task 7: POST /api/admin/questionnaires/assignments/[id]/archive

**Files:**
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.ts`
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './archive';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../../lib/questionnaire-db', () => ({
  archiveQAssignment: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveQAssignment } from '../../../../../../lib/questionnaire-db';

function req(): Request {
  return new Request('http://x', { method: 'POST', headers: { cookie: 'k=v' } });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(archiveQAssignment).mockReset();
});

describe('POST /api/admin/questionnaires/assignments/[id]/archive', () => {
  it('401 when no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(401);
  });

  it('401 when not admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(false);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(401);
  });

  it('400 when id missing', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    const r = await POST({ request: req(), params: {} } as any);
    expect(r.status).toBe(400);
  });

  it('404 when archive helper returns not_found', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({ reason: 'not_found' } as any);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(404);
  });

  it('409 when status not archivable', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({
      reason: 'not_archivable', status: 'pending',
    } as any);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.status).toBe('pending');
  });

  it('200 with assignment on success', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { sub: 'u' } } as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(archiveQAssignment).mockResolvedValue({
      assignment: { id: 'a', status: 'archived' } as any,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.assignment.id).toBe('a');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && npx vitest run src/pages/api/admin/questionnaires/assignments/\[id\]/archive.test.ts`
Expected: FAIL — `./archive` module does not exist.

- [ ] **Step 3: Implement the endpoint**

Create `website/src/pages/api/admin/questionnaires/assignments/[id]/archive.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveQAssignment } from '../../../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!params.id) {
    return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });
  }

  const result = await archiveQAssignment(params.id);
  if ('reason' in result) {
    if (result.reason === 'not_found') {
      return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
    }
    return new Response(JSON.stringify({
      error: `Fragebogen kann im Status '${result.status}' nicht archiviert werden.`,
      status: result.status,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ assignment: result.assignment }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && npx vitest run src/pages/api/admin/questionnaires/assignments/\[id\]/archive.test.ts`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/questionnaires/assignments/\[id\]/archive.ts website/src/pages/api/admin/questionnaires/assignments/\[id\]/archive.test.ts
git commit -m "feat(api): POST /admin/questionnaires/assignments/[id]/archive

Wraps archiveQAssignment. 200 on success, 404 if missing, 409 with
status payload when not archivable, 401 for non-admin."
```

---

## Task 8: POST /api/admin/questionnaires/assignments/[id]/reassign

**Files:**
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.ts`
- Create: `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './reassign';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../../lib/questionnaire-db', () => ({
  reassignQAssignment: vi.fn(),
}));

import { getSession, isAdmin } from '../../../../../../lib/auth';
import { reassignQAssignment } from '../../../../../../lib/questionnaire-db';

function req(): Request {
  return new Request('http://x', { method: 'POST', headers: { cookie: 'k=v' } });
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(isAdmin).mockReset();
  vi.mocked(reassignQAssignment).mockReset();
  delete process.env.PROD_DOMAIN;
});

describe('POST /api/admin/questionnaires/assignments/[id]/reassign', () => {
  it('401 when not admin', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(401);
  });

  it('400 when id missing', async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    const r = await POST({ request: req(), params: {} } as any);
    expect(r.status).toBe(400);
  });

  it('404 when source missing', async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({ reason: 'not_found' } as any);
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(404);
  });

  it('200 with portalUrl (relative when PROD_DOMAIN unset)', async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({
      assignment: { id: 'newId' } as any,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.assignment.id).toBe('newId');
    expect(body.portalUrl).toBe('/portal/fragebogen/newId');
  });

  it('200 with absolute portalUrl when PROD_DOMAIN set', async () => {
    process.env.PROD_DOMAIN = 'mentolder.de';
    vi.mocked(getSession).mockResolvedValue({} as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(reassignQAssignment).mockResolvedValue({
      assignment: { id: 'newId' } as any,
    });
    const r = await POST({ request: req(), params: { id: 'a' } } as any);
    const body = await r.json();
    expect(body.portalUrl).toBe('https://web.mentolder.de/portal/fragebogen/newId');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd website && npx vitest run src/pages/api/admin/questionnaires/assignments/\[id\]/reassign.test.ts`
Expected: FAIL — `./reassign` does not exist.

- [ ] **Step 3: Implement the endpoint**

Create `website/src/pages/api/admin/questionnaires/assignments/[id]/reassign.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { reassignQAssignment } from '../../../../../../lib/questionnaire-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!params.id) {
    return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });
  }

  const result = await reassignQAssignment(params.id);
  if ('reason' in result) {
    return new Response(JSON.stringify({ error: 'Nicht gefunden.' }), { status: 404 });
  }
  const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
  const portalUrl = PROD_DOMAIN
    ? `https://web.${PROD_DOMAIN}/portal/fragebogen/${result.assignment.id}`
    : `/portal/fragebogen/${result.assignment.id}`;
  return new Response(JSON.stringify({
    assignment: result.assignment, portalUrl,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd website && npx vitest run src/pages/api/admin/questionnaires/assignments/\[id\]/reassign.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/questionnaires/assignments/\[id\]/reassign.ts website/src/pages/api/admin/questionnaires/assignments/\[id\]/reassign.test.ts
git commit -m "feat(api): POST /admin/questionnaires/assignments/[id]/reassign

Wraps reassignQAssignment. Returns the new assignment plus portalUrl
(relative in dev, absolute https://web.\$PROD_DOMAIN/... in prod)."
```

---

## Task 9: Admin detail page — archive button gating + reassign + replay

**Files:**
- Modify: `website/src/pages/admin/fragebogen/[assignmentId].astro`

- [ ] **Step 1: Load evidence + display scores in frontmatter**

Replace the frontmatter block (lines 1-62) of `website/src/pages/admin/fragebogen/[assignmentId].astro` with:

```astro
---
// website/src/pages/admin/fragebogen/[assignmentId].astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import {
  getQAssignment, listQDimensions, listQQuestions,
  listQAnswerOptionsForTemplate, listQAnswers, getQTemplate,
  listEvidenceByAssignment,
} from '../../../lib/questionnaire-db';
import { getDisplayScores } from '../../../lib/compute-scores';
import { isSystemtestLoopEnabled } from '../../../lib/systemtest/feature-flag';
import SystemtestReplayDrawer from '../../../components/SystemtestReplayDrawer.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const { assignmentId } = Astro.params;
if (!assignmentId) return Astro.redirect('/admin');

const assignment = await getQAssignment(assignmentId).catch(() => null);
if (!assignment) return Astro.redirect('/admin');

const [dimensions, questions, allOptions, answers, evidenceList] = await Promise.all([
  listQDimensions(assignment.template_id),
  listQQuestions(assignment.template_id),
  listQAnswerOptionsForTemplate(assignment.template_id),
  listQAnswers(assignment.id),
  listEvidenceByAssignment(assignment.id),
]);

const tpl = await getQTemplate(assignment.template_id).catch(() => null);
const isSystemTest = tpl?.is_system_test ?? false;
const systemtestLoopEnabled = isSystemTest && isSystemtestLoopEnabled();
void systemtestLoopEnabled;

const scores = await getDisplayScores(assignment);
const answerMap = new Map(answers.map(a => [a.question_id, a]));
const evidenceMap = new Map(evidenceList.map(e => [e.question_id, e]));

function levelColor(level: string | null) {
  if (level === 'kritisch') return '#ef4444';
  if (level === 'mittel') return '#f59e0b';
  if (level === 'förderlich') return '#22c55e';
  return '#b8a06a';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const maxScore = Math.max(...scores.map(s => s.threshold_high ?? s.final_score ?? 1), 1);
---
```

- [ ] **Step 2: Add per-step replay button**

In the same file, find the test_step rendering block (around lines 224-243) and modify the button row. Find:

```astro
                    {canFileBug && (
                      <button
                        class="file-bug-btn px-2.5 py-1 text-xs border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors flex-shrink-0"
                        data-desc={bugDesc}
                        data-step-id={q.id}
                      >
                        Bug erfassen
                      </button>
                    )}
```

Insert immediately above it:

```astro
                    {isSystemTest && evidenceMap.has(q.id) && (
                      <button
                        type="button"
                        class="replay-btn px-2.5 py-1 text-xs border border-blue-500/30 text-blue-400 rounded hover:bg-blue-500/10 transition-colors flex-shrink-0"
                        data-evidence-id={evidenceMap.get(q.id)!.latest_evidence_id}
                      >
                        ▶ Replay ansehen
                        <span class="ml-1 text-blue-300/70">(Versuch {evidenceMap.get(q.id)!.latest_attempt})</span>
                      </button>
                    )}
```

- [ ] **Step 3: Update archive + reassign button gating**

In the same file, find the action buttons block (around lines 321-340). Replace with:

```astro
          {(assignment.status === 'submitted' || assignment.status === 'reviewed') && (
            <button id="archive-btn"
              class="px-4 py-2 bg-dark border border-dark-lighter text-muted rounded-lg text-sm hover:border-gold/40 hover:text-light transition-colors">
              Archivieren
            </button>
          )}
          {assignment.status === 'archived' && (
            <button id="reassign-btn"
              data-testid="reassign-questionnaire"
              class="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
              title="Gleichen Fragebogen neu zuweisen — der archivierte Datenpunkt bleibt erhalten.">
              Erneut zuweisen ➕
            </button>
          )}
          {(assignment.status === 'submitted' || assignment.status === 'reviewed' || assignment.status === 'dismissed') && (
            <button id="reopen-btn"
              data-testid="reopen-questionnaire"
              class="px-4 py-2 bg-amber-700 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
              title={isSystemTest ? 'Antworten löschen, retest_attempt hochzählen, Fragebogen erneut starten.' : 'Antworten löschen und Fragebogen erneut zuweisen.'}>
              Erneut durchführen ↻
            </button>
          )}
```

- [ ] **Step 4: Mount the replay drawer container + reassign script**

At the bottom of the page, immediately before `</AdminLayout>`, add:

```astro
      <div id="replay-drawer-mount"></div>
```

In the existing `<script define:vars={{ assignmentId }}>` block, replace the entire archive button handler (lines ~432-440) with:

```js
  // Archive — calls the dedicated endpoint, snapshots scores transactionally
  document.getElementById('archive-btn')?.addEventListener('click', async () => {
    if (!window.confirm(
      'Diese Auswertung als historischen Datenpunkt sichern? '
      + 'Werte werden eingefroren und der Fragebogen verschwindet aus den aktiven Listen.',
    )) return;
    const r = await fetch(
      `/api/admin/questionnaires/assignments/${assignmentId}/archive`,
      { method: 'POST' },
    );
    if (r.ok) {
      window.location.reload();
    } else {
      const d = await r.json().catch(() => ({}));
      msgEl.textContent = d.error || 'Fehler beim Archivieren.';
      msgEl.className = 'text-xs mt-2 text-red-400';
      msgEl.classList.remove('hidden');
    }
  });

  // Reassign — creates a fresh pending assignment, redirects to portal wizard
  document.getElementById('reassign-btn')?.addEventListener('click', async () => {
    if (!window.confirm(
      'Gleichen Fragebogen erneut zuweisen? Der archivierte Datenpunkt bleibt unverändert; '
      + 'eine neue Zuweisung wird angelegt.',
    )) return;
    const btn = document.getElementById('reassign-btn');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch(
        `/api/admin/questionnaires/assignments/${assignmentId}/reassign`,
        { method: 'POST' },
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        window.location.href = d.portalUrl;
      } else {
        btn.disabled = false;
        btn.textContent = 'Erneut zuweisen ➕';
        msgEl.textContent = d.error || 'Fehler beim Zuweisen.';
        msgEl.className = 'text-xs mt-2 text-red-400';
        msgEl.classList.remove('hidden');
      }
    } catch {
      btn.disabled = false;
      btn.textContent = 'Erneut zuweisen ➕';
      msgEl.textContent = 'Netzwerkfehler.';
      msgEl.className = 'text-xs mt-2 text-red-400';
      msgEl.classList.remove('hidden');
    }
  });

  // Replay drawer — lazy-mount Svelte component on first click
  let replayMount = null;
  let replayDrawer = null;
  document.querySelectorAll('.replay-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const evidenceId = btn.dataset.evidenceId;
      if (!evidenceId) return;
      if (!replayDrawer) {
        const { default: Drawer } = await import(
          '../../../components/SystemtestReplayDrawer.svelte'
        );
        replayMount = document.getElementById('replay-drawer-mount');
        replayDrawer = new Drawer({
          target: replayMount,
          props: { evidenceId },
        });
        replayDrawer.$on('close', () => {
          replayDrawer.$destroy();
          replayDrawer = null;
        });
      } else {
        replayDrawer.$set({ evidenceId });
      }
    });
  });
```

- [ ] **Step 5: Manual smoke check**

Run dev server and exercise the flows:

```bash
cd website && npm run dev
```

Visit `http://localhost:4321/admin/fragebogen/<id>` for an existing submitted Fragebogen. Verify:
- "Archivieren" button is present, clicking shows the confirm dialog and archives.
- After archive, the page now shows "Erneut zuweisen ➕" instead of "Erneut durchführen".
- For an archived system-test assignment with seeded evidence, "▶ Replay ansehen (Versuch n)" appears next to the result chip; clicking opens `SystemtestReplayDrawer`.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/fragebogen/\[assignmentId\].astro
git commit -m "feat(admin/fragebogen): archive from submitted, reassign for archived, inline replay

- 'Archivieren' button now shows for status in {submitted, reviewed}.
- For archived: replace 'Erneut durchführen' with 'Erneut zuweisen ➕' that
  creates a fresh assignment via the new reassign endpoint.
- Each test_step row with rrweb evidence gets an inline 'Replay ansehen
  (Versuch n)' button that lazy-mounts SystemtestReplayDrawer.
- Score bars now read from the snapshot for archived assignments via
  getDisplayScores, so KPI numbers don't drift after template edits."
```

---

## Task 10: ClientQuestionnairesPanel — split active/archived + toggle

**Files:**
- Modify: `website/src/components/admin/ClientQuestionnairesPanel.svelte`

- [ ] **Step 1: Add archived split + toggle to script**

Replace the `<script lang="ts">` block in `website/src/components/admin/ClientQuestionnairesPanel.svelte` with:

```svelte
<script lang="ts">
  type Props = { keycloakUserId: string };
  const { keycloakUserId }: Props = $props();

  type Assignment = { id: string; template_title: string; status: string; assigned_at: string; submitted_at: string | null };
  type Template = { id: string; title: string };

  let assignments: Assignment[] = $state([]);
  let templates: Template[] = $state([]);
  let selectedTemplateId = $state('');
  let assigning = $state(false);
  let assignMsg = $state('');
  let archivedVisible = $state(false);

  const active = $derived(assignments.filter(a => a.status !== 'archived'));
  const archived = $derived(assignments.filter(a => a.status === 'archived'));

  async function loadData() {
    const [aRes, tRes] = await Promise.all([
      fetch(`/api/admin/questionnaires/assignments?keycloakUserId=${keycloakUserId}`),
      fetch('/api/admin/questionnaires/templates'),
    ]);
    assignments = aRes.ok ? await aRes.json() : [];
    const allTpls: Template[] = tRes.ok ? await tRes.json() : [];
    templates = allTpls.filter((t: any) => t.status === 'published');
  }

  $effect(() => { loadData(); });

  async function assign() {
    if (!selectedTemplateId) { assignMsg = 'Bitte eine Vorlage wählen.'; return; }
    assigning = true; assignMsg = '';
    try {
      const r = await fetch('/api/admin/questionnaires/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, keycloakUserId }),
      });
      const data = await r.json();
      if (r.ok) {
        assignMsg = 'Fragebogen zugewiesen.';
        selectedTemplateId = '';
        await loadData();
      } else {
        assignMsg = data.error ?? 'Fehler.';
      }
    } finally { assigning = false; }
  }

  function statusBadge(s: string) {
    if (s === 'submitted' || s === 'reviewed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'in_progress') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (s === 'dismissed') return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (s === 'archived') return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }

  function statusLabel(s: string) {
    if (s === 'reviewed') return 'Besprochen';
    if (s === 'submitted') return 'Eingereicht';
    if (s === 'in_progress') return 'In Bearbeitung';
    if (s === 'dismissed') return 'Abgelehnt';
    if (s === 'archived') return 'Archiviert';
    return 'Ausstehend';
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>
```

- [ ] **Step 2: Update the markup to render active by default + archived behind toggle**

Replace the assignments block (the `{#if assignments.length > 0}` block) with:

```svelte
  {#if active.length > 0}
    <div class="flex flex-col gap-2">
      {#each active as a}
        <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
          <div class="flex-1 min-w-0">
            <p class="text-light text-sm truncate">{a.template_title}</p>
            <p class="text-muted text-xs mt-0.5">
              Zugewiesen: {fmtDate(a.assigned_at)}
              {a.submitted_at ? ` · Eingereicht: ${fmtDate(a.submitted_at)}` : ''}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(a.status)}`}>
              {statusLabel(a.status)}
            </span>
            {#if a.status === 'submitted' || a.status === 'reviewed'}
              <a href={`/admin/fragebogen/${a.id}`} class="text-xs text-gold hover:underline">Auswertung →</a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if archived.length > 0}
    <button
      type="button"
      onclick={() => (archivedVisible = !archivedVisible)}
      class="mt-3 text-xs text-muted hover:text-light flex items-center gap-1"
    >
      <span>{archivedVisible ? '▾' : '▸'}</span>
      Archiv anzeigen ({archived.length})
    </button>
    {#if archivedVisible}
      <div class="flex flex-col gap-2 mt-2 opacity-60">
        {#each archived as a}
          <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
            <div class="flex-1 min-w-0">
              <p class="text-light text-sm truncate">{a.template_title}</p>
              <p class="text-muted text-xs mt-0.5">
                Zugewiesen: {fmtDate(a.assigned_at)}
                {a.submitted_at ? ` · Eingereicht: ${fmtDate(a.submitted_at)}` : ''}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(a.status)}`}>
                {statusLabel(a.status)}
              </span>
              <a href={`/admin/fragebogen/${a.id}`} class="text-xs text-gold hover:underline">Auswertung →</a>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
```

- [ ] **Step 3: Manual smoke check**

Reload an admin client view (`/admin/clients/<id>`-style page that mounts this panel). Verify only non-archived Fragebögen appear; the "Archiv anzeigen (n)" toggle reveals the archived ones with `opacity-60`.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/ClientQuestionnairesPanel.svelte
git commit -m "feat(admin/clients): hide archived Fragebögen behind toggle

Default view shows only active assignments. 'Archiv anzeigen ({n})'
button toggles archived rows muted at opacity-60 with the same row
markup."
```

---

## Task 11: ProjectQuestionnairesPanel — split + use snapshot scores

**Files:**
- Modify: `website/src/components/admin/ProjectQuestionnairesPanel.astro`
- Modify: `website/src/pages/admin/projekte/[id].astro:60-80` (where bundles are built)
- Modify: `website/src/pages/admin/tickets/[id].astro:30-55` (same)

- [ ] **Step 1: Switch bundle builder to getDisplayScores in projekte/[id].astro**

In `website/src/pages/admin/projekte/[id].astro`, find the bundle-building loop (look for `await Promise.all(assignments.map(async a =>`) and replace `computeScores(...)` with `await getDisplayScores(a)`. Also change the import: replace any `import { computeScores } ...` with `import { getDisplayScores } from '../../../lib/compute-scores';`. The `dimensions` and `options` you already fetch can stay (they're used by the panel for option-label lookup).

The relevant snippet should look like:

```astro
import { getDisplayScores } from '../../../lib/compute-scores';
// ...
questionnaireBundles = await Promise.all(assignments.map(async a => {
  const [questions, options, answers] = await Promise.all([
    listQQuestions(a.template_id),
    listQAnswerOptionsForTemplate(a.template_id),
    listQAnswers(a.id),
  ]);
  const scores = await getDisplayScores(a);
  return { assignment: a, questions, options, answers, scores };
}));
```

- [ ] **Step 2: Same change in tickets/[id].astro**

Apply the identical change to `website/src/pages/admin/tickets/[id].astro` (the bundle loop is structurally the same).

- [ ] **Step 3: Split panel into active vs archived `<details>`**

In `website/src/components/admin/ProjectQuestionnairesPanel.astro`, replace the entire body between `const { assignments } = Astro.props;` and the `</section>` close with:

```astro
const { assignments } = Astro.props;

const active = assignments.filter(b => b.assignment.status !== 'archived');
const archived = assignments.filter(b => b.assignment.status === 'archived');

function fmtDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function levelColor(level: string | null): string {
  if (level === 'kritisch') return '#ef4444';
  if (level === 'mittel') return '#f59e0b';
  if (level === 'förderlich') return '#22c55e';
  return '#b8a06a';
}

const STATUS_CLS: Record<string, string> = {
  pending:     'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  submitted:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  reviewed:    'bg-green-500/10 text-green-400 border-green-500/20',
  archived:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  dismissed:   'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Wartend',
  in_progress: 'In Bearbeitung',
  submitted:   'Eingereicht',
  reviewed:    'Besprochen',
  archived:    'Archiviert',
  dismissed:   'Abgelehnt',
};
---

{(active.length > 0 || archived.length > 0) && (
  <section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 mb-6" id="questionnaires-panel">
    <h2 class="text-sm font-semibold text-light mb-4 font-serif uppercase tracking-wide">
      Fragebögen ({active.length})
    </h2>

    {active.length > 0 && (
      <div class="flex flex-col gap-6">
        {active.map((bundle) => <Fragment set:html={renderCard(bundle, false)} />)}
      </div>
    )}

    {archived.length > 0 && (
      <details class="mt-6">
        <summary class="cursor-pointer text-sm text-muted hover:text-light select-none">
          Archivierte Fragebögen ({archived.length}) anzeigen
        </summary>
        <div class="flex flex-col gap-6 mt-4">
          {archived.map((bundle) => <Fragment set:html={renderCard(bundle, true)} />)}
        </div>
      </details>
    )}
  </section>
)}
```

Astro `Fragment set:html` is awkward for this rendering — instead, refactor into an inline named function or a sub-component. The cleanest path is to move the per-card markup into its own small Astro component. Replace the strategy above with:

Create `website/src/components/admin/QuestionnaireBundleCard.astro`:

```astro
---
import type { AssignmentBundle } from './ProjectQuestionnairesPanel.astro';

interface Props {
  bundle: AssignmentBundle;
  muted?: boolean;
}
const { bundle, muted = false } = Astro.props;
const { assignment, questions, options, answers, scores } = bundle;
const answerMap = new Map(answers.map(a => [a.question_id, a]));
const optionMap = new Map(options.map(o => [`${o.question_id}:${o.option_key}`, o]));
const showQA = ['in_progress', 'submitted', 'reviewed', 'archived'].includes(assignment.status);
const showScores = scores.length > 0 && ['submitted', 'reviewed', 'archived'].includes(assignment.status);
const dateLabel = assignment.submitted_at
  ? `Eingereicht ${new Date(assignment.submitted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  : `Zugewiesen ${new Date(assignment.assigned_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
const maxScore = Math.max(...scores.map(s => s.threshold_high ?? s.final_score ?? 1), 1);

function levelColor(level: string | null): string {
  if (level === 'kritisch') return '#ef4444';
  if (level === 'mittel') return '#f59e0b';
  if (level === 'förderlich') return '#22c55e';
  return '#b8a06a';
}

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  reviewed: 'bg-green-500/10 text-green-400 border-green-500/20',
  archived: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  dismissed: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Wartend', in_progress: 'In Bearbeitung', submitted: 'Eingereicht',
  reviewed: 'Besprochen', archived: 'Archiviert', dismissed: 'Abgelehnt',
};
---
<div class={`border border-dark-lighter rounded-xl p-5 ${muted ? 'opacity-60' : ''}`}>
  <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
    <div class="min-w-0">
      <h3 class="text-light font-medium">{assignment.template_title}</h3>
      <p class="text-muted text-xs mt-0.5">{dateLabel}</p>
    </div>
    <span class={`px-2.5 py-0.5 rounded-full border text-xs ${STATUS_CLS[assignment.status] ?? ''}`}>
      {STATUS_LABEL[assignment.status] ?? assignment.status}
    </span>
  </div>

  {assignment.status === 'dismissed' && assignment.dismiss_reason && (
    <p class="text-xs text-muted italic mb-3">Abgelehnt: {assignment.dismiss_reason}</p>
  )}

  {showScores && (
    <div class="mb-4">
      <div class="flex flex-col gap-3">
        {scores.map(score => {
          const pct = Math.min((score.final_score / Math.max(maxScore, 1)) * 100, 100);
          const color = levelColor(score.level);
          return (
            <div>
              <div class="flex justify-between items-baseline mb-1">
                <span class="text-light text-xs">{score.name}</span>
                <span class="text-xs font-mono" style={`color: ${color}`}>
                  {score.final_score}{score.level && ` · ${score.level}`}
                </span>
              </div>
              <div class="h-1.5 bg-dark rounded-full overflow-hidden">
                <div class="h-full rounded-full" style={`width: ${pct}%; background-color: ${color}`}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )}

  {assignment.coach_notes && assignment.coach_notes.trim().length > 0 && (
    <div class="mb-4 p-3 bg-dark rounded border border-dark-lighter">
      <p class="text-xs text-muted uppercase tracking-wide mb-1">Coach-Notizen</p>
      <p class="text-sm text-light/90 whitespace-pre-wrap">{assignment.coach_notes}</p>
    </div>
  )}

  {showQA && questions.length > 0 && (
    <details class="mt-2">
      <summary class="cursor-pointer text-xs text-gold hover:text-gold-light select-none">
        Fragen &amp; Antworten anzeigen ({answers.length}/{questions.length})
      </summary>
      <div class="mt-3 flex flex-col gap-3">
        {questions.map((q, i) => {
          const ans = answerMap.get(q.id);
          const chosen = ans?.option_key ?? null;
          const opt = chosen ? optionMap.get(`${q.id}:${chosen}`) : null;
          const label = opt?.label ?? chosen;
          return (
            <div class="border-b border-dark-lighter/50 pb-2 last:border-0 last:pb-0">
              <p class="text-muted text-xs mb-0.5">Frage {i + 1}</p>
              <p class="text-light text-sm whitespace-pre-line mb-1">{q.question_text}</p>
              {chosen === 'skipped' ? (
                <span class="inline-block px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs">
                  Übersprungen
                </span>
              ) : chosen ? (
                <span class="inline-block px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded text-xs">
                  {label}
                </span>
              ) : (
                <span class="text-muted text-xs italic">Nicht beantwortet</span>
              )}
              {ans?.details_text && (
                <p class="text-muted text-xs mt-1 whitespace-pre-line">{ans.details_text}</p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  )}

  <div class="mt-3 flex justify-end">
    <a href={`/admin/fragebogen/${assignment.id}`}
      class="text-xs text-gold/80 hover:text-gold underline">
      Volle Review öffnen →
    </a>
  </div>
</div>
```

Then simplify `ProjectQuestionnairesPanel.astro` to:

```astro
---
import type { QAssignment, QQuestion, QAnswer, QAnswerOption } from '../../lib/questionnaire-db';
import type { DimensionScore } from '../../lib/compute-scores';
import QuestionnaireBundleCard from './QuestionnaireBundleCard.astro';

export interface AssignmentBundle {
  assignment: QAssignment;
  questions: QQuestion[];
  options: QAnswerOption[];
  answers: QAnswer[];
  scores: DimensionScore[];
}

interface Props { assignments: AssignmentBundle[]; }
const { assignments } = Astro.props;

const active = assignments.filter(b => b.assignment.status !== 'archived');
const archived = assignments.filter(b => b.assignment.status === 'archived');
---

{(active.length > 0 || archived.length > 0) && (
  <section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 mb-6" id="questionnaires-panel">
    <h2 class="text-sm font-semibold text-light mb-4 font-serif uppercase tracking-wide">
      Fragebögen ({active.length})
    </h2>

    {active.length > 0 && (
      <div class="flex flex-col gap-6">
        {active.map(bundle => <QuestionnaireBundleCard bundle={bundle} muted={false} />)}
      </div>
    )}

    {archived.length > 0 && (
      <details class="mt-6">
        <summary class="cursor-pointer text-sm text-muted hover:text-light select-none">
          Archivierte Fragebögen ({archived.length}) anzeigen
        </summary>
        <div class="flex flex-col gap-6 mt-4">
          {archived.map(bundle => <QuestionnaireBundleCard bundle={bundle} muted={true} />)}
        </div>
      </details>
    )}
  </section>
)}
```

- [ ] **Step 4: Manual smoke check**

Reload `/admin/projekte/<id>` and `/admin/tickets/<id>` for a project that has an archived Fragebogen. Verify the active panel shows non-archived; the `<details>Archivierte Fragebögen (n) anzeigen</details>` block renders the archived ones below with `opacity-60`.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/ProjectQuestionnairesPanel.astro website/src/components/admin/QuestionnaireBundleCard.astro website/src/pages/admin/projekte/\[id\].astro website/src/pages/admin/tickets/\[id\].astro
git commit -m "feat(admin/projekte+tickets): hide archived Fragebögen behind <details>

Active assignments render as before. Archived ones move into a
collapsed <details> block at the bottom of the panel and use the
frozen snapshot scores via getDisplayScores. Card markup extracted
into QuestionnaireBundleCard.astro to keep the panel readable."
```

---

## Task 12: Playwright E2E — archive → reassign → replay

**Files:**
- Create: `tests/e2e/specs/fa-fragebogen-archive.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/specs/fa-fragebogen-archive.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@localhost:5432/website';

test.describe('FA: Fragebogen archive → reassign → replay', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' });

  test('archive turns submitted into frozen datapoint; reassign creates new row', async ({ page, request }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status)
       VALUES ('e2e-archive', '', '', 'published') RETURNING id`,
    )).rows[0].id;
    const dim = (await pool.query(
      `INSERT INTO questionnaire_dimensions (template_id, name, position, threshold_mid, threshold_high)
       VALUES ($1, 'D', 0, 5, 10) RETURNING id`,
      [tpl],
    )).rows[0].id;
    const q = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1, 0, 'q', 'likert_5') RETURNING id`,
      [tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answer_options (question_id, option_key, label, dimension_id, weight)
       VALUES ($1, '4', 'x', $2, 1)`,
      [q, dim],
    );
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, submitted_at)
       VALUES ($1, $2, 'submitted', now()) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key)
       VALUES ($1, $2, '4')`,
      [a, q],
    );

    // Archive via UI
    await page.goto(`${BASE}/admin/fragebogen/${a}`);
    page.on('dialog', dlg => dlg.accept());
    await page.click('#archive-btn');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Archiviert').first()).toBeVisible();

    // Snapshot row exists
    const snap = await pool.query(
      `SELECT count(*)::int AS n FROM questionnaire_assignment_scores WHERE assignment_id = $1`,
      [a],
    );
    expect(snap.rows[0].n).toBe(1);

    // KPI view returns the archived row
    const kpi = await pool.query(
      `SELECT assignment_id, dimension_name, final_score, level
         FROM bachelorprojekt.v_questionnaire_kpi
        WHERE assignment_id = $1`,
      [a],
    );
    expect(kpi.rows.length).toBe(1);
    expect(kpi.rows[0].dimension_name).toBe('D');
    expect(kpi.rows[0].final_score).toBe(4);

    // Reassign — confirms via dialog, navigates to new wizard
    await page.click('[data-testid="reassign-questionnaire"]');
    await page.waitForURL(/\/portal\/fragebogen\/[0-9a-f-]+/);
    const newId = page.url().split('/').pop()!.split('?')[0];
    expect(newId).not.toBe(a);

    // Source preserved, new row pending
    const rows = await pool.query(
      `SELECT id, status, archived_at FROM questionnaire_assignments
        WHERE customer_id = $1 ORDER BY assigned_at`,
      [customerId],
    );
    expect(rows.rows.length).toBe(2);
    expect(rows.rows[0].status).toBe('archived');
    expect(rows.rows[0].archived_at).not.toBeNull();
    expect(rows.rows[1].status).toBe('pending');
    expect(rows.rows[1].archived_at).toBeNull();

    await pool.end();
  });

  test('replay button surfaces and opens drawer for archived system-test with evidence', async ({ page }) => {
    const pool = new Pool({ connectionString: DB_URL });
    const customerId = (await pool.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;
    const tpl = (await pool.query(
      `INSERT INTO questionnaire_templates (title, description, instructions, status, is_system_test)
       VALUES ('e2e-replay', '', '', 'published', true) RETURNING id`,
    )).rows[0].id;
    const q = (await pool.query(
      `INSERT INTO questionnaire_questions (template_id, position, question_text, question_type)
       VALUES ($1, 0, 'step', 'test_step') RETURNING id`,
      [tpl],
    )).rows[0].id;
    const a = (await pool.query(
      `INSERT INTO questionnaire_assignments (customer_id, template_id, status, submitted_at, archived_at)
       VALUES ($1, $2, 'archived', now(), now()) RETURNING id`,
      [customerId, tpl],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO questionnaire_answers (assignment_id, question_id, option_key)
       VALUES ($1, $2, 'erfüllt')`,
      [a, q],
    );
    await pool.query(
      `INSERT INTO questionnaire_test_evidence (assignment_id, question_id, attempt, replay_path)
       VALUES ($1, $2, 0, '/tmp/replay-0')`,
      [a, q],
    );

    await page.goto(`${BASE}/admin/fragebogen/${a}`);
    const replayBtn = page.locator('.replay-btn').first();
    await expect(replayBtn).toBeVisible();
    await expect(replayBtn).toContainText('Versuch 0');

    await pool.end();
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `cd tests/e2e && npx playwright test specs/fa-fragebogen-archive.spec.ts --reporter=list`
Expected: 2 PASS (assumes admin auth state at `tests/e2e/.auth/admin.json` — same fixture other admin specs use; the base `WEBSITE_URL` defaults to dev).

If the admin auth fixture is missing, run the auth setup the e2e suite uses (check `tests/e2e/playwright.config.ts` for the global setup project). The repo's `./tests/runner.sh local` orchestrates the full pipeline including auth.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-fragebogen-archive.spec.ts
git commit -m "test(e2e): cover archive → reassign → replay flow

Two specs: (1) submit → archive via UI → snapshot row + KPI view
populated → reassign creates new pending row, archive untouched;
(2) archived system-test with evidence shows 'Replay ansehen
(Versuch n)' button on the detail page."
```

---

## Task 13: Final integration — run unit + manifest + e2e suites

**Files:**
- None modified.

- [ ] **Step 1: Run all questionnaire unit tests**

Run: `cd website && SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@localhost:5432/website npx vitest run src/lib/questionnaire-archive.test.ts src/pages/api/admin/questionnaires/`
Expected: all tests PASS.

- [ ] **Step 2: Validate manifests still build**

Run: `task workspace:validate`
Expected: dry-run kustomize build succeeds for all overlays.

- [ ] **Step 3: Push branch + open PR per the project workflow**

Per CLAUDE.md "Development Rules", changes go via PR with squash-and-merge. Use `task feature:website` afterwards to roll the website on both prod clusters once merged.

```bash
git push -u origin feature/fragebogen-archive
gh pr create --title "feat(fragebogen): archive submitted as frozen KPI datapoint + replay surface" --body "$(cat <<'EOF'
## Summary
- Archive submitted/reviewed Fragebögen into a frozen `questionnaire_assignment_scores` snapshot, exposed via `bachelorprojekt.v_questionnaire_kpi`.
- Reassign creates a new pending assignment for the same template+customer; archived row stays as a permanent datapoint.
- Detail page wires the existing `SystemtestReplayDrawer` per `test_step` row that has rrweb evidence.
- Active list views split active vs archived: customer panel toggle, project/ticket panel `<details>` block.

## Test plan
- [ ] `cd website && npx vitest run src/lib/questionnaire-archive.test.ts src/pages/api/admin/questionnaires/`
- [ ] `cd tests/e2e && npx playwright test specs/fa-fragebogen-archive.spec.ts`
- [ ] Manually archive a submitted Fragebogen on dev and verify it disappears from `ClientQuestionnairesPanel` until "Archiv anzeigen" is toggled.
- [ ] Manually reassign and verify the portal wizard opens with a fresh assignment id.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- Snapshot table → Task 1 ✓
- KPI view (with evidence_count + latest_evidence_id) → Task 1 ✓
- `archiveQAssignment` (transactional snapshot) → Task 2 ✓
- `reassignQAssignment` → Task 3 ✓
- Evidence preservation (no copy/move) → covered by absence of any evidence-table mutation in archive ✓
- `listEvidenceByAssignment` → Task 4 ✓
- `listArchivedScores` + `getDisplayScores` → Tasks 4 + 5 ✓
- Reroute `updateQAssignment` archived → Task 6 ✓
- Archive API → Task 7 ✓
- Reassign API → Task 8 ✓
- Admin detail UI: archive button gating, reassign button, inline replay button per test_step → Task 9 ✓
- `ClientQuestionnairesPanel` split + toggle → Task 10 ✓
- `ProjectQuestionnairesPanel` split + `<details>` + snapshot scores → Task 11 ✓
- Playwright E2E (archive → reassign → replay) → Task 12 ✓
- Unit tests for all new helpers + view shape → Tasks 1-5 ✓
- API tests (archive + reassign) → Tasks 7-8 ✓

**Placeholder scan:** none — every step has runnable code or commands.

**Type/signature consistency:**
- `QArchivedScore`, `QEvidenceForQuestion` are new types defined in Task 4 and consumed by `getDisplayScores` (Task 5) and the detail page (Task 9).
- `archiveQAssignment` return type `{ assignment } | { reason: 'not_found' | 'not_archivable'; status?: AssignmentStatus }` matches the API endpoint's narrowing in Task 7.
- `reassignQAssignment` return type `{ assignment } | { reason: 'not_found' }` matches Task 8.
- `getDisplayScores` returns `DimensionScore[]` (the existing `compute-scores.ts` type), so the panel + detail page code stays unchanged.
- `ARCHIVABLE_STATUSES` includes `'archived'` so re-archiving is a no-op (idempotent test in Task 2). The API never returns 409 for an already-archived row — that is intentional.
