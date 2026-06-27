// website/src/lib/learning-db.test.ts
// Real DML tests for learning-db.ts, backed by an in-memory Postgres (pg-mem).
// learning-db.ts imports `pool` from ./website-db as a MODULE BINDING, so we
// vi.mock('./website-db') and swap in a pg-mem pool.
//
// HOISTING TRAP (verified empirically — see Deviation #4): `vi.mock` is hoisted to
// the top of the file, ABOVE every ESM import and module-level `const`. If the mock
// factory closes over a module-level `const memPool = …`, the factory runs during
// the very first import of './website-db' (which happens transitively when
// `import * as learningDb from './learning-db'` is collected) — BEFORE the
// `const memPool` line has executed → `ReferenceError: Cannot access 'memPool'
// before initialization`, which fails the ENTIRE suite at collect time. The fix is
// to build the pool inside `vi.hoisted(() => …)`, which Vitest runs even earlier
// than the imports, and to read `memPool` back out of the hoisted result.
// (NOTE: do NOT model this on content-effective.test.ts — its factory uses `orig`
// and references no outer variable, so it never hits the TDZ; it is not a template
// for the module-binding case here.)

import { describe, it, afterAll, beforeEach, expect, vi } from 'vitest';
import type { Pool } from 'pg';

// ── Build the pg-mem pool inside vi.hoisted (runs before the ESM imports) ──────
// Everything the vi.mock factory needs must live here: pg-mem setup, the
// gen_random_uuid registration, the CREATE TABLEs, and the pool itself. Use
// require() inside the hoisted block — top-level ESM imports are NOT yet evaluated
// when this runs.
const { memPool } = vi.hoisted(() => {
   
  const { newDb, DataType } = require('pg-mem');
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE TABLE learning_progress (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      brand            TEXT NOT NULL DEFAULT 'mentolder',
      item_type        TEXT NOT NULL CHECK (item_type IN ('goal','tool')),
      item_id          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'todo'
                         CHECK (status IN ('todo','in_progress','done')),
      note             TEXT,
      started_at       TIMESTAMPTZ,
      completed_at     TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (keycloak_user_id, brand, item_type, item_id)
    );
    CREATE TABLE onboarding_state (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      brand            TEXT NOT NULL DEFAULT 'mentolder',
      step_id          TEXT NOT NULL,
      completed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (keycloak_user_id, brand, step_id)
    );
  `);
  const { Pool: MemPool } = pgmem.adapters.createPg();
  return { memPool: new MemPool() as unknown as Pool };
});

// The factory reads `memPool` from the hoisted result — both are hoisted, so this
// is safe (no TDZ). Do NOT introduce a separate module-level `const` for memPool.
vi.mock('./website-db', () => ({ pool: memPool, platformPool: memPool }));

import * as learningDb from './learning-db';
import { goals, tools } from './agentGuide';

const USER = 'kc-user-1';
const BRAND = 'mentolder';
const GOAL_ID = goals[0].id;   // a real canonical goal id
const TOOL_ID = tools[0].id;   // a real canonical tool id

beforeEach(async () => {
  await memPool.query('TRUNCATE learning_progress');
  await memPool.query('TRUNCATE onboarding_state');
});

afterAll(async () => {
  await (memPool as unknown as { end(): Promise<void> }).end();
});

describe('upsertLearningItem — note-only save', () => {
  it('INSERT path: a note-only save on an empty table defaults to status=todo with null timestamps', async () => {
    // Spec-mandated INSERT default ($5-vs-$7 separation): a brand-new note-only row
    // must NOT inherit a status from $5 (which is NULL here) — it uses the INSERT-path
    // default 'todo' via $7, and leaves both timestamps null.
    const created = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { note: 'x' });
    expect(created.status).toBe('todo');
    expect(created.startedAt).toBeNull();
    expect(created.completedAt).toBeNull();
    expect(created.note).toBe('x');
  });

  it('does NOT reset status or completed_at when saving a note on a done item', async () => {
    // Arrange: mark the goal done.
    const done = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { status: 'done' });
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    const firstCompletedAt = done.completedAt;

    // Act: save a note WITHOUT a status (note-only).
    const afterNote = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { note: 'Habe das gelernt' });

    // Assert: status + completed_at preserved; note written.
    expect(afterNote.status).toBe('done');
    expect(afterNote.completedAt).not.toBeNull();
    expect(afterNote.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
    expect(afterNote.note).toBe('Habe das gelernt');
  });
});

describe('upsertLearningItem — status transitions', () => {
  it('todo→in_progress→done→done preserves started_at and the first completed_at', async () => {
    const a = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'todo' });
    expect(a.status).toBe('todo');
    expect(a.startedAt).toBeNull();
    expect(a.completedAt).toBeNull();

    const b = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'in_progress' });
    expect(b.status).toBe('in_progress');
    expect(b.startedAt).not.toBeNull();      // started_at now set
    expect(b.completedAt).toBeNull();
    const startedAt = b.startedAt;

    const c = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(c.status).toBe('done');
    expect(c.startedAt?.getTime()).toBe(startedAt?.getTime());  // sticky
    expect(c.completedAt).not.toBeNull();
    const completedAt = c.completedAt;

    const d = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(d.completedAt?.getTime()).toBe(completedAt?.getTime()); // first completion sticky
    expect(d.startedAt?.getTime()).toBe(startedAt?.getTime());
  });

  it('done→todo clears completed_at but keeps started_at', async () => {
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    const reverted = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'todo' });
    expect(reverted.status).toBe('todo');
    expect(reverted.completedAt).toBeNull();
    expect(reverted.startedAt).not.toBeNull();   // started_at stays sticky
  });

  it('preserves an existing note across a status-only toggle (note = COALESCE($6, …))', async () => {
    // Set a note first (note-only save).
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { note: 'meine Notiz' });
    // Toggle status WITHOUT passing a note → $6 is NULL → COALESCE keeps the old note.
    const afterToggle = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(afterToggle.status).toBe('done');
    expect(afterToggle.note).toBe('meine Notiz');   // note survived the status-only update
  });

  it('rejects an item_id that is not in the canonical guide', async () => {
    await expect(
      learningDb.upsertLearningItem(USER, BRAND, 'goal', 'not-a-real-goal', { status: 'done' })
    ).rejects.toThrow(/not in agent-guide/);
  });
});

describe('getLearningSummary — canonical cap', () => {
  it('never counts orphan (non-canonical) rows and never exceeds total/100%', async () => {
    // Insert a legitimately-done canonical item.
    await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { status: 'done' });

    // Inject an orphan 'done' row whose item_id is NOT in the canonical guide,
    // bypassing the upsert validation (simulates a removed item left behind).
    await memPool.query(
      `INSERT INTO learning_progress
         (keycloak_user_id, brand, item_type, item_id, status, started_at, completed_at)
       VALUES ($1, $2, 'goal', 'removed-legacy-goal', 'done', now(), now())`,
      [USER, BRAND]
    );

    const summary = await learningDb.getLearningSummary(USER, BRAND);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.done).toBe(1);                 // only the canonical one counts
    expect(summary.done).toBeLessThanOrEqual(summary.total);
    expect(summary.pct).toBeLessThanOrEqual(100);
    expect(summary.pct).toBe(Math.round((1 / summary.total) * 100));
  });

  it('counts a CANONICAL in_progress row but excludes an in_progress orphan', async () => {
    // Canonical in_progress item — MUST be counted.
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'in_progress' });
    // Orphan in_progress item (not in the guide) — MUST be excluded. Without the
    // canonical cap this orphan would push inProgress to 2 (real red→green: the old
    // uncapped code would fail the `=== 1` assertion).
    await memPool.query(
      `INSERT INTO learning_progress
         (keycloak_user_id, brand, item_type, item_id, status, started_at)
       VALUES ($1, $2, 'tool', 'removed-legacy-tool', 'in_progress', now())`,
      [USER, BRAND]
    );
    const summary = await learningDb.getLearningSummary(USER, BRAND);
    expect(summary.inProgress).toBe(1);   // only the canonical row, orphan excluded
  });
});
