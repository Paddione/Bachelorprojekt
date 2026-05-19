---
title: Wissensquellen — Zusammenführen (Collection Merge) Implementation Plan
domains: []
status: active
pr_number: null
ticket_id: T000486
---

# Wissensquellen — Zusammenführen (Collection Merge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-in merge panel to `/admin/wissensquellen` that lets an admin combine any `custom`/`web_crawl` collections into one, and remove the obsolete books-merge infrastructure entirely.

**Architecture:** New `mergeCollections()` in `knowledge-db.ts` runs an atomic transaction (create → copy docs+chunks → delete coaching.books records → delete sources). A thin `POST /api/admin/knowledge/collections/merge` endpoint wraps it. `CollectionMergePanel.svelte` is a right-side drawer that reuses the existing `GET /api/admin/knowledge/collections` for its list.

**Tech Stack:** TypeScript, Astro, Svelte 5 (runes), pg-mem (tests), vitest

**Working directory:** `/home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge`

---

## File Map

| Action | Path |
|--------|------|
| Modify | `website/src/lib/knowledge-db.ts` — add `mergeCollections()` |
| Modify | `website/src/lib/knowledge-db.test.ts` — add coaching schema + merge tests |
| Create | `website/src/pages/api/admin/knowledge/collections/merge.ts` |
| Create | `website/src/components/admin/CollectionMergePanel.svelte` |
| Modify | `website/src/pages/admin/wissensquellen.astro` — add button + panel |
| Modify | `website/src/layouts/AdminLayout.astro` — remove Bücher + Zusammenführen nav |
| Delete | `website/src/pages/admin/knowledge/merge-books.astro` |
| Delete | `website/src/pages/admin/knowledge/books/index.astro` |
| Delete | `website/src/pages/admin/knowledge/books/[id].astro` |
| Delete | `website/src/components/admin/BookMergePanel.svelte` |
| Delete | `website/src/pages/api/admin/books/merge.ts` |
| Delete | `website/src/pages/api/admin/books/merge/suggest.ts` |
| Delete | `website/src/lib/coaching-merge.ts` |

---

## Task 1: Extend test setup with coaching schema

**Files:**
- Modify: `website/src/lib/knowledge-db.test.ts`

The existing `beforeAll` creates the pg-mem DB but has no `coaching` schema. `mergeCollections()` needs to DELETE from `coaching.books`, so the table must exist in tests.

- [ ] **Step 1: Add coaching schema to the existing `beforeAll` in `knowledge-db.test.ts`**

Find the `pgmem.public.none(` call inside `beforeAll`. It currently ends with a closing `);`. Insert the following **inside** the backtick-quoted SQL string, after the last `CREATE TABLE knowledge.chunks` block:

```sql
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.books (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      knowledge_collection_id uuid NOT NULL UNIQUE REFERENCES knowledge.collections(id) ON DELETE CASCADE,
      title text NOT NULL,
      source_filename text NOT NULL DEFAULT 'test.pdf',
      ingested_at timestamptz NOT NULL DEFAULT now()
    );
```

- [ ] **Step 2: Add `coaching.books` to the `beforeEach` truncation block**

The existing `beforeEach` truncates `knowledge.chunks`, `knowledge.documents`, `knowledge.collections`. Add `coaching.books` BEFORE collections so FK constraints don't block the truncate:

```ts
beforeEach(async () => {
  await (pool as any).query('TRUNCATE knowledge.chunks');
  await (pool as any).query('TRUNCATE knowledge.documents');
  await (pool as any).query('TRUNCATE coaching.books');
  await (pool as any).query('TRUNCATE knowledge.collections');
});
```

- [ ] **Step 3: Write the failing tests for `mergeCollections`**

Append this `describe` block at the end of `knowledge-db.test.ts`:

