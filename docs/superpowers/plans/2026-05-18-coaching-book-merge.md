# Coaching Book Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge small coaching books (≤5 chunks) into coherent groups (20–30 chunks) via a shared lib, a CLI script with three modes, an admin UI page, and a POST API route.

**Architecture:** Core merge logic lives in `website/src/lib/coaching-merge.ts` and is consumed by both `scripts/coaching/merge-books.mts` (pattern + semantic + list modes) and `website/src/pages/api/admin/books/merge.ts` (manual UI). A single transaction reassigns documents + chunks to a new merged collection, deletes stale drafts, and cascades away the source books.

**Tech Stack:** TypeScript · pg (Pool) · pg-mem (tests) · vitest · Svelte 5 runes · Astro API routes · pgvector `<=>` for semantic clustering

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `website/src/lib/coaching-merge.ts` | `mergeBooks`, `proposeTitleFromBooks`, `clusterByEmbedding`, `listSmallBooks` |
| Create | `website/src/lib/coaching-merge.test.ts` | Unit tests via pg-mem |
| Create | `website/src/pages/api/admin/books/merge.ts` | POST API route (auth + validation + calls lib) |
| Create | `website/src/components/admin/BookMergePanel.svelte` | Two-panel Svelte 5 UI |
| Create | `website/src/pages/admin/knowledge/merge-books.astro` | Admin page shell |
| Modify | `website/src/layouts/AdminLayout.astro` | Add "Zusammenführen" nav item |
| Create | `scripts/coaching/merge-books.mts` | CLI: `--mode=pattern|semantic|list` |

---

## Task 1: Core merge lib — types + `listSmallBooks`

**Files:**
- Create: `website/src/lib/coaching-merge.ts`

- [ ] **Step 1: Create the file with types and `listSmallBooks`**

```ts
// website/src/lib/coaching-merge.ts
import type { Pool } from 'pg';

export interface SmallBook {
  id: string;
  title: string;
  sourceFilename: string;
  slug: string;
  chunkCount: number;
  collectionId: string;
}

export interface MergeSpec {
  title: string;
  slug: string;          // becomes collection name `coaching-<slug>`
  sourceBookIds: string[];
}

export interface MergeResult {
  mergedBookId: string;
  mergedCollectionId: string;
  chunksReassigned: number;
  draftsDeleted: number;
}

const SMALL_THRESHOLD = 5;

export async function listSmallBooks(pool: Pool): Promise<SmallBook[]> {
  const r = await pool.query(`
    SELECT b.id, b.title, b.source_filename, c.name AS collection_name,
           c.id AS collection_id, c.chunk_count
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    WHERE c.chunk_count <= $1
    ORDER BY c.chunk_count ASC, b.title ASC
  `, [SMALL_THRESHOLD]);
  return r.rows.map(row => ({
    id: row.id as string,
    title: row.title as string,
    sourceFilename: row.source_filename as string,
    slug: (row.collection_name as string).startsWith('coaching-')
      ? (row.collection_name as string).slice('coaching-'.length)
      : row.collection_name as string,
    chunkCount: row.chunk_count as number,
    collectionId: row.collection_id as string,
  }));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep coaching-merge || echo "OK"
```

Expected: no errors from `coaching-merge.ts`

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/coaching-merge.ts
git commit -m "feat(coaching): coaching-merge lib scaffold with listSmallBooks"
```

---

## Task 2: Core merge lib — `proposeTitleFromBooks` + `mergeBooks`

**Files:**
- Modify: `website/src/lib/coaching-merge.ts`

- [ ] **Step 1: Add `proposeTitleFromBooks` to the file**

Append below `listSmallBooks`:

```ts
const STOP_WORDS = new Set(['und', 'der', 'die', 'das', 'ein', 'eine', 'für', 'mit', 'von', 'zu', 'im', 'am', 'an', 'auf', 'bei', 'nach', 'seit', 'vor', 'aus', 'über', 'unter', 'the', 'and', 'for', 'with', 'of', 'in', 'a', 'an', 'to']);

