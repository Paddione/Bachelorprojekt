import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  ensurePromptLibrarySchema,
  listPrompts,
  getPrompt,
  upsertPrompt,
  deletePrompt,
  incrementUsage,
} from './prompt-library-db';

/**
 * Each test starts from a COMPLETELY EMPTY pg-mem database — the
 * prompt_library table is never pre-created. This proves that
 * ensurePromptLibrarySchema() is solely responsible for creating the
 * schema (the T000406 lesson: every query must self-heal the schema),
 * and that running it twice is idempotent.
 */
function freshPool(): Pool {
  // noAstCoverageCheck: pg-mem otherwise throws on a *replayed*
  // `CREATE TABLE IF NOT EXISTS` (it re-parses inline PRIMARY KEY / NOT NULL
  // constraints on the skipped statement). Real Postgres has no such issue;
  // the option only relaxes pg-mem's strict planner so the idempotency the
  // T000406 lesson requires can actually be exercised here.
  const db = newDb({ noAstCoverageCheck: true });
  // pg-mem has a partial-index bug: a `CREATE INDEX ... WHERE is_active`
  // makes it route *unfiltered* `WHERE brand = $1` lookups through that index,
  // silently hiding inactive rows. Real Postgres only ever uses a partial
  // index as an optional access path and never hides rows. Strip the partial
  // index DDL in the in-memory harness so the production index (kept for perf)
  // doesn't corrupt query results under test.
  db.public.interceptQueries((sql) =>
    /CREATE\s+INDEX[\s\S]*WHERE/i.test(sql) ? [] : null,
  );
  const { Pool: PgMemPool } = db.adapters.createPg();
  return new PgMemPool() as unknown as Pool;
}

let pool: Pool;
beforeEach(() => {
  pool = freshPool();
});

describe('ensurePromptLibrarySchema', () => {
  it('creates the prompt_library table on a fresh DB', async () => {
    await ensurePromptLibrarySchema(pool);
    // listPrompts would throw "relation does not exist" if the table was missing.
    const rows = await listPrompts(pool, 'mentolder');
    expect(rows).toEqual([]);
  });

  it('is idempotent — running twice does not error', async () => {
    await ensurePromptLibrarySchema(pool);
    await ensurePromptLibrarySchema(pool);
    const rows = await listPrompts(pool, 'mentolder');
    expect(rows).toEqual([]);
  });
});

describe('upsertPrompt', () => {
  it('inserts a new prompt and returns it with defaults', async () => {
    const p = await upsertPrompt(pool, {
      brand: 'mentolder',
      title: 'Begrüßung',
      body: 'Hallo und herzlich willkommen!',
      createdBy: 'admin@example.com',
    });
    expect(p.id).toBeGreaterThan(0);
    expect(p.brand).toBe('mentolder');
    expect(p.title).toBe('Begrüßung');
    expect(p.body).toBe('Hallo und herzlich willkommen!');
    expect(p.category).toBe('canned_reply');
    expect(p.isActive).toBe(true);
    expect(p.usageCount).toBe(0);
  });

  it('updates an existing prompt on (brand, title) conflict', async () => {
    await upsertPrompt(pool, { brand: 'mentolder', title: 'FAQ', body: 'alt' });
    const updated = await upsertPrompt(pool, {
      brand: 'mentolder',
      title: 'FAQ',
      body: 'neu',
      description: 'Beschreibung',
      category: 'faq',
      isActive: false,
    });
    expect(updated.body).toBe('neu');
    expect(updated.description).toBe('Beschreibung');
    expect(updated.category).toBe('faq');
    expect(updated.isActive).toBe(false);
    // Still only one row for this (brand, title).
    const all = await listPrompts(pool, 'mentolder', { activeOnly: false });
    expect(all.filter(r => r.title === 'FAQ')).toHaveLength(1);
  });

  it('updates an existing prompt by id (rename allowed)', async () => {
    const created = await upsertPrompt(pool, { brand: 'mentolder', title: 'Alt', body: 'x' });
    const renamed = await upsertPrompt(pool, {
      id: created.id,
      brand: 'mentolder',
      title: 'Neu',
      body: 'y',
    });
    expect(renamed.id).toBe(created.id);
    expect(renamed.title).toBe('Neu');
    expect(renamed.body).toBe('y');
    const got = await getPrompt(pool, created.id);
    expect(got?.title).toBe('Neu');
  });
});

describe('listPrompts', () => {
  beforeEach(async () => {
    await upsertPrompt(pool, { brand: 'mentolder', title: 'A', body: 'a' });
    await upsertPrompt(pool, { brand: 'mentolder', title: 'B', body: 'b', isActive: false });
    await upsertPrompt(pool, { brand: 'korczewski', title: 'C', body: 'c' });
  });

  it('returns only the requested brand', async () => {
    const rows = await listPrompts(pool, 'mentolder', { activeOnly: false });
    expect(rows.map(r => r.title).sort()).toEqual(['A', 'B']);
  });

  it('activeOnly=true filters out inactive prompts', async () => {
    const rows = await listPrompts(pool, 'mentolder', { activeOnly: true });
    expect(rows.map(r => r.title)).toEqual(['A']);
  });

  it('activeOnly defaults to false (returns all)', async () => {
    const rows = await listPrompts(pool, 'mentolder');
    expect(rows).toHaveLength(2);
  });
});

describe('getPrompt', () => {
  it('returns null for an unknown id', async () => {
    await ensurePromptLibrarySchema(pool);
    expect(await getPrompt(pool, 99999)).toBeNull();
  });

  it('returns the matching prompt', async () => {
    const created = await upsertPrompt(pool, { brand: 'mentolder', title: 'X', body: 'x' });
    const got = await getPrompt(pool, created.id);
    expect(got?.id).toBe(created.id);
    expect(got?.title).toBe('X');
  });
});

describe('incrementUsage', () => {
  it('increments usage_count by one and returns the new count', async () => {
    const created = await upsertPrompt(pool, { brand: 'mentolder', title: 'Y', body: 'y' });
    expect(created.usageCount).toBe(0);
    const after1 = await incrementUsage(pool, created.id);
    expect(after1).toBe(1);
    const after2 = await incrementUsage(pool, created.id);
    expect(after2).toBe(2);
    const reread = await getPrompt(pool, created.id);
    expect(reread?.usageCount).toBe(2);
  });

  it('returns null for an unknown id', async () => {
    await ensurePromptLibrarySchema(pool);
    expect(await incrementUsage(pool, 99999)).toBeNull();
  });
});

describe('deletePrompt', () => {
  it('removes the prompt', async () => {
    const created = await upsertPrompt(pool, { brand: 'mentolder', title: 'Z', body: 'z' });
    const affected = await deletePrompt(pool, created.id);
    expect(affected).toBe(1);
    expect(await getPrompt(pool, created.id)).toBeNull();
  });

  it('returns 0 when the id does not exist', async () => {
    await ensurePromptLibrarySchema(pool);
    expect(await deletePrompt(pool, 99999)).toBe(0);
  });
});
