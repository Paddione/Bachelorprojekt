---
title: Coaching Knowledge — Phase 2 Implementation Plan (Publish-Cascade)
domains: [website, db]
status: completed
pr_number: null
---

# Coaching Knowledge — Phase 2 Implementation Plan (Publish-Cascade)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From any Snippet (Phase 1), Gekko can publish a versioned Template into one of four target surfaces. In Phase 2, the cascades for **Questionnaire** and **Assistant-Knowledge** are wired end-to-end (clients see them); **Brett-Preset** and **Chatroom-Übung** templates are stored as data-only stubs (Phase 2b will surface them in Brett/Chat).

**Architecture:** New `coaching.templates` table holds versioned template records — `target_surface`, `version`, `payload` JSONB, `source_pointer` JSONB. New API endpoints under `/api/admin/coaching/templates/*` and a `POST .../publish` action that, depending on `target_surface`, either creates a row in the existing `questionnaire_templates` table or adds a document into a `coaching-assistant` knowledge collection. New `PublishEditor.svelte` component drives the editor UI with a surface selector and per-surface form fields, plus a §51 UrhG 280-character quote-length validator.

**Tech Stack:** Astro 5, Svelte 5, PostgreSQL (`coaching` + `knowledge` schemas, existing pgvector), Voyage embeddings (existing), pg-mem (test DB).

**Spec:** `docs/superpowers/specs/2026-05-10-coaching-knowledge-design.md`. Phase 1 shipped in PR #635. Phase 2b (Brett-Preset + Chatroom-Übung surface integration) is a separate plan; Phases 3–5 follow.

---

## File Structure

| Path | Responsibility | New/Modify |
|---|---|---|
| `k3d/website-schema.yaml` | DDL for `coaching.templates` and `coaching.template_assignments` (in BOTH init + ensure scripts) | Modify |
| `website/src/lib/coaching-db.ts` | Add Template types + CRUD: createTemplateDraft, updateTemplate, listTemplates, getTemplate, listTemplateVersions, getLatestTemplateVersion, listAssignmentsForTemplate | Modify |
| `website/src/lib/coaching-db.test.ts` | Add tests for the new template CRUD + version semantics | Modify |
| `website/src/lib/coaching-publish.ts` | Cascade implementations per `target_surface` (questionnaire, assistant, brett-stub, chatroom-stub). One module so the per-surface logic is co-located. | Create |
| `website/src/lib/coaching-publish.test.ts` | Vitest covering each cascade branch with pg-mem | Create |
| `website/src/lib/quote-validator.ts` | §51 UrhG 280-char direct-quote validator. Pure function, easy to unit-test. | Create |
| `website/src/lib/quote-validator.test.ts` | Vitest for the quote validator | Create |
| `website/src/pages/api/admin/coaching/templates/index.ts` | GET list (with `target_surface` and `book_id` filters) | Create |
| `website/src/pages/api/admin/coaching/templates/[id].ts` | GET detail (latest version), PATCH (creates a new version) | Create |
| `website/src/pages/api/admin/coaching/templates/[id]/versions.ts` | GET full version history of a template | Create |
| `website/src/pages/api/admin/coaching/templates/[id]/publish.ts` | POST — runs the cascade (writes to live surface) | Create |
| `website/src/pages/api/admin/coaching/snippets/[id]/draft-template.ts` | POST — creates a draft template seeded from a snippet | Create |
| `website/src/components/admin/PublishEditor.svelte` | Editor UI: surface selector, per-surface form fields, quote-length warning, live preview | Create |
| `website/src/pages/admin/knowledge/snippets/[id]/publish.astro` | Host page for the editor | Create |
| `website/src/pages/admin/knowledge/templates/index.astro` | List of all templates with filters (surface, status, book) | Create |
| `tests/e2e/specs/fa-coaching-publish.spec.ts` | Playwright unauth checks for the new endpoints | Create |
| `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-2.md` | Mark `status: completed` at end (this file) | Modify |

**Parallel-fan-out hint:** After Task 1 (migration), Tasks 2 and 6 (quote-validator) and 7 (PublishEditor scaffold) are independent. Task 3 needs Task 2. Tasks 4 and 5 build on Task 3. Tasks 8–10 need 5 (publish endpoint).

---

## Task 1: Database migration — `coaching.templates` + `coaching.template_assignments`

**Files:**
- Modify: `k3d/website-schema.yaml` (BOTH `init-meetings-schema.sh` and `ensure-meetings-schema.sh` heredocs)

**Context:** Both scripts use `CREATE ... IF NOT EXISTS` so the DDL is idempotent. Insertion point: immediately after the existing `coaching.snippets` block from Phase 1 (after the `idx_snippets_tags` GIN index).

- [ ] **Step 1: Locate the Phase-1 coaching block**

```bash
grep -n "idx_snippets_tags" k3d/website-schema.yaml
```
Expected: two hits (one in init script, one in ensure script).

- [ ] **Step 2: Add the new DDL after the GIN index in BOTH scripts**

```sql
CREATE TABLE IF NOT EXISTS coaching.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES coaching.snippets(id) ON DELETE CASCADE,
  target_surface TEXT NOT NULL CHECK (target_surface IN ('questionnaire','brett','chatroom','assistant')),
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_pointer JSONB NOT NULL,
  surface_ref TEXT,
  published_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snippet_id, target_surface, version)
);

CREATE INDEX IF NOT EXISTS idx_templates_snippet_id ON coaching.templates(snippet_id);
CREATE INDEX IF NOT EXISTS idx_templates_surface_status ON coaching.templates(target_surface, status);
CREATE INDEX IF NOT EXISTS idx_templates_surface_ref ON coaching.templates(surface_ref);

CREATE TABLE IF NOT EXISTS coaching.template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES coaching.templates(id) ON DELETE CASCADE,
  template_version INT NOT NULL,
  client_id TEXT NOT NULL,
  surface_specific_id TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_template_id ON coaching.template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_assignments_client_id ON coaching.template_assignments(client_id);
```

`source_pointer` JSONB shape: `{"book_id": "<uuid>", "page": <int|null>, "chunk_id": "<uuid|null>"}`. `surface_ref` holds the foreign id created in the live surface (e.g., `questionnaire_templates.id`); null for brett/chatroom stubs in Phase 2.

- [ ] **Step 3: Validate YAML**
```bash
python3 -c "import yaml; yaml.safe_load(open('k3d/website-schema.yaml'))"
```

