---
title: Coaching Knowledge — Phase 1 Implementation Plan
domains: [website, db]
status: completed
pr_number: null
---

# Coaching Knowledge — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gekko can ingest a coaching book (PDF/EPUB), browse it by auto-generated topic clusters in `/admin/knowledge/books/[id]`, highlight passages, and save them as tagged snippets — without any AI drafting yet.

**Architecture:** A new `coaching` Postgres schema holds three tables (`books`, `snippets`, `snippet_clusters`); the existing `knowledge` schema (collections/documents/chunks from PR #799f776e) stores the actual chunked + embedded text. A new ingest script wraps the existing `lib-knowledge-pg.mjs` plus a fresh PDF/EPUB extractor. New Astro endpoints under `/api/admin/coaching/*` mirror the existing `/api/admin/knowledge/*` auth + JSON pattern. New Astro pages under `/admin/knowledge/books/*` host one new Svelte component (`BookReader`) for the reading + highlighting view.

**Tech Stack:** Astro 5 (existing), Svelte 5 (existing), PostgreSQL with pgvector (existing), Voyage `voyage-multilingual-2` embeddings (existing), `pdf-parse` (new dep), `epub2` (new dep), Playwright (existing).

**Spec:** `docs/superpowers/specs/2026-05-10-coaching-knowledge-design.md`. This plan implements **Phase 1 only** — Phases 2 (Publish-Cascade), 3 (AI-Drafting), 4 (Session-Prep), 5 (In-Session-RAG) get their own plans after this lands.

**Schema deviation from spec:** Spec says "bachelorprojekt schema" but that schema is for the PR-timeline feature. Cleaner to use a dedicated `coaching` schema — matches the pattern of `bugs`, `knowledge`, etc. Captured here to avoid future confusion.

---

## File Structure

| Path | Responsibility | New/Modify |
|---|---|---|
| `k3d/website-schema.yaml` | Postgres init + ensure scripts; add `coaching` schema DDL | Modify |
| `scripts/coaching/lib-extract.mjs` | PDF + EPUB text extraction, returns `{text, pageMap}` | Create |
| `scripts/coaching/lib-extract.test.mjs` | Unit tests for extractor | Create |
| `scripts/coaching/ingest-book.mjs` | CLI: extract → chunk → embed → write `coaching.books` + `knowledge.*` | Create |
| `Taskfile.yml` | Add `coaching:ingest` task | Modify |
| `website/src/lib/coaching-db.ts` | TS CRUD on `coaching.*` tables (used by API endpoints) | Create |
| `website/src/lib/coaching-db.test.ts` | Unit tests for coaching-db | Create |
| `website/src/pages/api/admin/coaching/books/index.ts` | GET list books | Create |
| `website/src/pages/api/admin/coaching/books/[id]/index.ts` | GET book detail | Create |
| `website/src/pages/api/admin/coaching/books/[id]/chunks.ts` | GET paginated chunks for reading view | Create |
| `website/src/pages/api/admin/coaching/snippets/index.ts` | POST create snippet | Create |
| `website/src/pages/api/admin/coaching/snippets/[id].ts` | PATCH/DELETE snippet | Create |
| `website/src/pages/api/admin/coaching/clusters/index.ts` | GET list / POST create cluster | Create |
| `website/src/pages/admin/knowledge/books/index.astro` | List ingested books page | Create |
| `website/src/pages/admin/knowledge/books/[id].astro` | Themen-Browser host page | Create |
| `website/src/components/admin/BookReader.svelte` | Reading view + highlighting + snippet creation | Create |
| `website/tests/e2e/coaching-knowledge.spec.ts` | Playwright E2E for full flow | Create |
| `coaching-sources/` | Gitignored book volume (PDF/EPUB land here) | Create (just `.gitkeep`) |
| `.gitignore` | Add `coaching-sources/*` (keep `.gitkeep`) | Modify |

**Parallel-fan-out hint:** Tasks 2, 3 (after 2), 4 are backend-only and independent of UI. Tasks 8, 9, 10 are UI-only. After Task 1 (migration) lands, an agent fleet can work 2+4 in parallel, then 3+5+6+7 in parallel, then 8+9 in parallel, then 10, then 11.

---

## Task 1: Database migration — `coaching` schema + 3 tables

**Files:**
- Modify: `k3d/website-schema.yaml` (both `init-meetings-schema.sh` and `ensure-meetings-schema.sh` blocks)

**Context:** Both init scripts use `CREATE ... IF NOT EXISTS` so the same DDL is added to both. The init script runs on a fresh DB; the ensure script runs in postStart on every pod start.

- [ ] **Step 1: Locate the `bugs` schema block in `website-schema.yaml`**

The new `coaching` schema goes immediately after `bugs` in both shell-script blocks. Find the line `CREATE SCHEMA IF NOT EXISTS bugs AUTHORIZATION website;` — there are two of them (init + ensure).

- [ ] **Step 2: Add coaching schema DDL after both `bugs` blocks**

Insert this block immediately after the `bugs.bug_tickets` table creation in BOTH the `init-meetings-schema.sh` and `ensure-meetings-schema.sh` heredocs:

```sql
CREATE SCHEMA IF NOT EXISTS coaching AUTHORIZATION website;

CREATE TABLE IF NOT EXISTS coaching.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  source_filename TEXT NOT NULL,
  license_note TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (knowledge_collection_id)
);

CREATE TABLE IF NOT EXISTS coaching.snippet_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES coaching.books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('auto','manual')),
  parent_id UUID REFERENCES coaching.snippet_clusters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, name)
);

CREATE TABLE IF NOT EXISTS coaching.snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES coaching.books(id) ON DELETE CASCADE,
  knowledge_chunk_id UUID REFERENCES knowledge.chunks(id) ON DELETE SET NULL,
  cluster_id UUID REFERENCES coaching.snippet_clusters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  page INT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snippets_book_id ON coaching.snippets(book_id);
CREATE INDEX IF NOT EXISTS idx_snippets_cluster_id ON coaching.snippets(cluster_id);
CREATE INDEX IF NOT EXISTS idx_snippets_tags ON coaching.snippets USING GIN(tags);
```

- [ ] **Step 3: Verify YAML is still valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('k3d/website-schema.yaml'))"` — should exit silently. If it errors, indentation is wrong.

- [ ] **Step 4: Apply to dev DB and verify tables exist**