export function proposeTitleFromBooks(books: Pick<SmallBook, 'title'>[]): string {
  if (books.length === 0) return 'Unbenannte Gruppe';
  if (books.length === 1) return books[0].title;

  const wordFreq = new Map<string, number>();
  for (const b of books) {
    const words = b.title.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const unique = new Set(words);
    for (const w of unique) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }

  const common = [...wordFreq.entries()]
    .filter(([, freq]) => freq >= Math.max(2, Math.floor(books.length * 0.4)))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  if (common.length === 0) return books[0].title + ' u.a.';

  const keyword = common[0].charAt(0).toUpperCase() + common[0].slice(1);
  return `${keyword} Materialien`;
}
```

- [ ] **Step 2: Add `mergeBooks` to the file**

Append below `proposeTitleFromBooks`:

```ts
export async function mergeBooks(pool: Pool, spec: MergeSpec): Promise<MergeResult> {
  if (spec.sourceBookIds.length < 2) throw new Error('At least 2 source books required');
  if (!spec.title.trim()) throw new Error('title is required');
  if (!spec.slug.trim()) throw new Error('slug is required');

  const collectionName = `coaching-${spec.slug}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve source collection IDs and validate all are ≤ SMALL_THRESHOLD
    const booksRes = await client.query(`
      SELECT b.id, c.id AS collection_id, c.chunk_count
      FROM coaching.books b
      JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE b.id = ANY($1)
    `, [spec.sourceBookIds]);

    if (booksRes.rowCount !== spec.sourceBookIds.length) {
      throw new Error('One or more source book IDs not found');
    }
    const oversized = booksRes.rows.filter(r => (r.chunk_count as number) > SMALL_THRESHOLD);
    if (oversized.length > 0) throw new Error(`Source books exceed ${SMALL_THRESHOLD}-chunk threshold: ${oversized.map(r => r.id).join(', ')}`);

    const sourceCollectionIds = booksRes.rows.map(r => r.collection_id as string);
    const totalChunks: number = booksRes.rows.reduce((s, r) => s + (r.chunk_count as number), 0);

    // 2. Create merged collection
    const colRes = await client.query(`
      INSERT INTO knowledge.collections (name, source, description, embedding_model, chunk_count)
      VALUES ($1, 'custom', $2, 'voyage-multilingual-2', $3)
      RETURNING id
    `, [collectionName, spec.title, totalChunks]);
    const mergedCollectionId: string = colRes.rows[0].id;

    // 3. Create merged book
    const bookRes = await client.query(`
      INSERT INTO coaching.books (knowledge_collection_id, title, source_filename)
      VALUES ($1, $2, 'merged')
      RETURNING id
    `, [mergedCollectionId, spec.title]);
    const mergedBookId: string = bookRes.rows[0].id;

    // 4. Move documents
    await client.query(`
      UPDATE knowledge.documents SET collection_id = $1
      WHERE collection_id = ANY($2)
    `, [mergedCollectionId, sourceCollectionIds]);

    // 5. Move chunks
    const chunksRes = await client.query(`
      UPDATE knowledge.chunks SET collection_id = $1
      WHERE collection_id = ANY($2)
    `, [mergedCollectionId, sourceCollectionIds]);
    const chunksReassigned: number = chunksRes.rowCount ?? 0;

    // 6. Delete stale drafts
    const draftsRes = await client.query(`
      DELETE FROM coaching.drafts WHERE book_id = ANY($1)
    `, [spec.sourceBookIds]);
    const draftsDeleted: number = draftsRes.rowCount ?? 0;

    // 7. Delete source books (cascades to their collections)
    await client.query(`
      DELETE FROM coaching.books WHERE id = ANY($1)
    `, [spec.sourceBookIds]);

    await client.query('COMMIT');
    return { mergedBookId, mergedCollectionId, chunksReassigned, draftsDeleted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep coaching-merge || echo "OK"
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/coaching-merge.ts
git commit -m "feat(coaching): mergeBooks + proposeTitleFromBooks in coaching-merge lib"
```

---

## Task 3: Unit tests for `coaching-merge.ts`

**Files:**
- Create: `website/src/lib/coaching-merge.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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

  pool = db.adapters.createPgPromise() as unknown as Pool;
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function seedBook(title: string, chunks: number): Promise<{ bookId: string; collectionId: string; chunkIds: string[] }> {
  const colR = await (pool as any).one(`
    INSERT INTO knowledge.collections (name, source, chunk_count)
    VALUES ('coaching-${title.toLowerCase().replace(/\s/g,'-')}', 'custom', ${chunks})
    RETURNING id
  `);
  const collectionId: string = colR.id;

  const bookR = await (pool as any).one(`
    INSERT INTO coaching.books (knowledge_collection_id, title, source_filename)
    VALUES ('${collectionId}', '${title}', '${title}.pdf')
    RETURNING id
  `);
  const bookId: string = bookR.id;

  const docR = await (pool as any).one(`
    INSERT INTO knowledge.documents (collection_id, title) VALUES ('${collectionId}', '${title}') RETURNING id
  `);
  const docId: string = docR.id;

  const chunkIds: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const cr = await (pool as any).one(`
      INSERT INTO knowledge.chunks (document_id, collection_id, position, text)
      VALUES ('${docId}', '${collectionId}', ${i}, 'chunk ${i} of ${title}')
      RETURNING id
    `);
    chunkIds.push(cr.id as string);
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
    await (pool as any).none(`
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
    const srcBooks = await (pool as any).any(`SELECT id FROM coaching.books WHERE id = ANY(ARRAY['${a.bookId}','${b.bookId}']::uuid[])`);
    expect(srcBooks).toHaveLength(0);

    // Merged book exists
    const merged = await (pool as any).one(`SELECT id FROM coaching.books WHERE id = '${result.mergedBookId}'`);
    expect(merged.id).toBe(result.mergedBookId);

    // Chunks belong to merged collection
    const chunks = await (pool as any).any(`SELECT id FROM knowledge.chunks WHERE collection_id = '${result.mergedCollectionId}'`);
    expect(chunks).toHaveLength(5);
  });

  it('throws if a source book has more than 5 chunks', async () => {
    const small = await seedBook('SmallForMerge', 1);
    const big = await seedBook('BigForMerge', 6);
    await expect(mergeBooks(pool, { title: 'Bad Merge', slug: 'bad-merge', sourceBookIds: [small.bookId, big.bookId] }))
      .rejects.toThrow('threshold');
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/coaching-merge.test.ts 2>&1 | tail -20
```

Expected: some failures (pg-mem adapter mismatch may require adjusting the `.one`/`.any` calls to use standard `pool.query`)

> **Note on pg-mem adapter:** if `db.adapters.createPgPromise()` doesn't satisfy the `Pool` interface, use `db.adapters.createPg().Client` or the `pg-mem` node-postgres adapter: `const { Pool } = db.adapters.createPg(); pool = new Pool();`  
> Pattern from `coaching-db.test.ts`: `pgmem.adapters.createPg()` — follow that exact approach.

- [ ] **Step 3: Fix adapter if needed, re-run until green**

```bash
npx vitest run src/lib/coaching-merge.test.ts
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/coaching-merge.test.ts
git commit -m "test(coaching): unit tests for coaching-merge lib"
```

---

## Task 4: `clusterByEmbedding` for semantic mode

**Files:**
- Modify: `website/src/lib/coaching-merge.ts`

- [ ] **Step 1: Add `clusterByEmbedding` below `mergeBooks`**

```ts
export async function clusterByEmbedding(
  pool: Pool,
  minSimilarity: number = 0.75,
): Promise<MergeSpec[]> {
  // Fetch all small books with their first chunk's embedding
  const r = await pool.query(`
    SELECT b.id AS book_id, b.title, c.id AS collection_id,
           (SELECT kc.embedding::text
              FROM knowledge.chunks kc
             WHERE kc.collection_id = c.id
             LIMIT 1) AS embedding
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    WHERE c.chunk_count <= $1
      AND EXISTS (
        SELECT 1 FROM knowledge.chunks kc2 WHERE kc2.collection_id = c.id
        AND kc2.embedding IS NOT NULL
      )
  `, [SMALL_THRESHOLD]);

  if (r.rows.length < 2) return [];

  // Greedy single-linkage clustering using pgvector similarity
  const clusterRes = await pool.query(`
    SELECT a.book_id AS book_a, b.book_id AS book_b,
           1 - (
             (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = a.collection_id LIMIT 1)
             <=>
             (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = b.collection_id LIMIT 1)
           ) AS similarity
    FROM (
      SELECT b.id AS book_id, c.id AS collection_id
      FROM coaching.books b JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE c.chunk_count <= $1
    ) a
    CROSS JOIN (
      SELECT b.id AS book_id, c.id AS collection_id
      FROM coaching.books b JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
      WHERE c.chunk_count <= $1
    ) b
    WHERE a.book_id < b.book_id
    HAVING 1 - (
      (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = a.collection_id LIMIT 1)
      <=>
      (SELECT kc.embedding FROM knowledge.chunks kc WHERE kc.collection_id = b.collection_id LIMIT 1)
    ) >= $2
    ORDER BY similarity DESC
  `, [SMALL_THRESHOLD, minSimilarity]);

  // Union-find clustering
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (x: string, y: string) => parent.set(find(x), find(y));

  for (const row of clusterRes.rows) {
    union(row.book_a as string, row.book_b as string);
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const row of r.rows) {
    const root = find(row.book_id as string);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(row.book_id as string);
  }

  const bookMap = new Map(r.rows.map(row => [row.book_id as string, row.title as string]));
  const specs: MergeSpec[] = [];
  for (const [, bookIds] of groups) {
    if (bookIds.length < 2) continue;
    const books = bookIds.map(id => ({ title: bookMap.get(id) ?? id }));
    const title = proposeTitleFromBooks(books);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    specs.push({ title, slug, sourceBookIds: bookIds });
  }
  return specs;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep coaching-merge || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/coaching-merge.ts
git commit -m "feat(coaching): clusterByEmbedding semantic clustering in coaching-merge"
```

---

## Task 5: API route `POST /api/admin/books/merge`

**Files:**
- Create: `website/src/pages/api/admin/books/merge.ts`

- [ ] **Step 1: Create the API route**

```ts
// website/src/pages/api/admin/books/merge.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { mergeBooks, listSmallBooks } from '../../../../lib/coaching-merge';
import type { MergeSpec } from '../../../../lib/coaching-merge';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const books = await listSmallBooks(pool);
    return new Response(JSON.stringify({ books }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let spec: MergeSpec;
  try {
    spec = await request.json() as MergeSpec;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!spec.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });
  }
  if (!spec.slug?.trim()) {
    return new Response(JSON.stringify({ error: 'slug is required' }), { status: 400 });
  }
  if (!Array.isArray(spec.sourceBookIds) || spec.sourceBookIds.length < 2) {
    return new Response(JSON.stringify({ error: 'At least 2 sourceBookIds required' }), { status: 400 });
  }

  try {
    const result = await mergeBooks(pool, spec);
    return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = String(err);
    const status = msg.includes('not found') || msg.includes('threshold') ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), { status });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep "api/admin/books/merge" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/books/merge.ts
git commit -m "feat(coaching): POST /api/admin/books/merge API route"
```

---

## Task 6: `BookMergePanel.svelte` — two-panel UI

**Files:**
- Create: `website/src/components/admin/BookMergePanel.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/admin/BookMergePanel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type SmallBook = { id: string; title: string; chunkCount: number; slug: string };

  let books: SmallBook[] = $state([]);
  let selected = $state(new Set<string>());
  let title = $state('');
  let slug = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let newSlug = $state<string | null>(null);

  onMount(async () => {
    const res = await fetch('/api/admin/books/merge');
    if (res.ok) {
      const data = await res.json() as { books: SmallBook[] };
      books = data.books;
    }
  });

  function toggleBook(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;

    if (next.size >= 2) {
      const sel = books.filter(b => next.has(b.id));
      title = proposeTitle(sel);
      slug = titleToSlug(title);
    }
  }

  function toggleAll() {
    selected = selected.size === books.length ? new Set() : new Set(books.map(b => b.id));
    if (selected.size >= 2) {
      const sel = books.filter(b => selected.has(b.id));
      title = proposeTitle(sel);
      slug = titleToSlug(title);
    }
  }

  function proposeTitle(sel: SmallBook[]): string {
    if (sel.length === 0) return '';
    const freq = new Map<string, number>();
    const stop = new Set(['und','der','die','das','ein','eine','für','mit','von']);
    for (const b of sel) {
      const words = b.title.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2 && !stop.has(w));
      for (const w of new Set(words)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const common = [...freq.entries()].filter(([,f]) => f >= Math.max(2, Math.floor(sel.length * 0.4))).sort((a,b) => b[1]-a[1]);
    if (common.length === 0) return sel[0].title + ' u.a.';
    const kw = common[0][0];
    return kw.charAt(0).toUpperCase() + kw.slice(1) + ' Materialien';
  }

  function titleToSlug(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  $effect(() => { slug = titleToSlug(title); });

  const selectedBooks = $derived(books.filter(b => selected.has(b.id)));
  const totalChunks = $derived(selectedBooks.reduce((s, b) => s + b.chunkCount, 0));
  const canMerge = $derived(!busy && selected.size >= 2 && !!title.trim() && !!slug.trim());

  async function merge() {
    busy = true; error = null; successMsg = null; newSlug = null;
    try {
      const res = await fetch('/api/admin/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), slug: slug.trim(), sourceBookIds: [...selected] }),
      });
      const data = await res.json() as { error?: string; mergedBookId?: string };
      if (!res.ok) { error = data.error ?? 'Fehler'; return; }
      newSlug = slug.trim();
      successMsg = `"${title}" erstellt — ${totalChunks} Chunks übertragen.`;
      // Remove merged books from list
      const gone = new Set(selected);
      books = books.filter(b => !gone.has(b.id));
      selected = new Set();
      title = '';
      slug = '';
    } catch {
      error = 'Netzwerkfehler';
    } finally {
      busy = false;
    }
  }
</script>

<div class="merge-panel">
  <div class="left">
    <div class="panel-head">
      <h2>Kleine Bücher</h2>
      <button class="btn-ghost" onclick={toggleAll}>
        {selected.size === books.length && books.length > 0 ? 'Keine' : 'Alle'}
      </button>
    </div>
    {#if books.length === 0}
      <p class="empty">Keine Bücher mit ≤5 Chunks.</p>
    {:else}
      <ul class="book-list">
        {#each books as book (book.id)}
          <li class="book-row" class:selected={selected.has(book.id)}>
            <label>
              <input type="checkbox" checked={selected.has(book.id)} onchange={() => toggleBook(book.id)} />
              <span class="book-title">{book.title}</span>
              <span class="chunk-badge">{book.chunkCount}</span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="right" class:active={selected.size >= 2}>
    <h2>Neue Gruppe</h2>
    {#if selected.size < 2}
      <p class="hint">Wähle mindestens 2 Bücher aus.</p>
    {:else}
      <div class="form">
        <label class="field">
          <span>Titel</span>
          <input type="text" bind:value={title} placeholder="Gruppenname" />
        </label>
        <label class="field">
          <span>Slug</span>
          <input type="text" bind:value={slug} placeholder="slug-der-gruppe" />
        </label>
        <p class="summary">
          {selected.size} Bücher · {totalChunks} Chunks gesamt
        </p>
        {#if error}<p class="err">{error}</p>{/if}
        {#if successMsg}
          <p class="success">
            ✓ {successMsg}
            {#if newSlug}
              <a href="/admin/knowledge/books">Zu den Büchern →</a>
            {/if}
          </p>
        {/if}
        <button class="btn-danger" disabled={!canMerge} onclick={merge}>
          {busy ? 'Läuft…' : 'Zusammenführen'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .merge-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .book-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .book-row label { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; border-radius: 4px; cursor: pointer; }
  .book-row:hover label { background: var(--color-surface-2, #f5f5f5); }
  .book-row.selected label { background: var(--color-accent-subtle, #e8f0fe); }
  .book-title { flex: 1; font-size: 0.875rem; }
  .chunk-badge { font-size: 0.75rem; color: var(--color-text-muted, #666); background: var(--color-surface-3, #eee); padding: 0 0.4rem; border-radius: 999px; }
  .right { opacity: 0.4; transition: opacity 0.15s; }
  .right.active { opacity: 1; }
  .form { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
  .field input { padding: 0.4rem 0.5rem; border: 1px solid var(--color-border, #ddd); border-radius: 4px; }
  .summary { font-size: 0.8rem; color: var(--color-text-muted, #666); }
  .btn-danger { background: #c0392b; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-weight: 600; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: none; border: 1px solid var(--color-border, #ddd); padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
  .err { color: #c0392b; font-size: 0.85rem; }
  .success { color: #27ae60; font-size: 0.85rem; }
  .empty, .hint { color: var(--color-text-muted, #666); font-size: 0.875rem; }
  @media (max-width: 700px) { .merge-panel { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep BookMergePanel || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/BookMergePanel.svelte
git commit -m "feat(coaching): BookMergePanel two-panel merge UI component"
```

---

## Task 7: Admin page + sidebar nav

**Files:**
- Create: `website/src/pages/admin/knowledge/merge-books.astro`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Create the admin page**

```astro
---
// website/src/pages/admin/knowledge/merge-books.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import BookMergePanel from '../../../components/admin/BookMergePanel.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---
<AdminLayout title="Bücher zusammenführen">
  <div class="page">
    <header class="page-head">
      <nav class="crumbs">
        <a href="/admin">Admin</a>
        <span class="sep">›</span>
        <a href="/admin/wissensquellen">Wissen</a>
        <span class="sep">›</span>
        Zusammenführen
      </nav>
      <h1>Bücher zusammenführen</h1>
      <p class="subtitle">Kleine Bücher (≤5 Chunks) zu thematischen Gruppen (20–30 Chunks) zusammenfassen.</p>
    </header>
    <BookMergePanel client:load />
  </div>
</AdminLayout>
```

- [ ] **Step 2: Add nav item to AdminLayout**

In `website/src/layouts/AdminLayout.astro`, find the line:
```
{ href: '/admin/knowledge/drafts', label: 'Drafts', icon: 'edit', matches: [...], badge: draftsPending },
```

Add after it:
```ts
{ href: '/admin/knowledge/merge-books', label: 'Zusammenführen', icon: 'merge', matches: ['/admin/knowledge/merge-books'] },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "merge-books|AdminLayout" || echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/knowledge/merge-books.astro website/src/layouts/AdminLayout.astro
git commit -m "feat(coaching): /admin/knowledge/merge-books page + sidebar nav"
```

---

## Task 8: CLI script `merge-books.mts`

**Files:**
- Create: `scripts/coaching/merge-books.mts`

- [ ] **Step 1: Create the script**

```ts
#!/usr/bin/env tsx
// scripts/coaching/merge-books.mts
import { Pool } from 'pg';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  listSmallBooks,
  proposeTitleFromBooks,
  mergeBooks,
  clusterByEmbedding,
} from '../../website/src/lib/coaching-merge.ts';

interface Flags {
  mode: 'pattern' | 'semantic' | 'list';
  pattern?: string;
  minSimilarity: number;
  yes: boolean;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { mode: 'list', minSimilarity: 0.75, yes: false };
  for (const arg of args) {
    if (arg.startsWith('--mode=')) flags.mode = arg.slice(7) as Flags['mode'];
    if (arg.startsWith('--pattern=')) flags.pattern = arg.slice(10);
    if (arg.startsWith('--min-similarity=')) flags.minSimilarity = parseFloat(arg.slice(17));
    if (arg === '--yes') flags.yes = true;
  }
  return flags;
}

function slugify(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function confirm(rl: readline.Interface, spec: { title: string; slug: string; sourceBookIds: string[] }, books: { id: string; title: string; chunkCount: number }[], yes: boolean): Promise<{ title: string; slug: string } | null> {
  const totalChunks = books.filter(b => spec.sourceBookIds.includes(b.id)).reduce((s, b) => s + b.chunkCount, 0);
  console.log(`\nProposed merge: "${spec.title}"  [slug: ${spec.slug}]`);
  console.log(`  Sources (${spec.sourceBookIds.length} books, ${totalChunks} chunks total):`);
  for (const id of spec.sourceBookIds) {
    const b = books.find(bk => bk.id === id);
    if (b) console.log(`    ${b.title} (${b.chunkCount} chunk${b.chunkCount === 1 ? '' : 's'})`);
  }
  console.log(`  ✎ Proposed title: "${spec.title}"  — accept? [Y/n/rename]`);

  if (yes) { console.log('  → --yes: auto-accepting'); return { title: spec.title, slug: spec.slug }; }

  const answer = (await rl.question('  > ')).trim().toLowerCase();
  if (answer === 'n') return null;
  if (answer === 'rename') {
    const newTitle = (await rl.question('  New title: ')).trim();
    if (!newTitle) return null;
    return { title: newTitle, slug: slugify(newTitle) };
  }
  return { title: spec.title, slug: spec.slug };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const pool = new Pool();
  const rl = readline.createInterface({ input, output });

  try {
    const allSmall = await listSmallBooks(pool);

    if (flags.mode === 'list') {
      console.log(`Small books (≤5 chunks): ${allSmall.length}`);
      for (const b of allSmall) {
        console.log(`  [${b.chunkCount}] ${b.title}  (id=${b.id})`);
      }
      return;
    }

    let specs: { title: string; slug: string; sourceBookIds: string[] }[] = [];

    if (flags.mode === 'pattern') {
      if (!flags.pattern) { console.error('--pattern=<keyword> required'); process.exit(1); }
      const pat = flags.pattern.toLowerCase();
      const matched = allSmall.filter(b =>
        b.title.toLowerCase().includes(pat) || b.sourceFilename.toLowerCase().includes(pat)
      );
      if (matched.length < 2) { console.log(`Only ${matched.length} books match "${flags.pattern}" — need ≥2`); return; }
      const title = proposeTitleFromBooks(matched);
      specs = [{ title, slug: slugify(title), sourceBookIds: matched.map(b => b.id) }];
    }

    if (flags.mode === 'semantic') {
      specs = await clusterByEmbedding(pool, flags.minSimilarity);
      if (specs.length === 0) { console.log('No clusters found at the given similarity threshold.'); return; }
    }

    for (const spec of specs) {
      const confirmed = await confirm(rl, spec, allSmall, flags.yes);
      if (!confirmed) { console.log('  → skipped\n'); continue; }
      console.log(`  → merging…`);
      const result = await mergeBooks(pool, { ...spec, ...confirmed });
      console.log(`  ✓ merged: ${result.chunksReassigned} chunks, ${result.draftsDeleted} drafts deleted`);
      console.log(`  → classify: npx tsx scripts/coaching/classify-book.mts --slug=${confirmed.slug} --delay-ms=200\n`);
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Test list mode against live DB (port-forward must be running)**

```bash
cd /home/patrick/Bachelorprojekt
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=website PGPASSWORD="32scWW79HVwE1THXiiT32Aa" PGDATABASE=website \
  npx tsx scripts/coaching/merge-books.mts --mode=list 2>&1 | head -20
```

Expected: list of books with chunk counts

- [ ] **Step 3: Dry-run pattern mode (no `--yes` → will prompt)**

```bash
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=website PGPASSWORD="32scWW79HVwE1THXiiT32Aa" PGDATABASE=website \
  npx tsx scripts/coaching/merge-books.mts --mode=pattern --pattern=block4
```

Expected: preview output showing matched books + title proposal + prompt

- [ ] **Step 4: Commit**

```bash
git add scripts/coaching/merge-books.mts
git commit -m "feat(coaching): merge-books.mts CLI — pattern/semantic/list modes"
```

---

## Task 9: End-to-end smoke test + dev-flow finish

- [ ] **Step 1: Run the full test suite to confirm no regressions**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/coaching-merge.test.ts src/lib/coaching-db.test.ts 2>&1 | tail -15
```

Expected: all PASS

- [ ] **Step 2: Verify the admin page compiles (Astro check)**

```bash
cd /home/patrick/Bachelorprojekt/website
npx astro check 2>&1 | grep -E "error|merge-books" | head -10 || echo "OK"
```

- [ ] **Step 3: Execute a real pattern merge against the live DB**

```bash
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=website PGPASSWORD="32scWW79HVwE1THXiiT32Aa" PGDATABASE=website \
  npx tsx scripts/coaching/merge-books.mts --mode=pattern --pattern=block4 --yes
```

Expected: preview + "merged: N chunks, M drafts deleted"

- [ ] **Step 4: Invoke finishing-a-development-branch skill**

```bash
# Invoke: superpowers:finishing-a-development-branch
```