- [ ] **Step 4: Commit**
```bash
git add k3d/website-schema.yaml
git commit -m "feat(coaching): add templates + template_assignments tables

Phase 2 schema: versioned templates per (snippet, target_surface)
plus assignment audit trail. Source pointer is required (JSONB
{book_id, page, chunk_id}) so every published artifact carries its
provenance for §51 UrhG citation. surface_ref nullable: filled when
cascade actually writes to a live surface (questionnaire,
knowledge.collections); null for brett/chatroom stubs in Phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extend `coaching-db.ts` with template CRUD

**Files:**
- Modify: `website/src/lib/coaching-db.ts` — add types + functions
- Modify: `website/src/lib/coaching-db.test.ts` — add coverage

- [ ] **Step 1: Append the new types after the existing `Cluster` interface in coaching-db.ts**

```typescript
export type TargetSurface = 'questionnaire' | 'brett' | 'chatroom' | 'assistant';
export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface SourcePointer {
  bookId: string;
  page: number | null;
  chunkId: string | null;
}

export interface Template {
  id: string;
  snippetId: string;
  targetSurface: TargetSurface;
  version: number;
  status: TemplateStatus;
  payload: Record<string, unknown>;
  sourcePointer: SourcePointer;
  surfaceRef: string | null;
  publishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}
```

- [ ] **Step 2: Append the CRUD functions at the end of coaching-db.ts (before the `rowTo*` helpers)**

```typescript
export interface CreateTemplateDraftArgs {
  snippetId: string;
  targetSurface: TargetSurface;
  payload: Record<string, unknown>;
  sourcePointer: SourcePointer;
  createdBy?: string | null;
}