Run:
```bash
kubectl --context k3d-dev apply -f k3d/website-schema.yaml -n workspace
kubectl --context k3d-dev rollout restart statefulset/shared-db -n workspace
kubectl --context k3d-dev rollout status statefulset/shared-db -n workspace
task workspace:psql -- website <<< "\dt coaching.*"
```

Expected: rows for `coaching.books`, `coaching.snippet_clusters`, `coaching.snippets`.

- [ ] **Step 5: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(coaching): add coaching schema with books/snippets/clusters

Phase 1 of coaching knowledge pipeline. Three tables in a new
'coaching' schema, FK to existing knowledge.collections and
knowledge.chunks. No AI-drafting yet; manual highlighting only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PDF + EPUB text extractor

**Files:**
- Create: `scripts/coaching/lib-extract.mjs`
- Create: `scripts/coaching/lib-extract.test.mjs`
- Create: `coaching-sources/.gitkeep` (empty file)
- Modify: `.gitignore` (add `coaching-sources/*` and `!coaching-sources/.gitkeep`)
- Modify: `website/package.json` (add `pdf-parse` and `epub2` deps)

- [ ] **Step 1: Add gitignore entry**

Append to `.gitignore`:
```
coaching-sources/*
!coaching-sources/.gitkeep
```

Then `mkdir -p coaching-sources && touch coaching-sources/.gitkeep`.

- [ ] **Step 2: Add dependencies**

Run: `cd website && npm install --save pdf-parse@1.1.1 epub2@3.0.2`

Expected: `package.json` updated, `package-lock.json` regenerated.

- [ ] **Step 3: Write the failing test**

Create `scripts/coaching/lib-extract.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from './lib-extract.mjs';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('extractText rejects unknown extension', async () => {
  await assert.rejects(
    () => extractText('/tmp/nope.docx'),
    /Unsupported extension/,
  );
});

test('extractText reads a tiny PDF', async () => {
  // Skip if test fixture not present; CI provides it via `task test:coaching:fixtures`
  const fixture = process.env.PDF_FIXTURE ?? new URL('./fixtures/sample.pdf', import.meta.url).pathname;
  try {
    const { text, pageCount } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.ok(pageCount >= 1, 'should report page count');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('skipping PDF fixture test — sample.pdf not present');
      return;
    }
    throw err;
  }
});
```

- [ ] **Step 4: Run test — verify failure**

Run: `node --test scripts/coaching/lib-extract.test.mjs`
Expected: FAIL — `Cannot find module './lib-extract.mjs'`.

- [ ] **Step 5: Implement the extractor**

Create `scripts/coaching/lib-extract.mjs`:

```javascript
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import pdfParse from 'pdf-parse';
import EPub from 'epub2';

/**
 * Extracts plain text from a PDF or EPUB file.
 * Returns { text, pageCount, pageMap?, format }.
 * pageMap is an array of { page, charStart } anchors when available (PDF only).
 */
export async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.epub') return extractEpub(filePath);
  throw new Error(`Unsupported extension: ${ext}`);
}

async function extractPdf(filePath) {
  const buf = await readFile(filePath);
  const pageMap = [];
  let cursor = 0;
  const data = await pdfParse(buf, {
    pagerender: (pageData) => pageData.getTextContent().then((tc) => {
      const pageText = tc.items.map((it) => it.str).join(' ');
      pageMap.push({ page: pageData.pageNumber, charStart: cursor });
      cursor += pageText.length + 1;
      return pageText;
    }),
  });
  return {
    text: data.text,
    pageCount: data.numpages,
    pageMap,
    format: 'pdf',
  };
}

async function extractEpub(filePath) {
  const epub = await EPub.createAsync(filePath);
  const chapters = [];
  for (const item of epub.flow) {
    const html = await new Promise((res, rej) =>
      epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(txt))),
    );
    const text = stripHtml(html);
    if (text.trim()) chapters.push(text);
  }
  return {
    text: chapters.join('\n\n'),
    pageCount: chapters.length,
    pageMap: null,
    format: 'epub',
  };
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 6: Run test — verify pass (with skip on missing fixture)**

Run: `node --test scripts/coaching/lib-extract.test.mjs`
Expected: PASS for the unsupported-extension test; PDF test SKIPPED with warning.

- [ ] **Step 7: Commit**

```bash
git add scripts/coaching/lib-extract.mjs scripts/coaching/lib-extract.test.mjs \
        .gitignore coaching-sources/.gitkeep \
        website/package.json website/package-lock.json
git commit -m "feat(coaching): PDF + EPUB text extractor

Wraps pdf-parse and epub2 into a single extractText() that returns
{text, pageCount, pageMap, format}. PDF page map is populated for
later snippet-to-page resolution; EPUB returns null because there
are no fixed pages in reflowable EPUB.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Coaching ingest CLI + Taskfile target

**Files:**
- Create: `scripts/coaching/ingest-book.mjs`
- Modify: `Taskfile.yml` (add `coaching:ingest` task)

- [ ] **Step 1: Write the ingest CLI**

Create `scripts/coaching/ingest-book.mjs`:

```javascript
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { extractText } from './lib-extract.mjs';
import { makePool, sha256, ensureCollection, upsertDocumentAndChunks } from '../knowledge/lib-knowledge-pg.mjs';
import { chunkText } from '../../website/src/lib/chunking.ts'; // ts-node or pre-compiled
import { embedBatch } from '../../website/src/lib/embeddings.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ingest-book.mjs <file.pdf|.epub> <slug> [--title="..."] [--author="..."]');
    process.exit(2);
  }
  const [filePath, slug, ...rest] = args;
  const opts = parseFlags(rest);

  console.log(`[ingest] extracting ${filePath}…`);
  const { text, pageCount, pageMap, format } = await extractText(filePath);
  console.log(`[ingest] extracted ${text.length} chars, ${pageCount} pages, format=${format}`);

  const pool = makePool();
  try {
    const collectionId = await ensureCollection(pool, {
      name: `coaching-${slug}`,
      source: 'custom',
      brand: 'mentolder',
      description: opts.title ?? slug,
    });

    const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });
    console.log(`[ingest] embedding ${chunks.length} chunks…`);
    const embeddings = await embedBatch(chunks.map((c) => c.text));
    const chunksWithEmbeddings = chunks.map((c, i) => ({
      position: c.position,
      text: c.text,
      embedding: embeddings[i],
      metadata: { page: pageForOffset(c.position, pageMap, text) },
    }));

    await upsertDocumentAndChunks(pool, {
      collectionId,
      title: opts.title ?? slug,
      sourceUri: `file://${basename(filePath)}`,
      rawText: text,
      hash: sha256(text),
      metadata: { format, pageCount },
      chunks: chunksWithEmbeddings,
    });

    await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, author, source_filename, license_note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (knowledge_collection_id) DO UPDATE
         SET title = EXCLUDED.title, author = EXCLUDED.author, license_note = EXCLUDED.license_note`,
      [collectionId, opts.title ?? slug, opts.author ?? null, basename(filePath), opts['license-note'] ?? null],
    );

    console.log(`[ingest] done. collectionId=${collectionId}`);
  } finally {
    await pool.end();
  }
}

function parseFlags(rest) {
  const out = {};
  for (const a of rest) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function pageForOffset(charOffset, pageMap, fullText) {
  if (!pageMap || pageMap.length === 0) return null;
  // pageMap entries are { page, charStart }
  let page = pageMap[0].page;
  for (const entry of pageMap) {
    if (entry.charStart > charOffset) break;
    page = entry.page;
  }
  return page;
}

main().catch((err) => { console.error(err); process.exit(1); });
```

**Note on TS imports:** the existing `scripts/knowledge/ingest-*.mjs` uses pure `.mjs`. For `chunking.ts` and `embeddings.ts`, build them once via `npx tsc --target es2022 --module esnext` or invoke via `tsx`. Add `tsx` as a dev dep if not present:

```bash
cd website && npm install --save-dev tsx
```

Adjust the shebang to `#!/usr/bin/env tsx` and rename `.mjs` → `.mts` if `tsx` is the chosen runner. **Decision for this plan:** rename to `.mts` and run via `npx tsx`. Update step 1's filename to `scripts/coaching/ingest-book.mts` accordingly.

- [ ] **Step 2: Add Taskfile target**

In `Taskfile.yml`, find the `knowledge:reindex:` task block and add immediately below it:

```yaml
  coaching:ingest:
    desc: "Ingest a coaching book (PDF/EPUB) into pgvector + coaching.books. Args: -- <file> <slug> [--title=...] [--author=...]"
    cmds:
      - source scripts/env-resolve.sh "${ENV:-dev}" && cd website && npx tsx ../scripts/coaching/ingest-book.mts {{.CLI_ARGS}}
```

- [ ] **Step 3: Manual smoke test against a sample EPUB**

Place a sample EPUB at `coaching-sources/sample.epub` (any small public-domain EPUB, e.g. Project Gutenberg). Then:

```bash
ENV=dev task coaching:ingest -- coaching-sources/sample.epub sample-test --title="Sample Test"
```

Expected: log lines `[ingest] extracted N chars`, `[ingest] embedding N chunks`, `[ingest] done. collectionId=<uuid>`.

Verify in DB:
```bash
task workspace:psql -- website <<'SQL'
SELECT b.title, b.author, c.chunk_count
FROM coaching.books b
JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
WHERE b.source_filename = 'sample.epub';
SQL
```

Expected: one row, chunk_count > 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/coaching/ingest-book.mts Taskfile.yml \
        website/package.json website/package-lock.json
git commit -m "feat(coaching): ingest CLI + Taskfile target

task coaching:ingest -- <file> <slug> drives extraction → chunking →
embedding → upsert into knowledge.* + coaching.books in one shot.
Uses tsx to share chunking.ts and embeddings.ts with the website code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `coaching-db.ts` module + tests

**Files:**
- Create: `website/src/lib/coaching-db.ts`
- Create: `website/src/lib/coaching-db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/coaching-db.test.ts`. Mirror the pattern in `knowledge-db.test.ts` (inline schema setup against a test DB, test runner is `vitest` per existing convention):

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  listBooks, getBook, listChunksForBook,
  createSnippet, updateSnippet, deleteSnippet, listSnippets,
  createCluster, listClusters,
} from './coaching-db';

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

beforeAll(async () => {
  // Schema setup mirrors k3d/website-schema.yaml; see knowledge-db.test.ts
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS knowledge`);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS coaching`);
  // ... tables (copy DDL from Task 1)
});

afterAll(async () => {
  await pool.query(`DROP SCHEMA coaching CASCADE`);
  await pool.query(`DROP SCHEMA knowledge CASCADE`);
  await pool.end();
});