```ts
describe('mergeCollections', () => {
  async function seedCollection(name: string, source: 'custom' | 'web_crawl' | 'pr_history', chunks: number, model = 'voyage-multilingual-2') {
    const r = await (pool as any).query(
      `INSERT INTO knowledge.collections (name, source, chunk_count, embedding_model)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, source, chunks, model],
    );
    const colId: string = r.rows[0].id;
    const docR = await (pool as any).query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [colId, `${name}-doc`, `uri:${name}`, `text of ${name}`],
    );
    const docId: string = docR.rows[0].id;
    for (let i = 0; i < chunks; i++) {
      await (pool as any).query(
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

    const docs = await (pool as any).query(
      'SELECT * FROM knowledge.documents WHERE collection_id = $1', [merged.id],
    );
    expect(docs.rows).toHaveLength(2);

    const chunks = await (pool as any).query(
      'SELECT * FROM knowledge.chunks WHERE collection_id = $1', [merged.id],
    );
    expect(chunks.rows).toHaveLength(5);
  });

  test('deletes coaching.books records for source collections', async () => {
    const a = await seedCollection('book-src', 'custom', 2);
    const b = await seedCollection('book-src2', 'custom', 1);
    await (pool as any).query(
      `INSERT INTO coaching.books (knowledge_collection_id, title) VALUES ($1, $2)`,
      [a, 'Test Book'],
    );

    await kdb.mergeCollections({ sourceIds: [a, b], name: 'book-merged' });

    const books = await (pool as any).query(
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
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd website && npx vitest run src/lib/knowledge-db.test.ts 2>&1 | tail -30
```

Expected: failures like `TypeError: kdb.mergeCollections is not a function`

---

## Task 2: Implement `mergeCollections()` in `knowledge-db.ts`

**Files:**
- Modify: `website/src/lib/knowledge-db.ts`

- [ ] **Step 1: Add `mergeCollections` export to `knowledge-db.ts`**

Append after the `ensureCollection` function at the end of the file:

```ts
export async function mergeCollections(args: {
  sourceIds: string[];
  name: string;
  description?: string;
  brand?: string | null;
}): Promise<Collection> {
  if (args.sourceIds.length < 2) throw new Error('mindestens 2 Quellen erforderlich');
  if (!args.name.trim()) throw new Error('name erforderlich');

  const client = await p().connect();
  try {
    await client.query('BEGIN');

    // 1. Load and validate sources
    const srcRes = await client.query<{ id: string; name: string; source: string; embedding_model: string }>(
      `SELECT id, name, source, embedding_model FROM knowledge.collections WHERE id = ANY($1::uuid[])`,
      [args.sourceIds],
    );
    if (srcRes.rows.length !== args.sourceIds.length) throw new Error('not_found');

    for (const row of srcRes.rows) {
      if (row.source !== 'custom' && row.source !== 'web_crawl') {
        throw new Error(`cannot_delete: ${row.name}`);
      }
    }

    // 2. Embedding model guard
    const models = [...new Set(srcRes.rows.map(r => r.embedding_model))];
    if (models.length > 1) throw new MixedEmbeddingModelError(models);

    // 3. Create merged collection
    const newColRes = await client.query<Collection>(
      `INSERT INTO knowledge.collections (name, source, description, brand, embedding_model)
       VALUES ($1, 'custom', $2, $3, $4)
       RETURNING id, name, description, source, brand, chunk_count,
                 last_indexed_at, embedding_model, created_at, crawl_config`,
      [args.name.trim(), args.description ?? null, args.brand ?? null, models[0]],
    );
    const newCol = newColRes.rows[0];

    // 4. Copy documents + chunks from each source
    for (const srcId of args.sourceIds) {
      const docsRes = await client.query<{ id: string; title: string; source_uri: string | null; raw_text: string; sha256: string | null; metadata: unknown }>(
        `SELECT id, title, source_uri, raw_text, sha256, metadata
           FROM knowledge.documents WHERE collection_id = $1`,
        [srcId],
      );
      for (const doc of docsRes.rows) {
        const newDocRes = await client.query<{ id: string }>(
          `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [newCol.id, doc.title, doc.source_uri, doc.raw_text, doc.sha256 ?? null,
           JSON.stringify(doc.metadata ?? {})],
        );
        const newDocId = newDocRes.rows[0].id;

        await client.query(
          `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
           SELECT $1, $2, position, text, embedding, metadata
             FROM knowledge.chunks WHERE document_id = $3`,
          [newDocId, newCol.id, doc.id],
        );
      }
    }

    // 5. Recount chunks on merged collection
    await client.query(
      `UPDATE knowledge.collections
          SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
              last_indexed_at = now()
        WHERE id = $1`,
      [newCol.id],
    );

    // 6. Clean up coaching.books records (ignore if coaching schema absent)
    await client.query(
      `DELETE FROM coaching.books WHERE knowledge_collection_id = ANY($1::uuid[])`,
      [args.sourceIds],
    ).catch(() => {});

    // 7. Delete source collections (CASCADE removes their documents + chunks)
    await client.query(
      `DELETE FROM knowledge.collections WHERE id = ANY($1::uuid[])`,
      [args.sourceIds],
    );

    await client.query('COMMIT');

    // Return refreshed row with updated chunk_count
    const refreshed = await p().query<Collection>(
      `SELECT id, name, description, source, brand, chunk_count,
              last_indexed_at, embedding_model, created_at, crawl_config
         FROM knowledge.collections WHERE id = $1`,
      [newCol.id],
    );
    return refreshed.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd website && npx vitest run src/lib/knowledge-db.test.ts 2>&1 | tail -30
```

Expected: all tests in `mergeCollections` describe pass; pre-existing tests still pass.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add website/src/lib/knowledge-db.ts website/src/lib/knowledge-db.test.ts
git commit -m "feat(knowledge): add mergeCollections() with transaction + coaching.books cleanup"
```

---

## Task 3: Create the merge API endpoint

**Files:**
- Create: `website/src/pages/api/admin/knowledge/collections/merge.ts`

- [ ] **Step 1: Create the file**

```ts
// website/src/pages/api/admin/knowledge/collections/merge.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { mergeCollections, MixedEmbeddingModelError } from '../../../../../lib/knowledge-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: { sourceIds?: unknown; name?: unknown; brand?: unknown; description?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!Array.isArray(body.sourceIds) || body.sourceIds.length < 2) {
    return new Response(
      JSON.stringify({ error: 'mindestens 2 Quellen erforderlich' }),
      { status: 400 },
    );
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return new Response(JSON.stringify({ error: 'name erforderlich' }), { status: 400 });
  }

  try {
    const merged = await mergeCollections({
      sourceIds: body.sourceIds as string[],
      name: body.name.trim(),
      brand: typeof body.brand === 'string' ? body.brand : null,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    return new Response(JSON.stringify(merged), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof MixedEmbeddingModelError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('cannot_delete') || msg.includes('not_found') || msg.includes('mindestens') || msg.includes('name erforderlich')) {
      return new Response(JSON.stringify({ error: msg }), { status: 400 });
    }
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return new Response(JSON.stringify({ error: 'name bereits vergeben' }), { status: 409 });
    }
    throw err;
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no errors on the new file.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add website/src/pages/api/admin/knowledge/collections/merge.ts
git commit -m "feat(api): POST /api/admin/knowledge/collections/merge"
```

---

## Task 4: Create `CollectionMergePanel.svelte`

**Files:**
- Create: `website/src/components/admin/CollectionMergePanel.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- website/src/components/admin/CollectionMergePanel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type Col = {
    id: string;
    name: string;
    source: string;
    brand: string | null;
    chunk_count: number;
    embedding_model: string;
  };

  let open = $state(false);
  let collections = $state<Col[]>([]);
  let selected = $state(new Set<string>());
  let name = $state('');
  let brand = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  onMount(() => {
    window.addEventListener('open-collection-merge', handleOpen);
    return () => window.removeEventListener('open-collection-merge', handleOpen);
  });

  async function handleOpen() {
    open = true;
    error = null;
    successMsg = null;
    selected = new Set();
    name = '';
    brand = '';
    if (collections.length === 0) await loadCollections();
  }

  async function loadCollections() {
    const res = await fetch('/api/admin/knowledge/collections');
    if (!res.ok) return;
    const all = await res.json() as Col[];
    collections = all.filter(c => c.source === 'custom' || c.source === 'web_crawl');
  }

  function close() { open = false; }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;
  }

  function toggleAll() {
    selected = selected.size === collections.length
      ? new Set()
      : new Set(collections.map(c => c.id));
  }

  const selectedCols = $derived(collections.filter(c => selected.has(c.id)));
  const totalChunks  = $derived(selectedCols.reduce((s, c) => s + c.chunk_count, 0));

  const embeddingModels = $derived([...new Set(selectedCols.map(c => c.embedding_model))]);
  const modelMismatch   = $derived(embeddingModels.length > 1);

  const canMerge = $derived(
    !busy && selected.size >= 2 && !!name.trim() && !modelMismatch,
  );

  async function merge() {
    busy = true; error = null; successMsg = null;
    try {
      const res = await fetch('/api/admin/knowledge/collections/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: [...selected],
          name: name.trim(),
          brand: brand.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; name?: string; chunk_count?: number };
      if (!res.ok) { error = data.error ?? 'Fehler'; return; }
      successMsg = `✓ "${data.name}" erstellt — ${data.chunk_count} Chunks übertragen.`;
      setTimeout(() => location.reload(), 1500);
    } catch {
      error = 'Netzwerkfehler';
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close}></div>
  <div class="drawer" role="dialog" aria-label="Sammlungen zusammenführen">
    <div class="drawer-head">
      <span>Sammlungen zusammenführen</span>
      <button class="close-btn" onclick={close} aria-label="Schließen">✕</button>
    </div>

    <div class="list-head">
      <label class="all-toggle">
        <input type="checkbox"
               checked={selected.size === collections.length && collections.length > 0}
               indeterminate={selected.size > 0 && selected.size < collections.length}
               onchange={toggleAll} />
        Alle
      </label>
      {#if selected.size > 0}
        <span class="sel-summary">{selected.size} ausgewählt · {totalChunks} Chunks</span>
      {/if}
    </div>

    <ul class="col-list">
      {#each collections as col (col.id)}
        <li class="col-row" class:selected={selected.has(col.id)}>
          <label>
            <input type="checkbox" checked={selected.has(col.id)} onchange={() => toggle(col.id)} />
            <span class="col-name">{col.name}</span>
            <span class="badge source">{col.source === 'web_crawl' ? 'web' : 'custom'}</span>
            <span class="badge model">{col.embedding_model === 'bge-m3' ? 'bge' : 'voy'}</span>
            <span class="chunks">{col.chunk_count}</span>
          </label>
        </li>
      {/each}
      {#if collections.length === 0}
        <li class="empty">Keine custom- oder web-Quellen vorhanden.</li>
      {/if}
    </ul>

    <div class="form-section">
      {#if modelMismatch}
        <div class="model-error">
          ⚠ Modell-Konflikt: {embeddingModels.join(' ≠ ')}<br/>
          <small>Wähle nur Sammlungen mit demselben Embedding-Modell.</small>
        </div>
      {:else}
        <label class="field">
          <span>Name der Ziel-Sammlung</span>
          <input type="text" bind:value={name} placeholder="Zusammengeführte Sammlung" />
        </label>
        <label class="field">
          <span>Marke (optional)</span>
          <input type="text" bind:value={brand} placeholder="mentolder / korczewski" />
        </label>
        {#if selected.size >= 2}
          <p class="summary">{selected.size} Quellen · {totalChunks} Chunks gesamt</p>
        {/if}
        {#if error}
          <p class="err">{error}</p>
        {/if}
        {#if successMsg}
          <p class="success">{successMsg}</p>
        {/if}
      {/if}

      <button class="merge-btn" disabled={!canMerge} onclick={merge}>
        {busy ? 'Läuft…' : 'Zusammenführen & löschen'}
      </button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200;
  }
  .drawer {
    position: fixed; top: 0; right: 0; width: 440px; max-width: 100vw;
    height: 100vh; background: var(--ink-900); border-left: 1px solid var(--ink-750);
    z-index: 201; display: flex; flex-direction: column; overflow: hidden;
  }
  .drawer-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem 1.25rem; border-bottom: 1px solid var(--ink-750);
    font-weight: 600; font-size: 0.9rem; color: var(--fg); flex-shrink: 0;
  }
  .close-btn {
    background: none; border: none; color: var(--fg-soft); cursor: pointer;
    font-size: 1rem; padding: 0.25rem 0.4rem; border-radius: 4px;
  }
  .close-btn:hover { color: var(--fg); }
  .list-head {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--ink-750);
    flex-shrink: 0; font-size: 0.8rem; color: var(--fg-soft);
  }
  .all-toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
  .sel-summary { color: var(--brass); }
  .col-list {
    list-style: none; padding: 0.5rem 0; margin: 0;
    overflow-y: auto; flex: 1; min-height: 0;
  }
  .col-row label {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 1.25rem; cursor: pointer; font-size: 0.8rem;
  }
  .col-row:hover label { background: var(--ink-800); }
  .col-row.selected label { background: color-mix(in srgb, var(--brass) 8%, transparent); }
  .col-name { flex: 1; color: var(--fg); font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge {
    font-size: 10px; padding: 1px 5px; border-radius: 3px; white-space: nowrap;
    background: var(--ink-800); color: var(--fg-soft); border: 1px solid var(--ink-750);
  }
  .badge.model { color: var(--brass); border-color: color-mix(in srgb, var(--brass) 30%, transparent); }
  .chunks { font-size: 11px; color: var(--fg-soft); min-width: 2ch; text-align: right; }
  .empty { padding: 1rem 1.25rem; color: var(--fg-soft); font-style: italic; font-size: 0.82rem; }
  .form-section {
    padding: 1rem 1.25rem; border-top: 1px solid var(--ink-750);
    display: flex; flex-direction: column; gap: 0.75rem; flex-shrink: 0;
  }
  .model-error {
    background: color-mix(in srgb, #c96e6e 12%, transparent);
    border: 1px solid #c96e6e; border-radius: 6px; padding: 0.75rem;
    color: #e08080; font-size: 0.82rem; line-height: 1.5;
  }
  .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; color: var(--fg-soft); }
  .field input {
    background: var(--ink-800); border: 1px solid var(--ink-750); color: var(--fg);
    padding: 0.4rem 0.6rem; border-radius: 5px; font-size: 0.82rem;
  }
  .field input:focus { outline: none; border-color: var(--brass); }
  .summary { font-size: 0.78rem; color: var(--fg-soft); margin: 0; }
  .err { color: #c96e6e; font-size: 0.82rem; margin: 0; }
  .success { color: #6db87d; font-size: 0.82rem; margin: 0; }
  .merge-btn {
    background: var(--brass); color: var(--ink-900); border: none;
    padding: 0.6rem 1rem; border-radius: 6px; font-weight: 600;
    font-size: 0.85rem; cursor: pointer; width: 100%;
  }
  .merge-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .merge-btn:not(:disabled):hover { filter: brightness(1.1); }
</style>
```

- [ ] **Step 2: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add website/src/components/admin/CollectionMergePanel.svelte
git commit -m "feat(ui): add CollectionMergePanel slide-in drawer"
```

---

## Task 5: Wire `wissensquellen.astro`

**Files:**
- Modify: `website/src/pages/admin/wissensquellen.astro`

- [ ] **Step 1: Add the import at the top of the frontmatter block**

In the `---` frontmatter section, after the existing imports, add:

```ts
import CollectionMergePanel from '../../components/admin/CollectionMergePanel.svelte';
```

- [ ] **Step 2: Add the "Zusammenführen" button in `.head-actions`**

Find the `<div class="head-actions">` block:

```html
<div class="head-actions">
  <button id="new-crawl-btn" class="secondary">+ Web-Quelle</button>
  <button id="new-btn" class="primary">+ Neue Wissensquelle</button>
</div>
```

Replace with:

```html
<div class="head-actions">
  <button id="merge-btn" class="secondary">Zusammenführen</button>
  <button id="new-crawl-btn" class="secondary">+ Web-Quelle</button>
  <button id="new-btn" class="primary">+ Neue Wissensquelle</button>
</div>
```

- [ ] **Step 3: Mount the panel below the existing modals**

Find the two existing component mounts near the bottom of the template:

```astro
<KnowledgeSourceModal client:load onCreated={() => location.reload()} />
<WebCrawlSourceModal client:load onCreated={() => location.reload()} />
```

Add after them:

```astro
<CollectionMergePanel client:load />
```

- [ ] **Step 4: Add the event listener in the `<script is:inline>` block**

Find `document.getElementById('new-btn').addEventListener(...)` at the start of the inline script. Add a new listener before it:

```js
document.getElementById('merge-btn').addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('open-collection-merge'));
});
```

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add website/src/pages/admin/wissensquellen.astro
git commit -m "feat(wissensquellen): add Zusammenführen button + CollectionMergePanel"
```

---

## Task 6: Remove "Bücher" and "Zusammenführen" from sidebar nav

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Remove the two nav items from the "Wissen & Inhalte" group**

Find this block in `AdminLayout.astro` (around line 132–136):

```ts
{ href: '/admin/knowledge/books',     label: 'Bücher',          icon: 'book',      matches: ['/admin/knowledge/books'] },
{ href: '/admin/knowledge/drafts',    label: 'Drafts',          icon: 'edit',      matches: ['/admin/knowledge/drafts', '/admin/knowledge/snippets'], badge: draftsPending },
{ href: '/admin/knowledge/merge-books', label: 'Zusammenführen', icon: 'merge',    matches: ['/admin/knowledge/merge-books'] },
{ href: '/admin/wissensquellen',      label: 'Quellen',         icon: 'clipboard' },
{ href: '/admin/knowledge/templates', label: 'Vorlagen',        icon: 'star',      matches: ['/admin/knowledge/templates'] },
```

Replace with (remove the Bücher and Zusammenführen lines):

```ts
{ href: '/admin/knowledge/drafts',    label: 'Drafts',   icon: 'edit',      matches: ['/admin/knowledge/drafts', '/admin/knowledge/snippets'], badge: draftsPending },
{ href: '/admin/wissensquellen',      label: 'Quellen',  icon: 'clipboard' },
{ href: '/admin/knowledge/templates', label: 'Vorlagen', icon: 'star',      matches: ['/admin/knowledge/templates'] },
```

- [ ] **Step 2: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add website/src/layouts/AdminLayout.astro
git commit -m "chore(nav): remove Bücher and Zusammenführen nav items"
```

---

## Task 7: Delete dead code

**Files to delete:**
- `website/src/pages/admin/knowledge/merge-books.astro`
- `website/src/pages/admin/knowledge/books/index.astro`
- `website/src/pages/admin/knowledge/books/[id].astro`
- `website/src/components/admin/BookMergePanel.svelte`
- `website/src/pages/api/admin/books/merge.ts`
- `website/src/pages/api/admin/books/merge/suggest.ts`
- `website/src/lib/coaching-merge.ts`
- `website/src/lib/coaching-merge.test.ts`

- [ ] **Step 1: Delete the files**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
rm website/src/pages/admin/knowledge/merge-books.astro
rm website/src/pages/admin/knowledge/books/index.astro
rm "website/src/pages/admin/knowledge/books/[id].astro"
rm website/src/components/admin/BookMergePanel.svelte
rm website/src/pages/api/admin/books/merge.ts
rm website/src/pages/api/admin/books/merge/suggest.ts
rm website/src/lib/coaching-merge.ts
rm website/src/lib/coaching-merge.test.ts
rmdir website/src/pages/api/admin/books/merge 2>/dev/null || true
rmdir website/src/pages/api/admin/books 2>/dev/null || true
rmdir website/src/pages/admin/knowledge/books 2>/dev/null || true
```

- [ ] **Step 2: Check for remaining imports referencing deleted files**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
grep -r "coaching-merge\|BookMergePanel\|merge-books\|/admin/books" website/src --include="*.ts" --include="*.astro" --include="*.svelte" -l 2>/dev/null || echo "No remaining references"
```

Expected: `No remaining references` (or only files we haven't touched yet that reference them — fix any found).

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd website && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git add -A
git commit -m "chore: remove books-merge dead code (merge-books, BookMergePanel, coaching-merge)"
```

---

## Task 8: Verify end-to-end in browser

- [ ] **Step 1: Start the dev server**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge/website
npm run dev
```

- [ ] **Step 2: Open `/admin/wissensquellen`**

Navigate to `http://localhost:4321/admin/wissensquellen` (or whatever port Astro picks).

- [ ] **Step 3: Verify the header shows three buttons**

Confirm: "Zusammenführen" (secondary), "+ Web-Quelle" (secondary), "+ Neue Wissensquelle" (primary) — left to right in `.head-actions`.

- [ ] **Step 4: Click "Zusammenführen" and verify the panel opens**

- Overlay dims the background
- Drawer slides in from the right (440px)
- Collection list appears with checkboxes, source badges, model badges, chunk counts

- [ ] **Step 5: Test the happy path**

Select 2 or more custom/web_crawl collections with the same embedding model → enter a name → click "Zusammenführen & löschen" → confirm success message appears → page reloads and merged collection appears in "Eigene Sammlungen", source collections gone.

- [ ] **Step 6: Test the mismatch guard**

Select one `bge-m3` collection and one `voyage-multilingual-2` collection → confirm red warning "⚠ Modell-Konflikt:" appears and submit button is disabled.

- [ ] **Step 7: Verify nav has no Bücher or Zusammenführen items**

Open the sidebar and confirm "Wissen & Inhalte" group now shows only: Drafts, Quellen, Vorlagen.

- [ ] **Step 8: Commit and push**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/wissensquellen-merge
git push -u origin feature/wissensquellen-merge
```

---

## Post-Execution: Create ticket and PR

After all tasks complete, run:

```bash
# Create ticket
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status)
   VALUES ('task','mentolder','feat: wissensquellen merge panel',
   'Branch: feature/wissensquellen-merge\nPlan: docs/superpowers/plans/2026-05-19-wissensquellen-merge.md',
   'triage') RETURNING external_id, id;")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
echo "Ticket: $TICKET_EXT_ID"

# Create PR
gh pr create \
  --title "feat(wissensquellen): integrate collection merge panel, remove books" \
  --body "## Summary
- Adds slide-in merge panel to \`/admin/wissensquellen\` — select ≥2 custom/web_crawl collections, name the result, click merge
- New \`mergeCollections()\` in \`knowledge-db.ts\` runs atomically: create → copy docs+chunks → delete coaching.books → delete sources
- Blocks merge when selected collections have different embedding models
- Removes obsolete books-merge infrastructure: \`merge-books\` page, \`BookMergePanel.svelte\`, \`coaching-merge.ts\`, books API routes, books pages
- Removes Bücher + Zusammenführen nav items from admin sidebar

## Test plan
- [ ] \`npx vitest run src/lib/knowledge-db.test.ts\` passes (6 new mergeCollections tests)
- [ ] Open /admin/wissensquellen → Zusammenführen button present
- [ ] Panel opens, lists custom/web_crawl collections
- [ ] Merge 2+ same-model collections → success + reload
- [ ] Select mixed-model collections → red warning, submit disabled
- [ ] Nav sidebar: no Bücher / Zusammenführen items

🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --base main
```
