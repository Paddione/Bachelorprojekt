import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import * as kdb from './knowledge-db';

let pool: ReturnType<ReturnType<typeof newDb>['adapters']['createPg']>['Pool'] extends new (...args: any[]) => infer T ? T : never;

let pgmem: ReturnType<typeof newDb>;

beforeAll(async () => {
  pgmem = newDb();
  // Register gen_random_uuid() since pg-mem doesn't ship it
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    },
  });
  pgmem.public.none(`
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text, source text NOT NULL, brand text REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      chunk_count int NOT NULL DEFAULT 0,
      last_indexed_at timestamptz,
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      created_by uuid, created_at timestamptz DEFAULT now()
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collections_brand_fkey') THEN
          ALTER TABLE knowledge.collections ADD CONSTRAINT collections_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
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
  `);
  const { Pool } = pgmem.adapters.createPg();
  pool = new Pool();
  kdb.__setPoolForTests(pool as any);
});

afterAll(() => (pool as any).end());

beforeEach(async () => {
  await (pool as any).query('TRUNCATE knowledge.chunks');
  await (pool as any).query('TRUNCATE knowledge.documents');
  await (pool as any).query('TRUNCATE knowledge.collections');
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
    await (pool as any).query('TRUNCATE knowledge.chunks');
    await (pool as any).query('TRUNCATE knowledge.documents');
    await (pool as any).query('TRUNCATE knowledge.collections');
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