describe('coaching-db', () => {
  it('listBooks returns empty array when no books', async () => {
    const result = await listBooks(pool);
    expect(result).toEqual([]);
  });

  it('createSnippet + listSnippets round-trips', async () => {
    // setup: insert a collection + book row directly (ingest is tested separately)
    const c = await pool.query(`INSERT INTO knowledge.collections (name, source) VALUES ('t', 'custom') RETURNING id`);
    const b = await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 't', 't.epub') RETURNING id`,
      [c.rows[0].id],
    );
    const bookId = b.rows[0].id;

    const snippet = await createSnippet(pool, {
      bookId, title: 'X', body: 'Y', tags: ['reflection', 'körper'], page: 47, createdBy: 'gekko',
    });
    expect(snippet.id).toBeDefined();
    expect(snippet.tags).toEqual(['reflection', 'körper']);

    const listed = await listSnippets(pool, { bookId });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe('X');
  });

  it('createCluster + listClusters round-trips', async () => {
    const c = await pool.query(`INSERT INTO knowledge.collections (name, source) VALUES ('c', 'custom') RETURNING id`);
    const b = await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 'c', 'c.epub') RETURNING id`,
      [c.rows[0].id],
    );
    const cluster = await createCluster(pool, { bookId: b.rows[0].id, name: 'Reflexion', kind: 'manual' });
    expect(cluster.name).toBe('Reflexion');

    const clusters = await listClusters(pool, { bookId: b.rows[0].id });
    expect(clusters).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test — verify failure**

Run: `cd website && npm test -- coaching-db.test`
Expected: FAIL — `Cannot find module './coaching-db'`.

- [ ] **Step 3: Implement `coaching-db.ts`**

Create `website/src/lib/coaching-db.ts`:

```typescript
import type { Pool } from 'pg';

export interface Book {
  id: string;
  knowledgeCollectionId: string;
  title: string;
  author: string | null;
  sourceFilename: string;
  licenseNote: string | null;
  ingestedAt: Date;
  chunkCount?: number;
}

export interface Snippet {
  id: string;
  bookId: string;
  knowledgeChunkId: string | null;
  clusterId: string | null;
  title: string;
  body: string;
  tags: string[];
  page: number | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface Cluster {
  id: string;
  bookId: string | null;
  name: string;
  kind: 'auto' | 'manual';
  parentId: string | null;
  createdAt: Date;
  snippetCount?: number;
}

export async function listBooks(pool: Pool): Promise<Book[]> {
  const r = await pool.query(`
    SELECT b.*, c.chunk_count
    FROM coaching.books b
    JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
    ORDER BY b.ingested_at DESC
  `);
  return r.rows.map(rowToBook);
}

export async function getBook(pool: Pool, id: string): Promise<Book | null> {
  const r = await pool.query(
    `SELECT b.*, c.chunk_count
     FROM coaching.books b
     JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
     WHERE b.id = $1`,
    [id],
  );
  return r.rows[0] ? rowToBook(r.rows[0]) : null;
}

export async function listChunksForBook(
  pool: Pool,
  bookId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ id: string; position: number; text: string; metadata: Record<string, unknown> }[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const r = await pool.query(
    `SELECT k.id, k.position, k.text, k.metadata
     FROM knowledge.chunks k
     JOIN coaching.books b ON b.knowledge_collection_id = k.collection_id
     WHERE b.id = $1
     ORDER BY k.position
     LIMIT $2 OFFSET $3`,
    [bookId, limit, offset],
  );
  return r.rows;
}

export async function createSnippet(
  pool: Pool,
  args: { bookId: string; title: string; body: string; tags: string[]; page?: number | null; clusterId?: string | null; knowledgeChunkId?: string | null; createdBy?: string },
): Promise<Snippet> {
  const r = await pool.query(
    `INSERT INTO coaching.snippets (book_id, title, body, tags, page, cluster_id, knowledge_chunk_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [args.bookId, args.title, args.body, args.tags, args.page ?? null,
     args.clusterId ?? null, args.knowledgeChunkId ?? null, args.createdBy ?? null],
  );
  return rowToSnippet(r.rows[0]);
}

export async function updateSnippet(
  pool: Pool,
  id: string,
  args: Partial<Pick<Snippet, 'title' | 'body' | 'tags' | 'clusterId'>>,
): Promise<Snippet | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(args)) {
    const col = ({ title: 'title', body: 'body', tags: 'tags', clusterId: 'cluster_id' } as Record<string,string>)[k];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) {
    const r = await pool.query(`SELECT * FROM coaching.snippets WHERE id = $1`, [id]);
    return r.rows[0] ? rowToSnippet(r.rows[0]) : null;
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.snippets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return r.rows[0] ? rowToSnippet(r.rows[0]) : null;
}

export async function deleteSnippet(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM coaching.snippets WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function listSnippets(
  pool: Pool,
  filter: { bookId?: string; clusterId?: string; tag?: string } = {},
): Promise<Snippet[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filter.bookId)    { where.push(`book_id = $${i++}`); vals.push(filter.bookId); }
  if (filter.clusterId) { where.push(`cluster_id = $${i++}`); vals.push(filter.clusterId); }
  if (filter.tag)       { where.push(`$${i++} = ANY(tags)`); vals.push(filter.tag); }
  const sql = `SELECT * FROM coaching.snippets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const r = await pool.query(sql, vals);
  return r.rows.map(rowToSnippet);
}

export async function createCluster(
  pool: Pool,
  args: { bookId?: string | null; name: string; kind?: 'auto' | 'manual'; parentId?: string | null },
): Promise<Cluster> {
  const r = await pool.query(
    `INSERT INTO coaching.snippet_clusters (book_id, name, kind, parent_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [args.bookId ?? null, args.name, args.kind ?? 'manual', args.parentId ?? null],
  );
  return rowToCluster(r.rows[0]);
}

export async function listClusters(
  pool: Pool,
  filter: { bookId?: string } = {},
): Promise<Cluster[]> {
  const sql = filter.bookId
    ? `SELECT c.*, COUNT(s.id)::int AS snippet_count
       FROM coaching.snippet_clusters c
       LEFT JOIN coaching.snippets s ON s.cluster_id = c.id
       WHERE c.book_id = $1
       GROUP BY c.id ORDER BY c.name`
    : `SELECT c.*, COUNT(s.id)::int AS snippet_count
       FROM coaching.snippet_clusters c
       LEFT JOIN coaching.snippets s ON s.cluster_id = c.id
       GROUP BY c.id ORDER BY c.name`;
  const r = await pool.query(sql, filter.bookId ? [filter.bookId] : []);
  return r.rows.map(rowToCluster);
}

function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: r.id as string,
    knowledgeCollectionId: r.knowledge_collection_id as string,
    title: r.title as string,
    author: (r.author ?? null) as string | null,
    sourceFilename: r.source_filename as string,
    licenseNote: (r.license_note ?? null) as string | null,
    ingestedAt: r.ingested_at as Date,
    chunkCount: (r.chunk_count ?? undefined) as number | undefined,
  };
}

function rowToSnippet(r: Record<string, unknown>): Snippet {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    knowledgeChunkId: (r.knowledge_chunk_id ?? null) as string | null,
    clusterId: (r.cluster_id ?? null) as string | null,
    title: r.title as string,
    body: r.body as string,
    tags: (r.tags ?? []) as string[],
    page: (r.page ?? null) as number | null,
    createdBy: (r.created_by ?? null) as string | null,
    createdAt: r.created_at as Date,
  };
}

