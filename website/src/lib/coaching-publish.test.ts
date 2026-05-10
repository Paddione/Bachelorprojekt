import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';

vi.mock('./questionnaire-db', () => ({
  createQTemplate: vi.fn(async (params: { title: string }) => ({
    id: 'qt-mock-id',
    title: params.title,
    description: '',
    instructions: '',
    status: 'draft',
    is_system_test: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })),
}));

vi.mock('./knowledge-db', () => ({
  ensureCollection: vi.fn(async () => ({ id: 'coll-mock-id', name: 'coaching-assistant' })),
  addDocument: vi.fn(async () => ({ id: 'doc-mock-id' })),
}));

import * as cdb from './coaching-db';
import { publishTemplate } from './coaching-publish';

let pool: Pool;
let pgmem: ReturnType<typeof newDb>;

beforeAll(async () => {
  pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }),
  });
  pgmem.public.none(`
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.collections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, source text);
    CREATE TABLE knowledge.chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), collection_id uuid, position int, text text);
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.books (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), knowledge_collection_id uuid NOT NULL, title text NOT NULL, source_filename text NOT NULL, ingested_at timestamptz DEFAULT now());
    CREATE TABLE coaching.snippets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL, knowledge_chunk_id uuid, cluster_id uuid, title text NOT NULL, body text NOT NULL, tags text[] DEFAULT '{}', page int, created_by text, created_at timestamptz DEFAULT now());
    CREATE TABLE coaching.snippet_clusters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid, name text NOT NULL, kind text DEFAULT 'manual', created_at timestamptz DEFAULT now());
    CREATE TABLE coaching.templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snippet_id uuid NOT NULL, target_surface text NOT NULL, version int NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft', payload jsonb NOT NULL DEFAULT '{}', source_pointer jsonb NOT NULL, surface_ref text, published_at timestamptz, created_by text, created_at timestamptz NOT NULL DEFAULT now());
  `);
  const { Pool: MemPool } = pgmem.adapters.createPg();
  pool = new MemPool() as unknown as Pool;
});

afterAll(async () => { await (pool as unknown as { end(): Promise<void> }).end(); });

beforeEach(async () => {
  await pool.query(`TRUNCATE coaching.templates`);
  await pool.query(`TRUNCATE coaching.snippets`);
  await pool.query(`TRUNCATE coaching.books`);
  await pool.query(`TRUNCATE knowledge.collections`);
});

async function seed(): Promise<{
  snippetId: string; bookId: string;
  templateId: (s: cdb.TargetSurface, payload: Record<string, unknown>) => Promise<string>;
}> {
  const c = await pool.query(`INSERT INTO knowledge.collections (name, source) VALUES ('t', 'custom') RETURNING id`);
  const b = await pool.query(`INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 't', 't.epub') RETURNING id`, [c.rows[0].id]);
  const s = await cdb.createSnippet(pool, { bookId: b.rows[0].id, title: '.', body: 'snippet body unique text', tags: [] });
  return {
    snippetId: s.id,
    bookId: b.rows[0].id,
    templateId: async (surface, payload) => {
      const t = await cdb.createTemplateDraft(pool, {
        snippetId: s.id,
        targetSurface: surface,
        payload,
        sourcePointer: { bookId: b.rows[0].id, page: 1, chunkId: null },
      });
      return t.id;
    },
  };
}

describe('publishTemplate', () => {
  test('questionnaire cascade calls createQTemplate and marks published', async () => {
    const { templateId } = await seed();
    const tid = await templateId('questionnaire', { title: 'Q', question: 'Wann?' });
    const r = await publishTemplate(pool, tid, { snippetBody: 'snippet body unique text' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.template.status).toBe('published');
      expect(r.template.surfaceRef).toBe('qt-mock-id');
    }
  });

  test('assistant cascade adds a document and marks published', async () => {
    const { templateId } = await seed();
    const tid = await templateId('assistant', { title: 'X', body: 'kurze paraphrase' });
    const r = await publishTemplate(pool, tid, { snippetBody: 'snippet body unique text' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.template.surfaceRef).toBe('doc-mock-id');
  });

  test('brett/chatroom cascades store-only (surface_ref stays null)', async () => {
    const { templateId } = await seed();
    const tid = await templateId('brett', { name: 'X', instructions: 'kurz' });
    const r = await publishTemplate(pool, tid, { snippetBody: 'snippet body unique text' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.template.status).toBe('published');
      expect(r.template.surfaceRef).toBeNull();
    }
  });

  test('rejects when payload contains a verbatim quote longer than 280 chars', async () => {
    const longQuote = 'q'.repeat(290);
    const { templateId } = await seed();
    await pool.query(`UPDATE coaching.snippets SET body = $1`, [`prefix ${longQuote} suffix`]);
    const tid = await templateId('questionnaire', { title: 'X', question: longQuote });
    const r = await publishTemplate(pool, tid, { snippetBody: `prefix ${longQuote} suffix` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/quote-length violation/);
  });

  test('rejects double-publish', async () => {
    const { templateId } = await seed();
    const tid = await templateId('assistant', { title: 'A', body: '.' });
    await publishTemplate(pool, tid, { snippetBody: 'snippet body unique text' });
    const second = await publishTemplate(pool, tid, { snippetBody: 'snippet body unique text' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already published/);
  });
});
