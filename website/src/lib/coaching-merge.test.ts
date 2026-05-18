// website/src/lib/coaching-merge.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { mergeBooks, proposeTitleFromBooks, listSmallBooks } from './coaching-merge';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  db.public.none(`
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text,
      source text NOT NULL,
      chunk_count int NOT NULL DEFAULT 0,
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      brand text, last_indexed_at timestamptz, created_by uuid, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE knowledge.documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id uuid NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
      title text, source_url text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE knowledge.chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES knowledge.documents(id) ON DELETE CASCADE,
      collection_id uuid NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
      position int NOT NULL,
      text text NOT NULL,
      embedding text,
      metadata jsonb DEFAULT '{}'
    );
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.books (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_collection_id uuid NOT NULL UNIQUE REFERENCES knowledge.collections(id) ON DELETE CASCADE,
      title text NOT NULL,
      author text,
      source_filename text NOT NULL,
      license_note text,
      ingested_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE coaching.drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      book_id uuid NOT NULL REFERENCES coaching.books(id) ON DELETE CASCADE,
      knowledge_chunk_id uuid NOT NULL REFERENCES knowledge.chunks(id) ON DELETE CASCADE,
      template_kind text NOT NULL,
      suggested_payload jsonb NOT NULL DEFAULT '{}',
      classifier_model text NOT NULL DEFAULT 'test',
      classifier_version text NOT NULL DEFAULT 'v1',
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { Pool: MemPool } = db.adapters.createPg();
  pool = new MemPool() as unknown as Pool;
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function seedBook(title: string, chunks: number): Promise<{ bookId: string; collectionId: string; chunkIds: string[] }> {
  const colR = await pool.query(`
    INSERT INTO knowledge.collections (name, source, chunk_count)
    VALUES ('coaching-${title.toLowerCase().replace(/\s/g,'-')}', 'custom', ${chunks})
    RETURNING id
  `);
  const collectionId: string = colR.rows[0].id;

  const bookR = await pool.query(`
    INSERT INTO coaching.books (knowledge_collection_id, title, source_filename)
    VALUES ('${collectionId}', '${title}', '${title}.pdf')
    RETURNING id
  `);
  const bookId: string = bookR.rows[0].id;

  const docR = await pool.query(`
    INSERT INTO knowledge.documents (collection_id, title) VALUES ('${collectionId}', '${title}') RETURNING id
  `);
  const docId: string = docR.rows[0].id;

  const chunkIds: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const cr = await pool.query(`
      INSERT INTO knowledge.chunks (document_id, collection_id, position, text)
      VALUES ('${docId}', '${collectionId}', ${i}, 'chunk ${i} of ${title}')
      RETURNING id
    `);
    chunkIds.push(cr.rows[0].id as string);
  }

  return { bookId, collectionId, chunkIds };
}

// ── proposeTitleFromBooks ─────────────────────────────────────────────────────

describe('proposeTitleFromBooks', () => {
  it('returns single book title unchanged', () => {
    expect(proposeTitleFromBooks([{ title: 'Block 4 Übung' }])).toBe('Block 4 Übung');
  });

  it('extracts common keyword from multiple books', () => {
    const result = proposeTitleFromBooks([
      { title: 'block4 übung1' },
      { title: 'block4 übung2' },
      { title: 'block4 welle' },
    ]);
    expect(result.toLowerCase()).toContain('block4');
  });

  it('falls back to first title + u.a. when no common word', () => {
    const result = proposeTitleFromBooks([
      { title: 'Dreieck' },
      { title: 'Mediation' },
    ]);
    expect(result).toMatch(/Dreieck|u\.a\./);
  });
});

// ── listSmallBooks ────────────────────────────────────────────────────────────

describe('listSmallBooks', () => {
  it('returns only books with chunk_count <= 5', async () => {
    await seedBook('TinyBook', 1);
    await seedBook('BigBook', 10);
    const result = await listSmallBooks(pool);
    expect(result.some(b => b.title === 'TinyBook')).toBe(true);
    expect(result.some(b => b.title === 'BigBook')).toBe(false);
  });
});

// ── mergeBooks ────────────────────────────────────────────────────────────────

describe('mergeBooks', () => {
  it('throws if fewer than 2 source books', async () => {
    const { bookId } = await seedBook('Solo', 1);
    await expect(mergeBooks(pool, { title: 'Test', slug: 'test-solo', sourceBookIds: [bookId] }))
      .rejects.toThrow('At least 2 source books required');
  });

  it('merges two books: reassigns chunks, deletes drafts, removes sources', async () => {
    const a = await seedBook('MergeA', 2);
    const b = await seedBook('MergeB', 3);

    // Seed a draft on book A
    await pool.query(`
      INSERT INTO coaching.drafts (book_id, knowledge_chunk_id, template_kind, suggested_payload)
      VALUES ('${a.bookId}', '${a.chunkIds[0]}', 'reflection', '{}')
    `);

    const result = await mergeBooks(pool, {
      title: 'Merged AB',
      slug: 'merged-ab',
      sourceBookIds: [a.bookId, b.bookId],
    });

    expect(result.chunksReassigned).toBe(5);
    expect(result.draftsDeleted).toBe(1);

    // Source books gone
    const srcBooks = await pool.query(`SELECT id FROM coaching.books WHERE id = ANY(ARRAY['${a.bookId}','${b.bookId}']::uuid[])`);
    expect(srcBooks.rows).toHaveLength(0);

    // Merged book exists
    const merged = await pool.query(`SELECT id FROM coaching.books WHERE id = '${result.mergedBookId}'`);
    expect(merged.rows[0].id).toBe(result.mergedBookId);

    // Chunks belong to merged collection
    const chunks = await pool.query(`SELECT id FROM knowledge.chunks WHERE collection_id = '${result.mergedCollectionId}'`);
    expect(chunks.rows).toHaveLength(5);
  });

  it('throws if a source book has more than 5 chunks', async () => {
    const small = await seedBook('SmallForMerge', 1);
    const big = await seedBook('BigForMerge', 6);
    await expect(mergeBooks(pool, { title: 'Bad Merge', slug: 'bad-merge', sourceBookIds: [small.bookId, big.bookId] }))
      .rejects.toThrow('threshold');
  });
});