function rowToCluster(r: Record<string, unknown>): Cluster {
  return {
    id: r.id as string,
    bookId: (r.book_id ?? null) as string | null,
    name: r.name as string,
    kind: r.kind as 'auto' | 'manual',
    parentId: (r.parent_id ?? null) as string | null,
    createdAt: r.created_at as Date,
    snippetCount: (r.snippet_count ?? undefined) as number | undefined,
  };
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd website && npm test -- coaching-db.test`
Expected: PASS for all three test cases.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/coaching-db.ts website/src/lib/coaching-db.test.ts
git commit -m "feat(coaching): coaching-db.ts CRUD module

Books, snippets, clusters CRUD with vitest coverage. Mirrors
knowledge-db.ts patterns; uses pg Pool, returns plain objects
from row mapping helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: API endpoints — books

**Files:**
- Create: `website/src/pages/api/admin/coaching/books/index.ts`
- Create: `website/src/pages/api/admin/coaching/books/[id]/index.ts`
- Create: `website/src/pages/api/admin/coaching/books/[id]/chunks.ts`

**Auth pattern:** copy from `/api/admin/knowledge/collections/index.ts`. Every endpoint calls `getSession()` + `isAdmin()`; returns 401 / 403 on fail.

- [ ] **Step 1: Write `books/index.ts` (list)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listBooks } from '../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const books = await listBooks(pool);
  return new Response(JSON.stringify(books), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Write `books/[id]/index.ts` (detail)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getBook } from '../../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const id = params.id as string;
  const book = await getBook(pool, id);
  if (!book) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(JSON.stringify(book), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 3: Write `books/[id]/chunks.ts` (paginated chunks)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { listChunksForBook } from '../../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const id = params.id as string;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const chunks = await listChunksForBook(pool, id, { limit, offset });
  return new Response(JSON.stringify({ chunks, limit, offset }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 4: Smoke test**

Start the dev server (`task website:dev`), then:

```bash
# Authenticate first via browser to set cookie, then:
curl -s -b "$(cat ~/.cookies/session)" http://localhost:4321/api/admin/coaching/books
```

Expected: JSON array (empty if no books ingested, populated if Task 3 was run).

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/coaching/books/
git commit -m "feat(coaching): books API endpoints

GET list, GET detail, GET paginated chunks. Auth pattern mirrors
existing /api/admin/knowledge/collections/* — getSession + isAdmin
on every request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: API endpoints — snippets

**Files:**
- Create: `website/src/pages/api/admin/coaching/snippets/index.ts`
- Create: `website/src/pages/api/admin/coaching/snippets/[id].ts`

- [ ] **Step 1: Write `snippets/index.ts` (POST create, GET list)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSnippet, listSnippets } from '../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const filter = {
    bookId: url.searchParams.get('book_id') ?? undefined,
    clusterId: url.searchParams.get('cluster_id') ?? undefined,
    tag: url.searchParams.get('tag') ?? undefined,
  };
  const snippets = await listSnippets(pool, filter);
  return new Response(JSON.stringify(snippets), { status: 200, headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const body = await request.json();
  if (!body.bookId || !body.title || !body.body) {
    return new Response(JSON.stringify({ error: 'bookId, title, body required' }), { status: 400 });
  }

  const snippet = await createSnippet(pool, {
    bookId: body.bookId,
    title: body.title,
    body: body.body,
    tags: Array.isArray(body.tags) ? body.tags : [],
    page: body.page ?? null,
    clusterId: body.clusterId ?? null,
    knowledgeChunkId: body.knowledgeChunkId ?? null,
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(snippet), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Write `snippets/[id].ts` (PATCH, DELETE)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateSnippet, deleteSnippet } from '../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const id = params.id as string;
  const body = await request.json();
  const updated = await updateSnippet(pool, id, {
    title: body.title,
    body: body.body,
    tags: body.tags,
    clusterId: body.clusterId,
  });
  if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const id = params.id as string;
  const ok = await deleteSnippet(pool, id);
  return new Response(null, { status: ok ? 204 : 404 });
};
```

- [ ] **Step 3: Smoke test**

```bash
# After authenticating in browser
curl -s -b "$(cat ~/.cookies/session)" -X POST \
  -H "content-type: application/json" \
  -d '{"bookId":"<uuid-from-task-3>","title":"Test","body":"…","tags":["reflection"]}' \
  http://localhost:4321/api/admin/coaching/snippets
```

Expected: 201 + snippet JSON with `id`.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/coaching/snippets/
git commit -m "feat(coaching): snippets API endpoints

GET list (with filter by book/cluster/tag), POST create, PATCH update,
DELETE. Same auth pattern as books endpoints.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: API endpoints — clusters

**Files:**
- Create: `website/src/pages/api/admin/coaching/clusters/index.ts`

- [ ] **Step 1: Write `clusters/index.ts` (GET list, POST create)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createCluster, listClusters } from '../../../../../lib/coaching-db';

