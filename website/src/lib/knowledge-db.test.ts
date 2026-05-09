import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
      description text, source text NOT NULL, brand text,
      chunk_count int NOT NULL DEFAULT 0,
      last_indexed_at timestamptz,
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      created_by uuid, created_at timestamptz DEFAULT now()
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