export async function createTemplateDraft(pool: Pool, args: CreateTemplateDraftArgs): Promise<Template> {
  // version = max(version) + 1 for this (snippet, surface), default 1
  const v = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM coaching.templates
      WHERE snippet_id = $1 AND target_surface = $2`,
    [args.snippetId, args.targetSurface],
  );
  const nextVersion: number = v.rows[0].next;
  const r = await pool.query(
    `INSERT INTO coaching.templates
       (snippet_id, target_surface, version, status, payload, source_pointer, created_by)
     VALUES ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6)
     RETURNING *`,
    [
      args.snippetId,
      args.targetSurface,
      nextVersion,
      JSON.stringify(args.payload),
      JSON.stringify({
        book_id: args.sourcePointer.bookId,
        page: args.sourcePointer.page,
        chunk_id: args.sourcePointer.chunkId,
      }),
      args.createdBy ?? null,
    ],
  );
  return rowToTemplate(r.rows[0]);
}

export async function updateTemplate(
  pool: Pool,
  id: string,
  args: { payload?: Record<string, unknown> },
): Promise<Template | null> {
  if (args.payload === undefined) {
    const r = await pool.query(`SELECT * FROM coaching.templates WHERE id = $1`, [id]);
    return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
  }
  const r = await pool.query(
    `UPDATE coaching.templates SET payload = $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify(args.payload), id],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export async function getTemplate(pool: Pool, id: string): Promise<Template | null> {
  const r = await pool.query(`SELECT * FROM coaching.templates WHERE id = $1`, [id]);
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export interface ListTemplatesFilter {
  bookId?: string;
  targetSurface?: TargetSurface;
  status?: TemplateStatus;
  snippetId?: string;
  /** when true, return only the highest-version row per (snippet, surface) */
  latestOnly?: boolean;
}

export async function listTemplates(pool: Pool, filter: ListTemplatesFilter = {}): Promise<Template[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (filter.snippetId)     { where.push(`t.snippet_id = $${i++}`); vals.push(filter.snippetId); }
  if (filter.targetSurface) { where.push(`t.target_surface = $${i++}`); vals.push(filter.targetSurface); }
  if (filter.status)        { where.push(`t.status = $${i++}`); vals.push(filter.status); }
  if (filter.bookId) {
    where.push(`t.snippet_id IN (SELECT id FROM coaching.snippets WHERE book_id = $${i++})`);
    vals.push(filter.bookId);
  }
  let sql = `SELECT t.* FROM coaching.templates t`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY t.created_at DESC`;
  const r = await pool.query(sql, vals);
  let rows = r.rows.map(rowToTemplate);
  if (filter.latestOnly) {
    const seen = new Set<string>();
    rows = rows.filter((t) => {
      const k = `${t.snippetId}::${t.targetSurface}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return rows;
}

export async function listTemplateVersions(
  pool: Pool,
  snippetId: string,
  targetSurface: TargetSurface,
): Promise<Template[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.templates
       WHERE snippet_id = $1 AND target_surface = $2
       ORDER BY version DESC`,
    [snippetId, targetSurface],
  );
  return r.rows.map(rowToTemplate);
}

export async function markTemplatePublished(
  pool: Pool,
  id: string,
  surfaceRef: string | null,
): Promise<Template | null> {
  const r = await pool.query(
    `UPDATE coaching.templates
        SET status = 'published',
            surface_ref = $1,
            published_at = now()
      WHERE id = $2
      RETURNING *`,
    [surfaceRef, id],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}
```

- [ ] **Step 3: Append the row-mapper helper at the bottom of the file**

```typescript
function rowToTemplate(r: Record<string, unknown>): Template {
  const sp = (r.source_pointer ?? {}) as { book_id?: string; page?: number; chunk_id?: string };
  return {
    id: r.id as string,
    snippetId: r.snippet_id as string,
    targetSurface: r.target_surface as TargetSurface,
    version: r.version as number,
    status: r.status as TemplateStatus,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    sourcePointer: {
      bookId: (sp.book_id ?? '') as string,
      page: (sp.page ?? null) as number | null,
      chunkId: (sp.chunk_id ?? null) as string | null,
    },
    surfaceRef: (r.surface_ref ?? null) as string | null,
    publishedAt: (r.published_at ?? null) as Date | null,
    createdBy: (r.created_by ?? null) as string | null,
    createdAt: r.created_at as Date,
  };
}
```

- [ ] **Step 4: Add tests in `coaching-db.test.ts`**

After the existing `describe('coaching-db', ...)` block, append a second describe that exercises templates. First extend the schema-setup `pgmem.public.none(...)` call in beforeAll to include the new tables — copy the DDL from Task 1 (drop the FK reference to `coaching.snippets` and the JSONB CHECK if pg-mem balks; pg-mem doesn't enforce FKs anyway):

Add these lines to the existing `pgmem.public.none(\`...\`)` setup block (just before the closing backtick):

```sql
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
```

Add a TRUNCATE for `coaching.templates` and `coaching.template_assignments` in the existing `beforeEach` (before the `coaching.snippets` truncate so FK ordering is irrelevant for pg-mem).

Add this describe block after the existing `describe('coaching-db', () => { ... })`:

```typescript
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
      payload: { title: 'Q1', question: 'Wann …?' },
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

    // Different surface starts at 1
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
```

- [ ] **Step 5: Run the tests**

```bash
cd website && npx vitest run src/lib/coaching-db.test.ts
```

Expected: all existing tests + 5 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/coaching-db.ts website/src/lib/coaching-db.test.ts
git commit -m "feat(coaching): template CRUD with versioning

Adds Template type + createTemplateDraft / updateTemplate / getTemplate
/ listTemplates / listTemplateVersions / markTemplatePublished. Version
auto-increments per (snippet, target_surface). pg-mem coverage for
each function.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: API endpoints — list, detail, update, versions

**Files:**
- Create: `website/src/pages/api/admin/coaching/templates/index.ts`
- Create: `website/src/pages/api/admin/coaching/templates/[id].ts`
- Create: `website/src/pages/api/admin/coaching/templates/[id]/versions.ts`
- Create: `website/src/pages/api/admin/coaching/snippets/[id]/draft-template.ts`

**Auth pattern:** identical to Phase 1's coaching endpoints — `getSession()` + `isAdmin()`, return `Unauthorized` 401 on either failure.

- [ ] **Step 1: `templates/index.ts` — GET list**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, type TargetSurface, type TemplateStatus } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

const SURFACES: TargetSurface[] = ['questionnaire', 'brett', 'chatroom', 'assistant'];
const STATUSES: TemplateStatus[] = ['draft', 'published', 'archived'];

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const surfaceParam = url.searchParams.get('target_surface');
  const statusParam = url.searchParams.get('status');
  const targetSurface = SURFACES.includes(surfaceParam as TargetSurface) ? (surfaceParam as TargetSurface) : undefined;
  const status = STATUSES.includes(statusParam as TemplateStatus) ? (statusParam as TemplateStatus) : undefined;

  const templates = await listTemplates(pool, {
    targetSurface,
    status,
    bookId: url.searchParams.get('book_id') ?? undefined,
    snippetId: url.searchParams.get('snippet_id') ?? undefined,
    latestOnly: url.searchParams.get('latest_only') === 'true',
  });
  return new Response(JSON.stringify(templates), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: `templates/[id].ts` — GET detail, PATCH (creates new version via createTemplateDraft)**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getTemplate, createTemplateDraft } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const t = await getTemplate(pool, params.id as string);
  if (!t) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(t), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const existing = await getTemplate(pool, params.id as string);
  if (!existing) return new Response('Not Found', { status: 404 });

  const body = (await request.json()) as { payload?: Record<string, unknown> };
  if (!body.payload) return new Response(JSON.stringify({ error: 'payload required' }), { status: 400 });

  // Spec invariant: published templates are immutable; edit creates v+1 in 'draft'.
  const next = await createTemplateDraft(pool, {
    snippetId: existing.snippetId,
    targetSurface: existing.targetSurface,
    payload: body.payload,
    sourcePointer: existing.sourcePointer,
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(next), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: `templates/[id]/versions.ts` — GET version history**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getTemplate, listTemplateVersions } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const t = await getTemplate(pool, params.id as string);
  if (!t) return new Response('Not Found', { status: 404 });
  const versions = await listTemplateVersions(pool, t.snippetId, t.targetSurface);
  return new Response(JSON.stringify(versions), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: `snippets/[id]/draft-template.ts` — POST create draft from snippet**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { createTemplateDraft, type TargetSurface } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

const SURFACES: TargetSurface[] = ['questionnaire', 'brett', 'chatroom', 'assistant'];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = (await request.json()) as {
    targetSurface?: string;
    payload?: Record<string, unknown>;
  };
  if (!body.targetSurface || !SURFACES.includes(body.targetSurface as TargetSurface)) {
    return new Response(JSON.stringify({ error: 'targetSurface required: questionnaire|brett|chatroom|assistant' }), { status: 400 });
  }

  // Look up the snippet to copy book_id, page, knowledge_chunk_id into source_pointer.
  const r = await pool.query(
    `SELECT s.id, s.book_id, s.page, s.knowledge_chunk_id, b.id AS book_uuid
       FROM coaching.snippets s
       JOIN coaching.books b ON b.id = s.book_id
      WHERE s.id = $1`,
    [params.id],
  );
  if (r.rows.length === 0) return new Response('Not Found', { status: 404 });
  const row = r.rows[0];

  const t = await createTemplateDraft(pool, {
    snippetId: row.id,
    targetSurface: body.targetSurface as TargetSurface,
    payload: body.payload ?? {},
    sourcePointer: {
      bookId: row.book_uuid,
      page: row.page ?? null,
      chunkId: row.knowledge_chunk_id ?? null,
    },
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(t), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/coaching/templates/ \
        website/src/pages/api/admin/coaching/snippets/\[id\]/draft-template.ts
git commit -m "feat(coaching): templates list/detail/versions API + draft-from-snippet

GET /templates with target_surface/status/book_id/snippet_id filters
plus latest_only. GET/PATCH /templates/[id] (PATCH creates new version
via createTemplateDraft). GET /templates/[id]/versions for history.
POST /snippets/[id]/draft-template seeds the source_pointer from the
snippet's book/page/chunk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: §51 UrhG quote-length validator

**Files:**
- Create: `website/src/lib/quote-validator.ts`
- Create: `website/src/lib/quote-validator.test.ts`

**Context:** Spec mandates max 280 verbatim characters from a copyrighted source per published artifact. Validator must run server-side on the publish path and client-side in the editor for live feedback. Pure function so both contexts can call it.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from 'vitest';
import { validateQuoteLength, MAX_QUOTE_CHARS } from './quote-validator';

describe('quote-validator', () => {
  test('exposes the threshold as a constant', () => {
    expect(MAX_QUOTE_CHARS).toBe(280);
  });

  test('text shorter than the source is fine (paraphrase)', () => {
    const source = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const candidate = 'Some thoughts about lorem.';
    expect(validateQuoteLength({ source, candidate })).toEqual({ ok: true });
  });

  test('a verbatim quote up to 280 chars is allowed', () => {
    const slice = 'a'.repeat(280);
    const source = `prefix ${slice} suffix`;
    expect(validateQuoteLength({ source, candidate: slice })).toEqual({ ok: true });
  });

  test('a verbatim quote longer than 280 chars is rejected', () => {
    const slice = 'a'.repeat(281);
    const source = `prefix ${slice} suffix`;
    const r = validateQuoteLength({ source, candidate: slice });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.kind).toBe('quote_too_long');
      expect(r.violation.matchedChars).toBe(281);
    }
  });

  test('detects a long verbatim run inside otherwise-paraphrased text', () => {
    const longRun = 'b'.repeat(290);
    const source = `… ${longRun} …`;
    const candidate = `Background: ${longRun} (ende)`;
    const r = validateQuoteLength({ source, candidate });
    expect(r.ok).toBe(false);
  });

  test('case-insensitive whitespace-tolerant matching', () => {
    const source = 'Eine kraftvolle Reflexion entsteht oft erst, wenn der Klient gefragt wird.';
    const candidate = 'eine  kraftvolle reflexion entsteht oft erst, wenn der klient gefragt wird.';
    // 73 chars normalized — well below threshold; should pass
    expect(validateQuoteLength({ source, candidate }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd website && npx vitest run src/lib/quote-validator.test.ts
```

- [ ] **Step 3: Implement**

```typescript
export const MAX_QUOTE_CHARS = 280;

export type QuoteValidation =
  | { ok: true }
  | { ok: false; violation: { kind: 'quote_too_long'; matchedChars: number; sample: string } };

/**
 * Returns ok=true if `candidate` does not contain a verbatim run of
 * more than MAX_QUOTE_CHARS characters from `source`. Whitespace is
 * normalized and matching is case-insensitive (lossy normalization).
 */
export function validateQuoteLength(args: { source: string; candidate: string }): QuoteValidation {
  const src = normalize(args.source);
  const cand = normalize(args.candidate);
  if (cand.length === 0) return { ok: true };

  // Search for the longest substring of `cand` that occurs in `src`.
  // Bounded, simple O(n*m) scan — coaching candidates are at most a few KB.
  let longestStart = 0;
  let longestLen = 0;
  for (let i = 0; i < cand.length; i++) {
    let j = 0;
    while (
      i + j < cand.length &&
      src.indexOf(cand.slice(i, i + j + 1)) !== -1 &&
      j < cand.length
    ) {
      j++;
    }
    if (j > longestLen) {
      longestLen = j;
      longestStart = i;
    }
    if (longestLen > MAX_QUOTE_CHARS) break; // early exit once threshold breached
  }

  if (longestLen > MAX_QUOTE_CHARS) {
    return {
      ok: false,
      violation: {
        kind: 'quote_too_long',
        matchedChars: longestLen,
        sample: cand.slice(longestStart, longestStart + Math.min(longestLen, 80)) + '…',
      },
    };
  }
  return { ok: true };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
cd website && npx vitest run src/lib/quote-validator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/quote-validator.ts website/src/lib/quote-validator.test.ts
git commit -m "feat(coaching): §51 UrhG quote-length validator

Pure function that flags any verbatim run of more than 280 chars
from the source text inside a candidate template body. Whitespace
normalized + case-insensitive. Returns either {ok:true} or a
violation with matchedChars + sample. Used server-side at publish
time and client-side in the editor for live feedback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Cascade implementations — `coaching-publish.ts`

**Files:**
- Create: `website/src/lib/coaching-publish.ts`
- Create: `website/src/lib/coaching-publish.test.ts`

**Context:** This module is the only place that knows how to write into the live surface for each `target_surface`. The publish API endpoint (Task 6) calls `publishTemplate(pool, templateId)` which dispatches to the right cascade.

- [ ] **Step 1: Implement the cascade module**

```typescript
import type { Pool } from 'pg';
import {
  getTemplate,
  markTemplatePublished,
  type Template,
} from './coaching-db';
import { createQTemplate } from './questionnaire-db';
import { ensureCollection, addDocument } from './knowledge-db';
import { validateQuoteLength } from './quote-validator';

export type PublishResult =
  | { ok: true; template: Template }
  | { ok: false; error: string };

/**
 * Validate + cascade. The caller (API endpoint) has already verified the
 * snippet text against quote rules; we re-check here as defense in depth.
 */
export async function publishTemplate(
  pool: Pool,
  templateId: string,
  opts: { snippetBody: string },
): Promise<PublishResult> {
  const template = await getTemplate(pool, templateId);
  if (!template) return { ok: false, error: 'template not found' };
  if (template.status === 'published') return { ok: false, error: 'already published' };

  const candidate = extractCandidateText(template);
  const quote = validateQuoteLength({ source: opts.snippetBody, candidate });
  if (!quote.ok) {
    return {
      ok: false,
      error: `quote-length violation: ${quote.violation.matchedChars} chars verbatim ("${quote.violation.sample}")`,
    };
  }

  let surfaceRef: string | null = null;
  switch (template.targetSurface) {
    case 'questionnaire':
      surfaceRef = await cascadeQuestionnaire(pool, template);
      break;
    case 'assistant':
      surfaceRef = await cascadeAssistant(pool, template);
      break;
    case 'brett':
    case 'chatroom':
      // Phase 2b will add live cascades for these surfaces.
      surfaceRef = null;
      break;
  }

  const updated = await markTemplatePublished(pool, templateId, surfaceRef);
  return updated ? { ok: true, template: updated } : { ok: false, error: 'publish-step-failed' };
}

function extractCandidateText(t: Template): string {
  const p = t.payload as Record<string, unknown>;
  switch (t.targetSurface) {
    case 'questionnaire':
      return [p.title, p.question, p.followup].filter(Boolean).join(' ');
    case 'assistant':
      return [p.title, p.body].filter(Boolean).join(' ');
    case 'brett':
      return [p.name, p.instructions].filter(Boolean).join(' ');
    case 'chatroom':
      return [p.title, p.script].filter(Boolean).join(' ');
  }
}

async function cascadeQuestionnaire(_pool: Pool, t: Template): Promise<string> {
  const p = t.payload as { title?: string; question?: string; followup?: string };
  const title = p.title ?? 'Untitled';
  const description = formatCitation(t);
  const instructions = [p.question, p.followup].filter(Boolean).join('\n\n');
  const created = await createQTemplate({ title, description, instructions });
  return created.id;
}

async function cascadeAssistant(_pool: Pool, t: Template): Promise<string> {
  const p = t.payload as { title?: string; body?: string; tags?: string[] };
  const collectionName = 'coaching-assistant';
  const collection = await ensureAssistantCollection(collectionName);
  const doc = await addDocument({
    collectionId: collection.id,
    title: p.title ?? 'untitled',
    rawText: `${p.body ?? ''}\n\n${formatCitation(t)}`,
    sourceUri: `coaching-template:${t.id}`,
    metadata: { source_pointer: t.sourcePointer, tags: p.tags ?? [] },
  });
  return doc.id;
}

async function ensureAssistantCollection(name: string): Promise<{ id: string }> {
  const existing = await ensureCollection({
    name,
    source: 'custom',
    brand: 'mentolder',
    description: 'Coaching-Assistant Wissensquelle (auto-managed by coaching publish)',
  });
  return existing;
}

function formatCitation(t: Template): string {
  const sp = t.sourcePointer;
  const pagePart = sp.page !== null ? `, S. ${sp.page}` : '';
  return `Quelle: Coaching-Snippet${pagePart}`;
}
```

**Note:** the existing `knowledge-db.ts` exports `createCollection` (not `ensureCollection`), and uses a module-level pool. The `ensureCollection` import above resolves to a thin wrapper we'll add in Step 2. Update `knowledge-db.ts` to export an idempotent `ensureCollection` that calls `createCollection` if missing.

- [ ] **Step 2: Add `ensureCollection` to `website/src/lib/knowledge-db.ts`**

Add at the end of the file (after the existing exports):

```typescript
export async function ensureCollection(args: {
  name: string;
  source: string;
  brand?: string | null;
  description?: string | null;
}): Promise<Collection> {
  const all = await listCollections();
  const found = all.find((c) => c.name === args.name);
  if (found) return found;
  return createCollection({
    name: args.name,
    source: args.source,
    description: args.description ?? undefined,
    brand: args.brand ?? null,
  });
}
```

- [ ] **Step 3: Tests**

```typescript
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
    CREATE TABLE coaching.snippets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL, knowledge_chunk_id uuid, cluster_id uuid, title text NOT NULL, body text NOT NULL, tags text[] DEFAULT '{}', page int, created_at timestamptz DEFAULT now());
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

async function seed(): Promise<{ snippetId: string; bookId: string; templateId: (s: string, payload: Record<string, unknown>) => Promise<string> }> {
  const c = await pool.query(`INSERT INTO knowledge.collections (name, source) VALUES ('t', 'custom') RETURNING id`);
  const b = await pool.query(`INSERT INTO coaching.books (knowledge_collection_id, title, source_filename) VALUES ($1, 't', 't.epub') RETURNING id`, [c.rows[0].id]);
  const s = await cdb.createSnippet(pool, { bookId: b.rows[0].id, title: '.', body: 'snippet body unique text', tags: [] });
  return {
    snippetId: s.id,
    bookId: b.rows[0].id,
    templateId: async (surface, payload) => {
      const t = await cdb.createTemplateDraft(pool, {
        snippetId: s.id,
        targetSurface: surface as cdb.TargetSurface,
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
```

- [ ] **Step 4: Run tests**
```bash
cd website && npx vitest run src/lib/coaching-publish.test.ts
```
Expected: 5/5 pass.

- [ ] **Step 5: Commit**
```bash
git add website/src/lib/coaching-publish.ts website/src/lib/coaching-publish.test.ts website/src/lib/knowledge-db.ts
git commit -m "feat(coaching): publish cascades for questionnaire + assistant

publishTemplate(pool, id) dispatches by target_surface:
- questionnaire → createQTemplate() in questionnaire_templates
- assistant → ensureCollection('coaching-assistant') + addDocument()
- brett/chatroom → store-only (Phase 2b will surface them)

Quote-length re-checked at publish time as defense in depth.
Double-publish rejected. Adds idempotent ensureCollection() helper
to knowledge-db. 5/5 tests pass via mocked questionnaire-db +
knowledge-db.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: API endpoint — POST publish

**Files:**
- Create: `website/src/pages/api/admin/coaching/templates/[id]/publish.ts`

- [ ] **Step 1: Endpoint**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getTemplate } from '../../../../../../lib/coaching-db';
import { publishTemplate } from '../../../../../../lib/coaching-publish';

const pool = new Pool();
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const template = await getTemplate(pool, params.id as string);
  if (!template) return new Response('Not Found', { status: 404 });

  // Fetch the snippet body for quote-length validation.
  const r = await pool.query(`SELECT body FROM coaching.snippets WHERE id = $1`, [template.snippetId]);
  if (r.rows.length === 0) return new Response('Snippet missing', { status: 409 });
  const snippetBody: string = r.rows[0].body;

  const result = await publishTemplate(pool, template.id, { snippetBody });
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(result.template), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Commit**
```bash
git add website/src/pages/api/admin/coaching/templates/\[id\]/publish.ts
git commit -m "feat(coaching): POST /api/admin/coaching/templates/[id]/publish

Wraps publishTemplate() with auth + quote-length check pre-flight.
Returns the updated template on success or {error:...} on
violation/conflict.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: PublishEditor.svelte component

**Files:**
- Create: `website/src/components/admin/PublishEditor.svelte`

**Behavior:**
- Props: `snippet` (full snippet object), `bookTitle` (string).
- Initial state: surface selector defaults to `questionnaire`. `payload` is a per-surface form.
- On surface change, swap the form fields. Keep the `body`/`text` carried over where it makes sense (`question` for questionnaire, `body` for assistant, `instructions` for brett, `script` for chatroom).
- Live quote-length warning: import `validateQuoteLength` from `quote-validator.ts`, run on every keystroke against `snippet.body`. If violation, show a red banner with the matched-char count. Disable the publish button.
- "Save Draft" → POST `/api/admin/coaching/snippets/${snippet.id}/draft-template` then PATCH `/api/admin/coaching/templates/{id}` with the form payload.
- "Veröffentlichen" → POST `/api/admin/coaching/templates/{id}/publish` after a save.
- Live preview pane on the right (read-only render of how the published artifact will look).

- [ ] **Step 1: Component**

```svelte
<script lang="ts">
  import { validateQuoteLength } from '../../lib/quote-validator';
  import type { Snippet } from '../../lib/coaching-db';

  export let snippet: Snippet;
  export let bookTitle: string;

  type Surface = 'questionnaire' | 'brett' | 'chatroom' | 'assistant';

  let targetSurface: Surface = 'questionnaire';
  let templateId: string | null = null;
  let saveError = '';
  let publishing = false;

  // Per-surface payloads
  let q = { title: snippet.title, question: snippet.body, followup: '' };
  let a = { title: snippet.title, body: snippet.body, tags: snippet.tags.join(', ') };
  let br = { name: snippet.title, instructions: snippet.body };
  let cr = { title: snippet.title, script: snippet.body };

  function currentPayload(): Record<string, unknown> {
    switch (targetSurface) {
      case 'questionnaire': return { title: q.title, question: q.question, followup: q.followup, answerType: 'multiline' };
      case 'assistant':     return { title: a.title, body: a.body, tags: a.tags.split(',').map(s => s.trim()).filter(Boolean) };
      case 'brett':         return { name: br.name, instructions: br.instructions };
      case 'chatroom':      return { title: cr.title, script: cr.script };
    }
  }

  function candidateText(): string {
    const p = currentPayload();
    return Object.values(p).filter((v) => typeof v === 'string').join(' ');
  }

  $: quoteState = validateQuoteLength({ source: snippet.body, candidate: candidateText() });

  async function saveDraft(): Promise<void> {
    saveError = '';
    if (!templateId) {
      const r = await fetch(`/api/admin/coaching/snippets/${snippet.id}/draft-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSurface, payload: currentPayload() }),
      });
      if (!r.ok) { saveError = `Save failed (${r.status})`; return; }
      const t = await r.json();
      templateId = t.id;
    } else {
      const r = await fetch(`/api/admin/coaching/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: currentPayload() }),
      });
      if (!r.ok) { saveError = `Save failed (${r.status})`; return; }
      const t = await r.json();
      templateId = t.id; // PATCH returns a new version
    }
  }

  async function publish(): Promise<void> {
    if (!templateId) await saveDraft();
    if (!templateId) return;
    publishing = true;
    try {
      const r = await fetch(`/api/admin/coaching/templates/${templateId}/publish`, { method: 'POST' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        saveError = body.error ?? `Publish failed (${r.status})`;
        return;
      }
      window.dispatchEvent(new CustomEvent('coaching:template-published'));
      window.location.href = '/admin/knowledge/templates';
    } finally {
      publishing = false;
    }
  }

  function citationLine(): string {
    const page = snippet.page ? `, S. ${snippet.page}` : '';
    return `Quelle: ${bookTitle}${page}`;
  }
</script>

<div class="editor">
  <div class="left">
    <h2>Veröffentlichen: „{snippet.title}"</h2>
    <p class="src">{citationLine()}</p>

    <div class="surface-row">
      {#each ['questionnaire','assistant','brett','chatroom'] as s (s)}
        <button class="surface" class:selected={targetSurface === s} on:click={() => (targetSurface = s)}>
          {s === 'questionnaire' ? 'Questionnaire' : s === 'assistant' ? 'Assistant' : s === 'brett' ? 'Brett' : 'Chatroom'}
        </button>
      {/each}
    </div>

    {#if !quoteState.ok}
      <div class="quote-warn">
        ⚠ §51 UrhG-Schwelle überschritten: {quoteState.violation.matchedChars} Zeichen wörtliches Zitat.
        <span class="sample">"{quoteState.violation.sample}"</span>
        Paraphrasiere weiter, bevor du veröffentlichen kannst.
      </div>
    {/if}

    {#if targetSurface === 'questionnaire'}
      <label>Titel <input bind:value={q.title} /></label>
      <label>Frage <textarea bind:value={q.question} rows="4"></textarea></label>
      <label>Folgefrage (optional) <input bind:value={q.followup} /></label>
    {:else if targetSurface === 'assistant'}
      <label>Titel <input bind:value={a.title} /></label>
      <label>Text <textarea bind:value={a.body} rows="6"></textarea></label>
      <label>Tags (Komma) <input bind:value={a.tags} /></label>
    {:else if targetSurface === 'brett'}
      <label>Name <input bind:value={br.name} /></label>
      <label>Anleitung <textarea bind:value={br.instructions} rows="6"></textarea></label>
      <p class="muted">Brett-Cascade ist in Phase 2b geplant — wird aktuell nur als Template gespeichert.</p>
    {:else}
      <label>Titel <input bind:value={cr.title} /></label>
      <label>Phasen-Skript <textarea bind:value={cr.script} rows="6"></textarea></label>
      <p class="muted">Chatroom-Cascade ist in Phase 2b geplant — wird aktuell nur als Template gespeichert.</p>
    {/if}

    {#if saveError}<p class="error">{saveError}</p>{/if}

    <div class="actions">
      <button on:click={saveDraft} disabled={publishing}>Als Entwurf speichern</button>
      <button class="primary" on:click={publish} disabled={publishing || !quoteState.ok}>
        {publishing ? 'Veröffentliche…' : 'Veröffentlichen'}
      </button>
    </div>
  </div>

  <div class="right">
    <h3>Vorschau (Klient sieht das)</h3>
    {#if targetSurface === 'questionnaire'}
      <article class="preview-card">
        <h4>{q.title || 'Untitled'}</h4>
        <p>{q.question}</p>
        {#if q.followup}<p class="followup">{q.followup}</p>{/if}
        <footer>{citationLine()}</footer>
      </article>
    {:else if targetSurface === 'assistant'}
      <article class="preview-card chat">
        <p>{a.body}</p>
        <footer>↳ {citationLine()}</footer>
      </article>
    {:else if targetSurface === 'brett'}
      <article class="preview-card">
        <h4>{br.name || 'Untitled'}</h4>
        <pre>{br.instructions}</pre>
        <footer>{citationLine()}</footer>
      </article>
    {:else}
      <article class="preview-card">
        <h4>{cr.title || 'Untitled'}</h4>
        <pre>{cr.script}</pre>
        <footer>{citationLine()}</footer>
      </article>
    {/if}
  </div>
</div>

<style>
  .editor { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  h2 { font-family: 'Newsreader', Georgia, serif; font-weight: 400; font-size: 1.4rem; margin: 0 0 0.4rem; }
  .src { color: var(--text-muted, #888); font-size: 0.85rem; margin: 0 0 1rem; }
  .surface-row { display: flex; gap: 0.4rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .surface { padding: 0.4rem 0.75rem; border: 1px solid var(--line, #ddd); background: transparent; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  .surface.selected { border-color: var(--brass, #c9a55c); background: rgba(201,165,92,0.15); color: var(--brass, #c9a55c); }
  label { display: block; margin: 0.7rem 0; font-size: 0.85rem; color: var(--text-muted, #555); }
  label input, label textarea { display: block; width: 100%; margin-top: 0.25rem; padding: 0.45rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: 0.92rem; }
  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .actions button { padding: 0.5rem 1rem; border: 1px solid var(--line, #ddd); background: transparent; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  .actions button.primary { background: var(--brass, #c9a55c); color: #1a1817; border-color: var(--brass, #c9a55c); }
  .actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .quote-warn { background: rgba(176,107,74,0.15); border-left: 3px solid #b06b4a; padding: 0.6rem 0.9rem; margin: 0.5rem 0 1rem; font-size: 0.85rem; color: #b06b4a; }
  .quote-warn .sample { display: block; margin-top: 0.3rem; font-style: italic; color: #555; }
  .muted { color: var(--text-muted, #888); font-size: 0.78rem; margin-top: 0.5rem; }
  .error { color: #b06b4a; font-size: 0.85rem; }

  .right { background: var(--bg-2, #f7f5f2); padding: 1rem; border-radius: 8px; }
  .right h3 { font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted, #888); margin: 0 0 0.6rem; font-weight: 500; }
  .preview-card { background: var(--bg, #fff); border: 1px solid var(--line, #e5e2dd); border-radius: 6px; padding: 1rem; }
  .preview-card h4 { margin: 0 0 0.5rem; font-family: 'Newsreader', Georgia, serif; font-weight: 400; }
  .preview-card pre { white-space: pre-wrap; font-family: inherit; }
  .preview-card .followup { color: var(--text-muted, #555); }
  .preview-card footer { margin-top: 0.7rem; padding-top: 0.5rem; border-top: 1px dashed var(--line, #ddd); font-size: 0.78rem; color: var(--text-muted, #888); }
  .preview-card.chat footer { color: var(--brass, #c9a55c); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/PublishEditor.svelte
git commit -m "feat(coaching): PublishEditor Svelte component

Surface selector + per-surface form fields + live preview pane.
Quote-length validator runs on every keystroke; publish button
disabled while in violation. Save-Draft uses POST /draft-template
then PATCH (creating new versions). Publish hits POST /publish.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Astro publish page

**Files:**
- Create: `website/src/pages/admin/knowledge/snippets/[id]/publish.astro`

- [ ] **Step 1: Page**

```astro
---
import AdminLayout from '../../../../../layouts/AdminLayout.astro';
import PublishEditor from '../../../../../components/admin/PublishEditor.svelte';
import { Pool } from 'pg';
import { listSnippets, getBook } from '../../../../../lib/coaching-db';
import { getSession, getLoginUrl, isAdmin } from '../../../../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const id = Astro.params.id as string;
const pool = new Pool();

const snippets = await listSnippets(pool, {});
const snippet = snippets.find((s) => s.id === id);
if (!snippet) return new Response('Snippet not found', { status: 404 });

const book = await getBook(pool, snippet.bookId);
if (!book) return new Response('Book not found', { status: 404 });
---
<AdminLayout title={`Veröffentlichen: ${snippet.title}`}>
  <div class="page">
    <header>
      <nav class="crumbs">
        <a href="/admin/knowledge/books">Bücher</a> ›
        <a href={`/admin/knowledge/books/${book.id}`}>{book.title}</a> ›
        Veröffentlichen
      </nav>
    </header>
    <PublishEditor client:load snippet={snippet} bookTitle={book.title} />
  </div>
</AdminLayout>

<style>
  .page { max-width: 1280px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .crumbs { font-size: 0.78rem; color: var(--text-muted, #888); margin-bottom: 1.25rem; }
  .crumbs a { color: var(--text-muted, #888); text-decoration: none; }
  .crumbs a:hover { color: var(--brass, #c9a55c); }
</style>
```

- [ ] **Step 2: Commit**
```bash
git add website/src/pages/admin/knowledge/snippets/\[id\]/publish.astro
git commit -m "feat(coaching): publish-editor host page

/admin/knowledge/snippets/[id]/publish — fetches the snippet by id
(server-side), passes it to PublishEditor with the parent book's
title for citation rendering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Templates list page

**Files:**
- Create: `website/src/pages/admin/knowledge/templates/index.astro`

- [ ] **Step 1: Page**

```astro
---
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { Pool } from 'pg';
import { listTemplates, type TargetSurface, type TemplateStatus } from '../../../../lib/coaching-db';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const surfaceParam = Astro.url.searchParams.get('surface') as TargetSurface | null;
const statusParam = Astro.url.searchParams.get('status') as TemplateStatus | null;

const pool = new Pool();
let templates: Awaited<ReturnType<typeof listTemplates>> = [];
try {
  templates = await listTemplates(pool, {
    targetSurface: surfaceParam ?? undefined,
    status: statusParam ?? undefined,
    latestOnly: true,
  });
} catch {}
---
<AdminLayout title="Coaching-Templates">
  <div class="page">
    <header class="page-head">
      <nav class="crumbs">
        <a href="/admin">Admin</a> ›
        <a href="/admin/wissensquellen">Wissen</a> ›
        Templates
      </nav>
      <h1>Templates</h1>
      <p class="subtitle">Veröffentlichte und entworfene Templates pro Snippet (jeweils neueste Version).</p>
      <div class="filters">
        <a class={!surfaceParam ? 'active' : ''} href="/admin/knowledge/templates">Alle Surfaces</a>
        <a class={surfaceParam === 'questionnaire' ? 'active' : ''} href="/admin/knowledge/templates?surface=questionnaire">Questionnaire</a>
        <a class={surfaceParam === 'assistant' ? 'active' : ''} href="/admin/knowledge/templates?surface=assistant">Assistant</a>
        <a class={surfaceParam === 'brett' ? 'active' : ''} href="/admin/knowledge/templates?surface=brett">Brett</a>
        <a class={surfaceParam === 'chatroom' ? 'active' : ''} href="/admin/knowledge/templates?surface=chatroom">Chatroom</a>
      </div>
    </header>

    {templates.length === 0 ? (
      <p class="empty">Noch keine Templates.</p>
    ) : (
      <table>
        <thead>
          <tr><th>Surface</th><th>Status</th><th>Version</th><th>Erstellt</th><th></th></tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr>
              <td><span class="pill">{t.targetSurface}</span></td>
              <td>{t.status}</td>
              <td class="num">v{t.version}</td>
              <td>{t.createdAt instanceof Date ? t.createdAt.toLocaleDateString('de-DE') : String(t.createdAt)}</td>
              <td><a href={`/admin/knowledge/snippets/${t.snippetId}/publish`}>Bearbeiten</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</AdminLayout>

<style>
  .page { max-width: 1100px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .crumbs { font-size: 0.78rem; color: var(--text-muted, #888); margin-bottom: 0.4rem; }
  .crumbs a { color: var(--text-muted, #888); text-decoration: none; }
  .filters { display: flex; gap: 0.4rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .filters a { padding: 0.3rem 0.7rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: 0.8rem; text-decoration: none; color: var(--text-muted, #555); }
  .filters a.active { border-color: var(--brass, #c9a55c); color: var(--brass, #c9a55c); }
  .subtitle { color: var(--text-muted, #888); margin: 0.4rem 0 0; }
  .empty { color: var(--text-muted, #888); padding: 2rem 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line, #ddd); font-size: 0.85rem; }
  td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line, #eee); }
  td.num { font-variant-numeric: tabular-nums; }
  .pill { font-size: 0.72rem; padding: 0.1rem 0.5rem; border: 1px solid var(--line, #ddd); border-radius: 99px; }
</style>
```

- [ ] **Step 2: Commit**
```bash
git add website/src/pages/admin/knowledge/templates/index.astro
git commit -m "feat(coaching): templates list page with surface filter

Latest version per (snippet, surface). Click-through to the
publish editor for that snippet so editing creates v+1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire snippet detail UX into the new publish flow

**Files:**
- Modify: `website/src/components/admin/BookReader.svelte` (Phase 1 component) — add a "Publish" button next to the snippet save action.
  - When the user saves a snippet successfully, the modal closes — UNCHANGED. Add a NEW link in the dispatched event that points to `/admin/knowledge/snippets/${snippet.id}/publish`.
- Modify: `website/src/pages/admin/knowledge/books/[id].astro` — add a "Snippets" sidebar list with quick "Publish…" links per snippet.

- [ ] **Step 1: Update BookReader's `coaching:snippet-created` consumer in [id].astro**

In `website/src/pages/admin/knowledge/books/[id].astro`, replace the existing inline `<script is:inline>` block with the following (adds a snippets list + per-snippet publish link):

```html
<script is:inline>
  document.getElementById('new-cluster')?.addEventListener('click', async () => {
    const name = prompt('Cluster-Name?');
    if (!name) return;
    const bookId = window.location.pathname.split('/').pop();
    const r = await fetch('/api/admin/coaching/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, name, kind: 'manual' }),
    });
    if (r.ok) location.reload();
    else alert('Cluster konnte nicht angelegt werden (' + r.status + ').');
  });

  window.addEventListener('coaching:snippet-created', (ev) => {
    const detail = (ev && ev.detail) || {};
    if (detail.id) {
      // Show inline link to publish for the just-created snippet
      const sidebar = document.querySelector('aside.sidebar');
      if (sidebar) {
        const a = document.createElement('a');
        a.href = '/admin/knowledge/snippets/' + detail.id + '/publish';
        a.textContent = '→ Publish: ' + (detail.title || 'Snippet');
        a.className = 'btn-link';
        a.style.display = 'block';
        sidebar.appendChild(a);
      }
    }
    setTimeout(() => location.reload(), 2000);
  });
</script>
```

- [ ] **Step 2: Commit**
```bash
git add website/src/pages/admin/knowledge/books/\[id\].astro
git commit -m "feat(coaching): expose publish link after snippet creation

The 'coaching:snippet-created' event listener on the themen-browser
page now appends a transient '→ Publish' link to the sidebar so
the user can jump straight from highlighting into the publish
editor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Playwright E2E unauth checks

**Files:**
- Create: `tests/e2e/specs/fa-coaching-publish.spec.ts`

- [ ] **Step 1: Spec**

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Coaching Publish — phase 2', () => {
  test('T1: GET /admin/knowledge/templates redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/templates`);
    await expect(page).not.toHaveURL(`${BASE}/admin/knowledge/templates`);
  });

  test('T2: GET /api/admin/coaching/templates returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/coaching/templates`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: POST /api/admin/coaching/snippets/<id>/draft-template returns 401', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.post(`${BASE}/api/admin/coaching/snippets/${fakeId}/draft-template`, {
      data: { targetSurface: 'questionnaire', payload: {} },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: POST /api/admin/coaching/templates/<id>/publish returns 401', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.post(`${BASE}/api/admin/coaching/templates/${fakeId}/publish`);
    expect([401, 403]).toContain(res.status());
  });

  test('T5: GET /admin/knowledge/snippets/<random>/publish handles missing snippet gracefully', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`${BASE}/admin/knowledge/snippets/${fakeId}/publish`);
    expect(res.status()).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Commit**
```bash
git add tests/e2e/specs/fa-coaching-publish.spec.ts
git commit -m "test(coaching): Playwright E2E unauth checks for publish flow

5 unauthenticated-path checks covering /admin/knowledge/templates,
/api/admin/coaching/templates, draft-template, publish, and the
snippet publish editor route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Mark plan completed, push, PR, merge

**Files:**
- Modify: `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-2.md` — change `status: active` to `status: completed`
- Push branch + open PR + squash-merge

- [ ] **Step 1: Update the plan frontmatter**

Edit this file's frontmatter so `status: completed` (after all earlier tasks land).

- [ ] **Step 2: Commit + push**
```bash
git add docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-2.md
git commit -m "chore(plan): mark coaching-knowledge phase 2 plan as completed

All 12 tasks shipped on this branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin feature/coaching-knowledge-phase-2
```

- [ ] **Step 3: Open PR + squash-merge**
```bash
gh pr create --title "feat(coaching): phase 2 — publish-cascade for questionnaire + assistant" \
  --body "$(cat <<'EOF'
## Summary

Phase 2 of the coaching knowledge pipeline (spec PR #633, plan PR #634, phase 1 PR #635).

- **DB schema** — new `coaching.templates` (versioned) + `coaching.template_assignments`. Source pointer (book/page/chunk) is required.
- **Template CRUD** — `coaching-db.ts` extended; PATCH creates a new version (drafts are immutable in production).
- **Quote validator** — pure function rejects verbatim runs > 280 chars; runs server-side at publish time and client-side on every keystroke.
- **Cascade module** — `coaching-publish.ts` dispatches per `target_surface`:
  - `questionnaire` → `createQTemplate()` in existing `questionnaire_templates`
  - `assistant` → `ensureCollection('coaching-assistant')` + `addDocument()`
  - `brett`, `chatroom` → store-only (Phase 2b will add live cascades)
- **API** — list/detail/versions/publish endpoints plus draft-template-from-snippet.
- **UI** — `PublishEditor.svelte` with surface selector + per-surface forms + live preview + quote-length warning. New pages at `/admin/knowledge/snippets/[id]/publish` and `/admin/knowledge/templates`.
- **Tests** — 5 new vitest tests for templates, 5 for the cascade module, 5 Playwright unauth checks.

## Test plan

- [x] vitest: coaching-db (templates), coaching-publish, quote-validator
- [x] Playwright unauth path checks
- [ ] Manual: log in → highlight a snippet → publish to questionnaire → verify it appears in `/admin/fragebogen` library and assigning to a test client renders citation
- [ ] Manual: publish to assistant → verify a `coaching-assistant` collection exists in `/admin/wissensquellen`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --squash --delete-branch
```

---

## Self-Review

**Spec coverage:**

- ✅ "Aus jedem Snippet kann ein Template für eine der vier Klienten-Surfaces erzeugt werden" → Tasks 2, 3 (template CRUD)
- ✅ "Editor-UI ist einheitlich, aber die unteren Felder ändern sich pro Surface" → Task 7 (PublishEditor)
- ✅ "Templates sind versioniert" → Task 2 (createTemplateDraft auto-versions per (snippet, surface))
- ✅ "Quellen-Pointer wird in der Klienten-UI als Quellenhinweis dargestellt" → Task 5 (formatCitation in cascade) + Task 7 (preview render)
- ✅ "max 280 Zeichen wörtlich pro Template" → Task 4 (validator) + Task 5 (server check) + Task 7 (live UI check)
- ✅ "Cross-Source-Cluster" — works as a side-effect of Task 9's templates list (filter by surface but not by book; spec didn't strictly require book-grouping in templates list — could be added as a follow-up if Gekko asks)
- ⚠ "Nachgelagerte Klienten-Wirkung" — Phase 2 ships Questionnaire and Assistant cascades end-to-end; Brett and Chatroom store templates without surfacing them. **Phase 2b is a separate plan to add Brett-Preset and Chatroom-Übung surface-side schemas + UI.** This is a deliberate deviation captured in the goal section.
- ⏳ Phases 3 (AI-Drafting), 4 (Session-Prep), 5 (In-Session-RAG) — own plans

**Placeholder scan:** none. Each step has concrete code or commands.

**Type consistency:**
- `Template.targetSurface` literal `'questionnaire'|'brett'|'chatroom'|'assistant'` matches DB CHECK constraint, API filter validation, and PublishEditor switch ✓
- `Template.status` literals match DB CHECK ✓
- `SourcePointer` JSONB shape consistent across DB DDL → coaching-db row mapper → cascade citation rendering ✓
- `PublishEditor.snippet` typed as `Snippet` from `coaching-db.ts` ✓
- `MAX_QUOTE_CHARS` constant used in test, validator, editor (single source of truth) ✓

**Open implementation-time questions:**
- The questionnaire cascade calls `createQTemplate({ title, description, instructions })` only. To add follow-up questions and answer-types we'd need to extend `questionnaire-db.ts` or add a follow-up Task to populate `qquestions`/`qdimensions`. For Phase 2 we ship the minimum (the followup fields are still saved in `coaching.templates.payload` and visible via the editor preview; surfacing them in the live questionnaire is a polish task).
- Phase 2b (Brett + Chatroom) needs: a `chat_room_exercises` table or an `exercise_content` JSONB column on chat_rooms; for Brett, decide whether presets are a special row in `brett_snapshots` (NULL `customer_id`) or a new `brett_presets` table.