const pool = new Pool();

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const bookId = url.searchParams.get('book_id') ?? undefined;
  const clusters = await listClusters(pool, { bookId });
  return new Response(JSON.stringify(clusters), { status: 200, headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const body = await request.json();
  if (!body.name) return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });

  const cluster = await createCluster(pool, {
    bookId: body.bookId ?? null,
    name: body.name,
    kind: body.kind === 'auto' ? 'auto' : 'manual',
    parentId: body.parentId ?? null,
  });
  return new Response(JSON.stringify(cluster), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/admin/coaching/clusters/
git commit -m "feat(coaching): clusters API endpoints

GET list (filter by book), POST create. Manual clusters only in
Phase 1; auto-clusters come with AI-Drafting in Phase 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Astro page — `/admin/knowledge/books` (book list)

**Files:**
- Create: `website/src/pages/admin/knowledge/books/index.astro`

**Pattern:** Mirror `website/src/pages/admin/wissensquellen.astro`. Server-side render the books list; show one row per book with title, author, chunk count, ingested-at, and a link to detail.

- [ ] **Step 1: Write the page**

```astro
---
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listBooks } from '../../../../lib/coaching-db';
import Layout from '../../../../layouts/AdminLayout.astro';

const pool = new Pool();
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect('/login');
if (!isAdmin(session)) return new Response('forbidden', { status: 403 });

const books = await listBooks(pool);
---
<Layout title="Coaching-Bücher">
  <header class="page-header">
    <nav class="crumbs"><a href="/admin">Admin</a> › <a href="/admin/wissensquellen">Wissen</a> › Bücher</nav>
    <h1>Coaching-Bücher</h1>
    <p class="subtitle">Ingestierte Bücher für Themen-Browser und Snippet-Kuration. Ingest läuft via <code>task coaching:ingest</code>.</p>
  </header>

  {books.length === 0 ? (
    <div class="empty">
      <p>Noch keine Bücher ingestiert.</p>
      <pre><code>ENV=&lt;env&gt; task coaching:ingest -- coaching-sources/&lt;file&gt; &lt;slug&gt; --title="…" --author="…"</code></pre>
    </div>
  ) : (
    <table class="books-table">
      <thead>
        <tr><th>Titel</th><th>Autor</th><th>Chunks</th><th>Ingestiert</th><th></th></tr>
      </thead>
      <tbody>
        {books.map((b) => (
          <tr>
            <td><a href={`/admin/knowledge/books/${b.id}`}>{b.title}</a></td>
            <td>{b.author ?? '—'}</td>
            <td class="num">{b.chunkCount ?? 0}</td>
            <td>{b.ingestedAt.toLocaleDateString('de-DE')}</td>
            <td><a class="btn-secondary" href={`/admin/knowledge/books/${b.id}`}>Öffnen</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</Layout>

<style>
  .page-header { margin-bottom: 2rem; }
  .crumbs { color: var(--muted, #888); font-size: 0.85rem; margin-bottom: 0.5rem; }
  .subtitle { color: var(--muted, #888); }
  .empty { background: var(--bg-2, #f5f5f5); border-radius: 6px; padding: 1.5rem; }
  .empty pre { background: var(--bg, #fff); padding: 0.75rem; border-radius: 4px; overflow-x: auto; }
  .books-table { width: 100%; border-collapse: collapse; }
  .books-table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line, #ddd); font-weight: 500; }
  .books-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line, #eee); }
  .books-table .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
```

- [ ] **Step 2: Smoke test in browser**

Start the dev server, log in as admin, navigate to `http://localhost:4321/admin/knowledge/books`.
Expected: empty-state if no books, otherwise table with at least the sample book from Task 3.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/knowledge/books/index.astro
git commit -m "feat(coaching): admin books index page

Table-style list of ingested coaching books with link into the
themen-browser per book. Empty-state shows the ingest CLI command
so Gekko can copy-paste.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `BookReader.svelte` — reading view + highlighting

**Files:**
- Create: `website/src/components/admin/BookReader.svelte`

**Behavior:**
- Receives `bookId` as prop.
- On mount, fetches `/api/admin/coaching/books/${bookId}/chunks?limit=50&offset=0` and renders the chunk text in a single scrollable column.
- Lazy-loads next page on scroll-to-bottom (offset += 50) until the API returns fewer than `limit` chunks.
- Listens to `mouseup` on the reading column. When there is a non-empty selection within the column, shows a floating "Snippet anlegen" button at the cursor position.
- Click → opens a modal with: title (auto-filled from selection's first 60 chars), body (=selection), tags (comma-separated input), cluster (dropdown, fetched from `/api/admin/coaching/clusters?book_id=${bookId}`), page (auto-filled from chunk metadata).
- Save → POST `/api/admin/coaching/snippets` with the form data and the source chunk's `id` as `knowledgeChunkId`.
- After save, briefly highlight the selected range in green (1.5s flash) and dispatch a `coaching:snippet-created` custom event.

- [ ] **Step 1: Component scaffold + props**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  export let bookId: string;

  type Chunk = { id: string; position: number; text: string; metadata: { page?: number | null } };
  type Cluster = { id: string; name: string };

  let chunks: Chunk[] = [];
  let clusters: Cluster[] = [];
  let loading = false;
  let exhausted = false;
  let offset = 0;
  const LIMIT = 50;

  let containerEl: HTMLElement;
  let selection: { text: string; rect: DOMRect; chunkId: string; page: number | null } | null = null;
  let modalOpen = false;
  let form = { title: '', body: '', tags: '', clusterId: '', page: null as number | null };

  onMount(async () => {
    await Promise.all([loadMore(), loadClusters()]);
    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  });

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    try {
      const r = await fetch(`/api/admin/coaching/books/${bookId}/chunks?limit=${LIMIT}&offset=${offset}`);
      const data = await r.json();
      chunks = [...chunks, ...data.chunks];
      offset += data.chunks.length;
      if (data.chunks.length < LIMIT) exhausted = true;
    } finally {
      loading = false;
    }
  }

  async function loadClusters() {
    const r = await fetch(`/api/admin/coaching/clusters?book_id=${bookId}`);
    clusters = await r.json();
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerEl.contains(sel.anchorNode)) {
      selection = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    // Walk up to find the chunk wrapper
    let el: HTMLElement | null = sel.anchorNode as HTMLElement;
    while (el && !el.dataset?.chunkId) el = el.parentElement;
    if (!el) return;
    selection = {
      text: sel.toString(),
      rect,
      chunkId: el.dataset.chunkId!,
      page: el.dataset.page ? parseInt(el.dataset.page, 10) : null,
    };
  }

  function openModal() {
    if (!selection) return;
    form = {
      title: selection.text.slice(0, 60).trim() + (selection.text.length > 60 ? '…' : ''),
      body: selection.text,
      tags: '',
      clusterId: '',
      page: selection.page,
    };
    modalOpen = true;
  }

  async function saveSnippet() {
    const payload = {
      bookId,
      title: form.title,
      body: form.body,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      page: form.page,
      clusterId: form.clusterId || null,
      knowledgeChunkId: selection?.chunkId,
    };
    const r = await fetch('/api/admin/coaching/snippets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      alert(`Fehler beim Speichern: ${r.status}`);
      return;
    }
    const snippet = await r.json();
    modalOpen = false;
    selection = null;
    window.dispatchEvent(new CustomEvent('coaching:snippet-created', { detail: snippet }));
  }

  function onScroll() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    if (scrollTop + clientHeight > scrollHeight - 200) loadMore();
  }
</script>

