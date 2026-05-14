import { describe, test, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import * as cdb from './coaching-db';
import {
  insertDraft,
  listDrafts,
  acceptDraft,
  rejectDraft,
  acceptanceRateByBook,
} from './coaching-db';

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
      created_from_draft uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE coaching.drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      book_id uuid NOT NULL,
      knowledge_chunk_id uuid NOT NULL,
      template_kind text NOT NULL,
      suggested_payload jsonb NOT NULL,
      classifier_model text NOT NULL,
      classifier_version text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      reviewed_by text,
      reviewed_at timestamptz,
      reject_reason text,
      resulting_snippet_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (knowledge_chunk_id, classifier_version)
    );
    CREATE TABLE coaching.templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      snippet_id uuid NOT NULL,
      target_surface text NOT NULL,
      version int NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'draft',
      payload jsonb NOT NULL DEFAULT '{}',
      source_pointer jsonb NOT NULL,
      surface_ref text,
      published_at timestamptz,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE coaching.template_assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id uuid NOT NULL,
      template_version int NOT NULL,
      client_id text NOT NULL,
      surface_specific_id text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { Pool: MemPool } = pgmem.adapters.createPg();
  pool = new MemPool() as unknown as Pool;
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE coaching.template_assignments`);
  await pool.query(`TRUNCATE coaching.templates`);
  await pool.query(`TRUNCATE coaching.drafts`);
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

describe('coaching-db: templates', () => {
  async function seedSnippet(): Promise<{ snippetId: string; bookId: string; chunkId: string }> {
    const c = await pool.query(`INSERT INTO knowledge.collections (name, source) VALUES ('t', 'custom') RETURNING id`);
    const b = await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 't', 't.epub') RETURNING id`,
      [c.rows[0].id],
    );
    const k = await pool.query(
      `INSERT INTO knowledge.chunks (document_id, collection_id, position, text) VALUES ('00000000-0000-0000-0000-000000000000', $1, 0, 't') RETURNING id`,
      [c.rows[0].id],
    );
    const s = await cdb.createSnippet(pool, {
      bookId: b.rows[0].id, title: 'X', body: 'Y', tags: [], page: 7, knowledgeChunkId: k.rows[0].id,
    });
    return { snippetId: s.id, bookId: b.rows[0].id, chunkId: k.rows[0].id };
  }

  test('createTemplateDraft starts at version 1', async () => {
    const { snippetId, bookId, chunkId } = await seedSnippet();
    const t = await cdb.createTemplateDraft(pool, {
      snippetId,
      targetSurface: 'questionnaire',
      payload: { title: 'Q1', question: 'Wann ...?' },
      sourcePointer: { bookId, page: 7, chunkId },
    });
    expect(t.version).toBe(1);
    expect(t.status).toBe('draft');
    expect(t.payload.title).toBe('Q1');
    expect(t.sourcePointer.page).toBe(7);
  });

  test('createTemplateDraft increments version per (snippet, surface)', async () => {
    const { snippetId, bookId, chunkId } = await seedSnippet();
    await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'questionnaire', payload: {}, sourcePointer: { bookId, page: 1, chunkId } });
    const t2 = await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'questionnaire', payload: {}, sourcePointer: { bookId, page: 1, chunkId } });
    expect(t2.version).toBe(2);

    const t3 = await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'assistant', payload: {}, sourcePointer: { bookId, page: 1, chunkId } });
    expect(t3.version).toBe(1);
  });

  test('updateTemplate replaces payload', async () => {
    const { snippetId, bookId, chunkId } = await seedSnippet();
    const t = await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'assistant', payload: { body: 'old' }, sourcePointer: { bookId, page: 1, chunkId } });
    const u = await cdb.updateTemplate(pool, t.id, { payload: { body: 'new' } });
    expect(u?.payload.body).toBe('new');
  });

  test('listTemplates filters by surface and latestOnly', async () => {
    const { snippetId, bookId, chunkId } = await seedSnippet();
    await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'questionnaire', payload: { v: 1 }, sourcePointer: { bookId, page: 1, chunkId } });
    await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'questionnaire', payload: { v: 2 }, sourcePointer: { bookId, page: 1, chunkId } });
    await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'brett', payload: {}, sourcePointer: { bookId, page: 1, chunkId } });

    const all = await cdb.listTemplates(pool, { targetSurface: 'questionnaire' });
    expect(all).toHaveLength(2);

    const latest = await cdb.listTemplates(pool, { targetSurface: 'questionnaire', latestOnly: true });
    expect(latest).toHaveLength(1);
    expect((latest[0].payload as { v: number }).v).toBe(2);
  });

  test('markTemplatePublished sets status + surface_ref + published_at', async () => {
    const { snippetId, bookId, chunkId } = await seedSnippet();
    const t = await cdb.createTemplateDraft(pool, { snippetId, targetSurface: 'questionnaire', payload: {}, sourcePointer: { bookId, page: 1, chunkId } });
    const p = await cdb.markTemplatePublished(pool, t.id, 'qt-123');
    expect(p?.status).toBe('published');
    expect(p?.surfaceRef).toBe('qt-123');
    expect(p?.publishedAt).toBeInstanceOf(Date);
  });
});

