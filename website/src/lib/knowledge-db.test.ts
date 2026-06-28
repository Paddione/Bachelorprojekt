import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import * as kdb from './knowledge-db';

// pg-mem types its generated Pool as `any`; model the surface the tests use.
type TestPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  end: () => Promise<void>;
};

let pool: TestPool;

let pgmem: ReturnType<typeof newDb>;

beforeAll(async () => {
  pgmem = newDb();
  // Register gen_random_uuid() since pg-mem doesn't ship it
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    },
  });
  pgmem.public.none(`
    CREATE TABLE public.brands (id text PRIMARY KEY);
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text, source text NOT NULL, brand text REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      chunk_count int NOT NULL DEFAULT 0,
      last_indexed_at timestamptz,
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      created_by uuid, created_at timestamptz DEFAULT now(),
      crawl_config jsonb
    );
    CREATE TABLE knowledge.documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id uuid NOT NULL,
      title text NOT NULL, source_uri text, raw_text text NOT NULL,
      sha256 text, metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      UNIQUE (collection_id, source_uri)
    );
    CREATE TABLE knowledge.chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL,
      collection_id uuid NOT NULL,
      position int NOT NULL,
      text text NOT NULL,
      embedding text,
      metadata jsonb DEFAULT '{}',
      UNIQUE (document_id, position)
    );
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.books (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_collection_id uuid NOT NULL UNIQUE REFERENCES knowledge.collections(id) ON DELETE CASCADE,
      title text NOT NULL,
      source_filename text NOT NULL DEFAULT 'test.pdf',
      ingested_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const { Pool } = pgmem.adapters.createPg();
  pool = new Pool();
  kdb.__setPoolForTests(pool as unknown as Pool);
});

afterAll(() => pool.end());

beforeEach(async () => {
  await pool.query('DELETE FROM knowledge.chunks');
  await pool.query('DELETE FROM knowledge.documents');
  await pool.query('DELETE FROM coaching.books');
  await pool.query('DELETE FROM knowledge.collections');
});

describe('knowledge-db', () => {
  test('createCollection + listCollections round-trip', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'custom', description: 'x' });
    const list = await kdb.listCollections();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(c.id);
  });

  test('addDocument + upsertChunks updates chunk_count', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'custom' });
    const d = await kdb.addDocument({ collectionId: c.id, title: 't', sourceUri: 'paste:1', rawText: 'hi' });
    await kdb.upsertChunks(c.id, d.id, [
      { position: 0, text: 'hi', embedding: Array(1024).fill(0) },
      { position: 1, text: 'ho', embedding: Array(1024).fill(0) },
    ]);
    await kdb.recountChunks(c.id);
    const list = await kdb.listCollections();
    expect(list[0].chunk_count).toBe(2);
  });

  test('deleteCollection refuses non-custom', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'pr_history' });
    await expect(kdb.deleteCollection(c.id)).rejects.toThrow(/custom/i);
  });
});

describe('knowledge-db — model-aware query path', () => {
  const ORIGINAL_LLM_ENABLED = process.env.LLM_ENABLED;

  beforeEach(async () => {
    await pool.query('DELETE FROM knowledge.chunks');
    await pool.query('DELETE FROM knowledge.documents');
    await pool.query('DELETE FROM coaching.books');
    await pool.query('DELETE FROM knowledge.collections');
    process.env.LLM_ENABLED = 'false';
  });

  afterAll(() => {
    process.env.LLM_ENABLED = ORIGINAL_LLM_ENABLED;
  });

  test('queryNearest reads embedding_model from collection and passes to embedQuery', async () => {
    const c = await kdb.createCollection({ name: 'kn-bge', source: 'custom', embeddingModel: 'bge-m3' });
    const calls: Array<{ text: string; model?: string; purpose?: string }> = [];
    const embedMod = await import('./embeddings');
    vi.spyOn(embedMod, 'embedQuery').mockImplementationOnce(async (text, opts) => {
      calls.push({ text, model: opts?.model, purpose: opts?.purpose });
      return { embedding: Array(1024).fill(0.01), tokens: 1 };
    });
    await kdb.queryNearest({ collectionIds: [c.id], queryText: 'hallo' }).catch(() => {});
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ text: 'hallo', model: 'bge-m3', purpose: 'query' });
    vi.restoreAllMocks();
  });

  test('queryNearest throws MixedEmbeddingModelError when collectionIds disagree on model', async () => {
    const a = await kdb.createCollection({ name: 'kn-bge-x', source: 'custom', embeddingModel: 'bge-m3' });
    const b = await kdb.createCollection({ name: 'kn-vy-x',  source: 'custom', embeddingModel: 'voyage-multilingual-2' });
    await expect(kdb.queryNearest({ collectionIds: [a.id, b.id], queryText: 'q' }))
      .rejects.toThrow(/MixedEmbeddingModelError/);
  });

  test('createCollection defaults to bge-m3 when LLM_ENABLED=true, voyage-multilingual-2 otherwise', async () => {
    process.env.LLM_ENABLED = 'true';
    const a = await kdb.createCollection({ name: 'kn-default-bge', source: 'custom' });
    expect(a.embedding_model).toBe('bge-m3');
    process.env.LLM_ENABLED = 'false';
    const b = await kdb.createCollection({ name: 'kn-default-voyage', source: 'custom' });
    expect(b.embedding_model).toBe('voyage-multilingual-2');
  });
});

describe('mergeCollections', () => {
  async function seedCollection(name: string, source: 'custom' | 'web_crawl' | 'pr_history', chunks: number, model = 'voyage-multilingual-2') {
    const r = await pool.query(
      `INSERT INTO knowledge.collections (name, source, chunk_count, embedding_model)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, source, chunks, model],
    );
    const colId = r.rows[0].id as string;
    const docR = await pool.query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [colId, `${name}-doc`, `uri:${name}`, `text of ${name}`],
    );
    const docId = docR.rows[0].id as string;
    for (let i = 0; i < chunks; i++) {
      await pool.query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        [docId, colId, i, `chunk ${i} of ${name}`, '[0.1,0.2]'],
      );
    }
    return colId;
  }

  test('merges two custom collections: creates merged, deletes sources', async () => {
    const a = await seedCollection('alpha', 'custom', 3);
    const b = await seedCollection('beta', 'custom', 2);

    const merged = await kdb.mergeCollections({ sourceIds: [a, b], name: 'merged-ab' });

    expect(merged.name).toBe('merged-ab');
    expect(merged.chunk_count).toBe(5);
    expect(merged.source).toBe('custom');

    const remaining = await kdb.listCollections();
    const ids = remaining.map(c => c.id);
    expect(ids).toContain(merged.id);
    expect(ids).not.toContain(a);
    expect(ids).not.toContain(b);
  });

  test('copies documents and chunks to new collection', async () => {
    const a = await seedCollection('doc-a', 'custom', 2);
    const b = await seedCollection('doc-b', 'custom', 3);

    const merged = await kdb.mergeCollections({ sourceIds: [a, b], name: 'docs-merged' });

    const docs = await pool.query(
      'SELECT * FROM knowledge.documents WHERE collection_id = $1', [merged.id],
    );
    expect(docs.rows).toHaveLength(2);

    const chunks = await pool.query(
      'SELECT * FROM knowledge.chunks WHERE collection_id = $1', [merged.id],
    );
    expect(chunks.rows).toHaveLength(5);
  });

  test('deletes coaching.books records for source collections', async () => {
    const a = await seedCollection('book-src', 'custom', 2);
    const b = await seedCollection('book-src2', 'custom', 1);
    await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title) VALUES ($1, $2)`,
      [a, 'Test Book'],
    );

    await kdb.mergeCollections({ sourceIds: [a, b], name: 'book-merged' });

    const books = await pool.query(
      'SELECT * FROM coaching.books WHERE knowledge_collection_id = $1', [a],
    );
    expect(books.rows).toHaveLength(0);
  });

  test('throws when fewer than 2 sourceIds provided', async () => {
    const a = await seedCollection('solo', 'custom', 1);
    await expect(kdb.mergeCollections({ sourceIds: [a], name: 'fail' }))
      .rejects.toThrow('mindestens 2 Quellen erforderlich');
  });

  test('throws when a source collection is a builtin', async () => {
    const a = await seedCollection('cust', 'custom', 1);
    const b = await seedCollection('builtin', 'pr_history', 2);
    await expect(kdb.mergeCollections({ sourceIds: [a, b], name: 'fail' }))
      .rejects.toThrow(/cannot_delete/);
  });

  test('throws MixedEmbeddingModelError when models differ', async () => {
    const a = await seedCollection('m-bge', 'custom', 1, 'bge-m3');
    const b = await seedCollection('m-voy', 'custom', 1, 'voyage-multilingual-2');
    await expect(kdb.mergeCollections({ sourceIds: [a, b], name: 'fail' }))
      .rejects.toThrow(/MixedEmbeddingModelError/);
  });
});