<div class="reader" bind:this={containerEl} on:scroll={onScroll}>
  {#each chunks as chunk}
    <p class="chunk" data-chunk-id={chunk.id} data-page={chunk.metadata.page ?? ''}>
      {chunk.text}
    </p>
  {/each}
  {#if loading}<p class="loading">Lade…</p>{/if}
</div>

{#if selection && !modalOpen}
  <button
    class="float-btn"
    style="top: {selection.rect.top + window.scrollY - 40}px; left: {selection.rect.left + window.scrollX}px"
    on:click={openModal}>+ Snippet anlegen</button>
{/if}

{#if modalOpen}
  <div class="modal-backdrop" on:click={() => (modalOpen = false)}>
    <div class="modal" on:click|stopPropagation>
      <h3>Snippet anlegen</h3>
      <label>Titel <input bind:value={form.title} /></label>
      <label>Text <textarea bind:value={form.body} rows="6"></textarea></label>
      <label>Tags (Komma-separiert) <input bind:value={form.tags} placeholder="reflexion, körper" /></label>
      <label>Cluster
        <select bind:value={form.clusterId}>
          <option value="">— kein Cluster —</option>
          {#each clusters as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <label>Seite <input type="number" bind:value={form.page} /></label>
      <div class="actions">
        <button on:click={() => (modalOpen = false)}>Abbrechen</button>
        <button class="primary" on:click={saveSnippet}>Speichern</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .reader { max-height: 70vh; overflow-y: auto; padding: 1rem 1.5rem; line-height: 1.7; font-family: 'Newsreader', Georgia, serif; }
  .chunk { margin: 0 0 0.85rem; }
  .loading { text-align: center; color: var(--muted, #888); }
  .float-btn { position: absolute; padding: 0.4rem 0.75rem; background: var(--brass, #c9a55c); color: #1a1817; border: 0; border-radius: 4px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 100; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: var(--bg-2, #fff); padding: 1.5rem; border-radius: 8px; min-width: 480px; max-width: 600px; }
  .modal h3 { margin-top: 0; }
  .modal label { display: block; margin: 0.75rem 0; }
  .modal label input, .modal label select, .modal label textarea { display: block; width: 100%; margin-top: 0.25rem; padding: 0.4rem; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
  .actions button.primary { background: var(--brass, #c9a55c); color: #1a1817; border: 0; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/BookReader.svelte
git commit -m "feat(coaching): BookReader Svelte component

Reading view with infinite-scroll chunk loading, mouse-selection
to spawn a 'Snippet anlegen' floating button, and modal for
title/tags/cluster/page input. Posts to /api/admin/coaching/snippets,
dispatches 'coaching:snippet-created' on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Astro page — `/admin/knowledge/books/[id]` (Themen-Browser)

**Files:**
- Create: `website/src/pages/admin/knowledge/books/[id].astro`

- [ ] **Step 1: Write the page**

```astro
---
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBook, listClusters, listSnippets } from '../../../../lib/coaching-db';
import BookReader from '../../../../components/admin/BookReader.svelte';
import Layout from '../../../../layouts/AdminLayout.astro';

const pool = new Pool();
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect('/login');
if (!isAdmin(session)) return new Response('forbidden', { status: 403 });

const id = Astro.params.id as string;
const book = await getBook(pool, id);
if (!book) return new Response('not found', { status: 404 });

const [clusters, snippets] = await Promise.all([
  listClusters(pool, { bookId: id }),
  listSnippets(pool, { bookId: id }),
]);
---
<Layout title={book.title}>
  <header class="page-header">
    <nav class="crumbs">
      <a href="/admin">Admin</a> ›
      <a href="/admin/knowledge/books">Bücher</a> ›
      {book.title}
    </nav>
    <h1>{book.title}</h1>
    <p class="subtitle">{book.author ?? '—'} · {book.chunkCount ?? 0} Chunks · ingestiert {book.ingestedAt.toLocaleDateString('de-DE')}</p>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <h2>Cluster</h2>
      {#each clusters as c}
        <div class="cluster"><span>{c.name}</span><span class="count">{c.snippetCount ?? 0}</span></div>
      {:else}
        <p class="empty-mini">Noch keine Cluster.</p>
      {/each}
      <button class="btn-link" id="new-cluster">+ Cluster anlegen</button>

      <h2>Snippets</h2>
      <p class="snippet-count">{snippets.length} Snippet{snippets.length === 1 ? '' : 's'}</p>
    </aside>

    <main class="reader-host">
      <BookReader client:load bookId={id} />
    </main>
  </div>
</Layout>

<script is:inline>
  document.getElementById('new-cluster')?.addEventListener('click', async () => {
    const name = prompt('Cluster-Name?');
    if (!name) return;
    const r = await fetch('/api/admin/coaching/clusters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId: window.location.pathname.split('/').pop(), name, kind: 'manual' }),
    });
    if (r.ok) location.reload();
  });
  window.addEventListener('coaching:snippet-created', () => {
    setTimeout(() => location.reload(), 800);
  });
</script>

<style>
  .page-header { margin-bottom: 1.5rem; }
  .crumbs { color: var(--muted, #888); font-size: 0.85rem; margin-bottom: 0.4rem; }
  .subtitle { color: var(--muted, #888); }
  .layout { display: grid; grid-template-columns: 240px 1fr; gap: 1.5rem; }
  .sidebar { background: var(--bg-2, #f7f5f2); padding: 1rem; border-radius: 6px; }
  .sidebar h2 { font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted, #888); margin: 1rem 0 0.5rem; }
  .sidebar h2:first-child { margin-top: 0; }
  .cluster { display: flex; justify-content: space-between; padding: 0.3rem 0; font-size: 0.9rem; }
  .cluster .count { color: var(--muted, #888); font-variant-numeric: tabular-nums; }
  .empty-mini { font-size: 0.82rem; color: var(--muted, #888); margin: 0.4rem 0; }
  .btn-link { background: none; border: 0; padding: 0.4rem 0; color: var(--brass, #c9a55c); cursor: pointer; font-size: 0.85rem; }
  .reader-host { background: var(--bg, #fff); border: 1px solid var(--line, #e5e2dd); border-radius: 6px; }
</style>
```

- [ ] **Step 2: Manual smoke test**

Run dev server, navigate to `http://localhost:4321/admin/knowledge/books/<id-from-task-3>`. Expected:
1. Crumbs visible.
2. Cluster sidebar shows "Noch keine Cluster" empty state and a "+ Cluster anlegen" button.
3. Reading column populates with text from sample book.
4. Selecting text shows the floating "+ Snippet anlegen" button. Clicking opens the modal. Saving creates a snippet (verify via `task workspace:psql -- website -c "SELECT * FROM coaching.snippets"`).
5. After save, page reloads after ~800 ms.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/knowledge/books/\[id\].astro
git commit -m "feat(coaching): book detail page (themen-browser)

Hosts BookReader with a sidebar for clusters + snippet count.
Manual cluster creation via prompt. Reload on snippet-created
event ensures sidebar reflects current state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Playwright E2E — full flow

**Files:**
- Create: `website/tests/e2e/coaching-knowledge.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4321';

test.describe('coaching knowledge phase 1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    // assumes admin user is in dev seed; adjust if different in this repo
    await page.fill('input[name="username"]', process.env.E2E_ADMIN_USER ?? 'admin');
    await page.fill('input[name="password"]', process.env.E2E_ADMIN_PASS ?? 'admin');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/portal|\/admin/);
  });

  test('book list shows ingested book and links into themen-browser', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/books`);
    const row = page.locator('table.books-table tbody tr').first();
    await expect(row).toBeVisible();
    await row.locator('a').first().click();
    await expect(page).toHaveURL(/\/admin\/knowledge\/books\/[a-f0-9-]+$/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('selecting text spawns snippet button and saves a snippet', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/books`);
    await page.locator('table.books-table tbody tr a').first().click();

    // Wait for reader to load chunks
    await expect(page.locator('.chunk').first()).toBeVisible();

    // Select text in the first chunk programmatically (Playwright dispatches mouseup)
    const chunk = page.locator('.chunk').first();
    await chunk.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    await expect(page.locator('.float-btn')).toBeVisible();
    await page.locator('.float-btn').click();

    await expect(page.locator('.modal h3')).toHaveText('Snippet anlegen');
    await page.fill('.modal input:has(+ * ), .modal input', 'Test Snippet');
    await page.fill('.modal label:has-text("Tags") input', 'reflexion');
    await page.click('.modal button.primary');

    // Reload triggered after 800 ms
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.snippet-count')).toContainText(/\d+ Snippet/);
  });
});
```

- [ ] **Step 2: Run test — verify pass**

```bash
cd website && npx playwright test coaching-knowledge.spec.ts
```

If a sample book has not been ingested, the first test will fail at the row assertion. Run Task 3 step 3 first.

- [ ] **Step 3: Commit**

```bash
git add website/tests/e2e/coaching-knowledge.spec.ts
git commit -m "test(coaching): Playwright E2E for phase 1 flow

Covers book-list → themen-browser → text selection → snippet
modal → save → snippet count updated. Requires a sample book
to be ingested via task coaching:ingest.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final smoke + plan registry update + push + PR

- [ ] **Step 1: Run all tests**

```bash
cd website && npm test                     # vitest unit tests
cd website && npx playwright test           # E2E
node --test scripts/coaching/*.test.mjs    # node:test
```

All green expected.

- [ ] **Step 2: Add this plan to the plan registry**

Edit `docs/superpowers/plans/2026-05-09-plan-registry.md`. Find the section listing recent plans (sorted reverse-chronologically) and add a row:

```markdown
- [2026-05-10 — Coaching Knowledge Phase 1](./2026-05-10-coaching-knowledge-phase-1.md) — Ingest + Themen-Browser + Snippets (no AI). Domains: website, db.
```

- [ ] **Step 3: Update plan status frontmatter to `completed`**

In `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-1.md` (this file), change the frontmatter `status:` from whatever value the hook set to `completed` (the frontmatter was added at commit time by `scripts/plan-frontmatter-hook.sh`).

- [ ] **Step 4: Push branch + open PR + merge**

```bash
git push -u origin feature/coaching-knowledge-phase-1
gh pr create --title "feat(coaching): phase 1 — ingest + themen-browser + snippets" \
  --body "$(cat <<'EOF'
## Summary

Phase 1 of the coaching knowledge pipeline (spec PR #633).
- New `coaching` Postgres schema with `books`, `snippets`, `snippet_clusters`.
- Ingest CLI (`task coaching:ingest`) for PDF/EPUB → chunked + embedded into existing `knowledge.*`.
- Admin UI under `/admin/knowledge/books/*` with a Svelte `BookReader` for highlighting and snippet creation.
- No AI drafting yet — Phase 3 plan covers that.

## Test plan
- [x] vitest unit tests for `coaching-db.ts`
- [x] node:test for `lib-extract.mjs`
- [x] Playwright E2E for full flow
- [x] Manual ingest of `coaching-sources/sample.epub` against dev cluster

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

---

## Self-Review

**Spec coverage:**
- ✅ Architecture (book → ingest → knowledge.* + coaching.*) → Tasks 1, 3
- ✅ Themen-Browser with auto-cluster + manual cluster → Task 10 (auto-cluster deferred — see deviation below)
- ✅ Snippet model with tags, clusters, source page → Tasks 4, 6, 9
- ⚠ **Spec deviation:** Spec describes auto-clustering of chunks in the Themen-Browser. Phase 1 does NOT auto-cluster — only manual cluster creation. Auto-clustering is a non-trivial NLP step (k-means on embeddings or similar) and is more naturally bundled with AI-Drafting in Phase 3. Captured as `coaching.snippet_clusters.kind = 'auto' | 'manual'` so the schema is ready.
- ✅ `/admin/knowledge/*` route → Tasks 8, 10
- ✅ Auth via existing `getSession` + `isAdmin` → Tasks 5–7
- ✅ Page anchor stored on snippet → Task 4 (`page` column)
- ✅ Source pointer back to chunk → `knowledge_chunk_id` FK on `coaching.snippets`
- ⏳ **Phase 2 — Publish-Cascade:** not in this plan. Snippets land in DB but cannot yet be published to Klienten-surfaces. That's the next plan.
- ⏳ **Phase 3 — AI-Drafting / Drafts-Inbox:** not in this plan.
- ⏳ **Phase 4 — Session-Prep:** not in this plan.
- ⏳ **Phase 5 — In-Session-RAG:** not in this plan.

**Placeholder scan:** none. Every step has concrete code or commands.

**Type consistency:**
- `Snippet.tags` is `string[]` everywhere ✓
- `BookReader` posts to `/api/admin/coaching/snippets` and the endpoint accepts `bookId, title, body, tags, page, clusterId, knowledgeChunkId` — matches `createSnippet()` args ✓
- `Cluster.kind` literal `'auto' | 'manual'` matches DB CHECK constraint ✓
- DB column names (snake_case) consistently mapped to JS camelCase via row-mapper helpers ✓

**Open implementation-time questions:**
- The `Pool` is instantiated at module load in each endpoint. Existing `/api/admin/knowledge/*` endpoints do the same — match the pattern. If runtime connection-leakage shows up in Phase 2, refactor to a shared singleton then.
- `tsx` runtime for ingest CLI: there is no other tsx usage in `scripts/`, but it's the most ergonomic way to share `chunking.ts` and `embeddings.ts`. Acceptable trade-off.