async function seedBookAndChunk(): Promise<{ pool: Pool; bookId: string; chunkId: string }> {
  const c = await pool.query(
    `INSERT INTO knowledge.collections (name, source) VALUES ('draft-book', 'custom') RETURNING id`,
  );
  const collectionId = c.rows[0].id as string;
  const b = await pool.query(
    `INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 'draft-book', 'draft-book.epub') RETURNING id`,
    [collectionId],
  );
  const k = await pool.query(
    `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, metadata)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 0, 'verbatim chunk text', '{"page":42}'::jsonb)
     RETURNING id`,
    [collectionId],
  );
  return { pool, bookId: b.rows[0].id as string, chunkId: k.rows[0].id as string };
}

describe('drafts (Phase 3)', () => {
  it('insertDraft is idempotent on (chunk, classifier_version)', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const a = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'T', question: 'Q?', follow_up: null },
      classifierModel: 'haiku',
      classifierVersion: 'v1',
    });
    const b = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'T2', question: 'Q2?', follow_up: null },
      classifierModel: 'haiku',
      classifierVersion: 'v1',
    });
    expect(a.id).toBe(b.id);
    expect((b.suggestedPayload as { title: string }).title).toBe('T'); // first write wins
  });

  it('listDrafts filters by book + kind + status', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'x', question: 'y' },
      classifierModel: 'm',
      classifierVersion: 'v1',
    });
    const open = await listDrafts(pool, { bookId, status: 'open' });
    expect(open).toHaveLength(1);
    const exercises = await listDrafts(pool, { bookId, templateKind: 'exercise' });
    expect(exercises).toHaveLength(0);
  });

  it('acceptDraft writes snippet + flips status atomically', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'Selbstwahrnehmung', question: 'Was bemerkst du?', follow_up: null },
      classifierModel: 'haiku',
      classifierVersion: 'v1',
    });
    const r = await acceptDraft(pool, d.id, { reviewedBy: 'gekko@mentolder.de' });
    expect(r.draft.status).toBe('accepted');
    expect(r.draft.resultingSnippetId).toBe(r.snippetId);
    const snippet = (
      await pool.query(`SELECT * FROM coaching.snippets WHERE id=$1`, [r.snippetId])
    ).rows[0];
    expect(snippet.title).toBe('Selbstwahrnehmung');
    expect(snippet.created_from_draft).toBe(d.id);
  });

  it('acceptDraft rejects double-accept', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'T', question: 'Q?' },
      classifierModel: 'm',
      classifierVersion: 'v1',
    });
    await acceptDraft(pool, d.id, { reviewedBy: 'gekko' });
    await expect(acceptDraft(pool, d.id, { reviewedBy: 'gekko' })).rejects.toThrow(/not open/);
  });

  it('rejectDraft sets reason and is idempotent (returns row only first time)', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'T', question: 'Q?' },
      classifierModel: 'm',
      classifierVersion: 'v1',
    });
    const out = await rejectDraft(pool, d.id, 'gekko', 'nicht relevant');
    expect(out.status).toBe('rejected');
    expect(out.rejectReason).toBe('nicht relevant');
    await expect(rejectDraft(pool, d.id, 'gekko')).rejects.toThrow();
  });

  it('acceptanceRateByBook computes correctly', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const a = await insertDraft(pool, {
      bookId,
      knowledgeChunkId: chunkId,
      templateKind: 'reflection',
      suggestedPayload: { title: 'a', question: 'q?' },
      classifierModel: 'm',
      classifierVersion: 'v1',
    });
    await acceptDraft(pool, a.id, { reviewedBy: 'gekko' });
    const rate = await acceptanceRateByBook(pool, bookId);
    expect(rate.accepted).toBe(1);
    expect(rate.acceptanceRate).toBe(1);
  });
});
