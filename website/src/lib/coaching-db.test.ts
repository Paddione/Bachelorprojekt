import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import * as cdb from './coaching-db';

let pgmem: ReturnType<typeof newDb>;
let pool: Pool;

beforeAll(async () => {
  pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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
    CREATE TABLE knowledge.chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL,
      collection_id uuid NOT NULL,
      position int NOT NULL,
      text text NOT NULL,
      embedding text,
      metadata jsonb DEFAULT '{}'
    );

    CREATE SCHEMA coaching;
    CREATE TABLE coaching.books (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_collection_id uuid NOT NULL,
      title text NOT NULL,
      author text,
      source_filename text NOT NULL,
      license_note text,
      ingested_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (knowledge_collection_id)
    );
    CREATE TABLE coaching.snippet_clusters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      book_id uuid,
      name text NOT NULL,
      kind text NOT NULL DEFAULT 'manual',
      parent_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (book_id, name)
    );
    CREATE TABLE coaching.snippets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      book_id uuid NOT NULL,
      knowledge_chunk_id uuid,
      cluster_id uuid,
      title text NOT NULL,
      body text NOT NULL,
      tags text[] NOT NULL DEFAULT '{}',
      page int,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { Pool: MemPool } = pgmem.adapters.createPg();
  pool = new MemPool() as unknown as Pool;
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE coaching.snippets`);
  await pool.query(`TRUNCATE coaching.snippet_clusters`);
  await pool.query(`TRUNCATE coaching.books`);
  await pool.query(`TRUNCATE knowledge.chunks`);
  await pool.query(`TRUNCATE knowledge.collections`);
});

async function seedBook(name: string): Promise<string> {
  const c = await pool.query(
    `INSERT INTO knowledge.collections (name, source) VALUES ($1, 'custom') RETURNING id`,
    [name],
  );
  const b = await pool.query(
    `INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, $2, $3) RETURNING id`,
    [c.rows[0].id, name, `${name}.epub`],
  );
  return b.rows[0].id;
}

describe('coaching-db', () => {
  test('listBooks returns empty array when no books', async () => {
    const result = await cdb.listBooks(pool);
    expect(result).toEqual([]);
  });

  test('listBooks returns ingested books with chunk_count', async () => {
    await seedBook('test-book');
    const list = await cdb.listBooks(pool);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('test-book');
    expect(list[0].chunkCount).toBe(0);
  });

  test('createSnippet + listSnippets round-trips with tags', async () => {
    const bookId = await seedBook('t');
    const snippet = await cdb.createSnippet(pool, {
      bookId,
      title: 'X',
      body: 'Y',
      tags: ['reflection', 'körper'],
      page: 47,
      createdBy: 'gekko',
    });
    expect(snippet.id).toBeDefined();
    expect(snippet.tags).toEqual(['reflection', 'körper']);
    expect(snippet.page).toBe(47);

    const listed = await cdb.listSnippets(pool, { bookId });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe('X');
  });

  test('listSnippets filters by tag', async () => {
    const bookId = await seedBook('t');
    await cdb.createSnippet(pool, { bookId, title: 'A', body: '.', tags: ['a'] });
    await cdb.createSnippet(pool, { bookId, title: 'B', body: '.', tags: ['b'] });
    const filtered = await cdb.listSnippets(pool, { tag: 'a' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('A');
  });

  test('updateSnippet edits title and tags', async () => {
    const bookId = await seedBook('t');
    const s = await cdb.createSnippet(pool, { bookId, title: 'old', body: '.', tags: [] });
    const updated = await cdb.updateSnippet(pool, s.id, { title: 'new', tags: ['x'] });
    expect(updated?.title).toBe('new');
    expect(updated?.tags).toEqual(['x']);
  });

  test('deleteSnippet removes the row', async () => {
    const bookId = await seedBook('t');
    const s = await cdb.createSnippet(pool, { bookId, title: '.', body: '.', tags: [] });
    expect(await cdb.deleteSnippet(pool, s.id)).toBe(true);
    expect(await cdb.listSnippets(pool, { bookId })).toHaveLength(0);
  });

  test('createCluster + listClusters round-trips', async () => {
    const bookId = await seedBook('c');
    const cluster = await cdb.createCluster(pool, { bookId, name: 'Reflexion', kind: 'manual' });
    expect(cluster.name).toBe('Reflexion');
    expect(cluster.kind).toBe('manual');

    const clusters = await cdb.listClusters(pool, { bookId });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].snippetCount).toBe(0);
  });
});
