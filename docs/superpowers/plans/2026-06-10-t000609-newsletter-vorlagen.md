---
title: "Plan: Newsletter-Vorlagen-Bibliothek"
ticket_id: T000625
domains: [website, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Newsletter-Vorlagen-Bibliothek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a reusable content-block library for the newsletter composer — admins can save, name, and insert typed HTML blocks (header, angebot, cta, text, footer) into new campaigns without retyping them each time.

**Architecture:** New `newsletter-blocks-db.ts` with pool-injection for testability (matching the coaching-templates-db pattern), two new Astro API routes under `/api/admin/newsletter/blocks/`, new `NewsletterBlockLibrary.svelte` component, and light extensions to `NewsletterAdmin.svelte` (new "Vorlagen" tab + "Block einfügen" panel in the Compose tab).

**Tech Stack:** TypeScript, Svelte 5 ($state/$effect/$props runes), Astro API routes, PostgreSQL (pg pool), pg-mem (tests), Vitest.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `website/src/lib/newsletter-blocks-db.ts` | **Create** | DB pool injection, `ensureTable()`, all CRUD functions, types |
| `website/src/lib/newsletter-blocks-db.test.ts` | **Create** | pg-mem unit tests for all CRUD functions |
| `website/src/pages/api/admin/newsletter/blocks/index.ts` | **Create** | GET (list) + POST (create) — admin auth guard |
| `website/src/pages/api/admin/newsletter/blocks/[id].ts` | **Create** | PUT (update) + DELETE — admin auth guard |
| `website/src/components/admin/NewsletterBlockLibrary.svelte` | **Create** | Two-column library UI: block list + editor panel |
| `website/src/components/admin/NewsletterAdmin.svelte` | **Modify** | Add "Vorlagen" tab; add "Block einfügen" panel in Compose tab |

**Not touched:** `k3d/`, `scripts/factory/`, `brett/`, `newsletter-template.ts`, `newsletter-db.ts`, any other admin components.

---

## Task 1: DB layer — `newsletter-blocks-db.ts`

**Files:**
- Create: `website/src/lib/newsletter-blocks-db.ts`

- [ ] **Step 1.1: Create the file with types, pool setup, and ensureTable**

```typescript
// website/src/lib/newsletter-blocks-db.ts
import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL =
  process.env.SESSIONS_DATABASE_URL ||
  'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const defaultPool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

export type NewsletterBlockType = 'header' | 'angebot' | 'cta' | 'text' | 'footer';

export interface NewsletterContentBlock {
  id: string;
  title: string;
  block_type: NewsletterBlockType;
  html_body: string;
  created_at: Date;
  updated_at: Date;
}

async function ensureTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_content_blocks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      block_type  TEXT NOT NULL DEFAULT 'text',
      html_body   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function listContentBlocks(
  pool: pg.Pool = defaultPool,
): Promise<NewsletterContentBlock[]> {
  await ensureTable(pool);
  const result = await pool.query(
    `SELECT id, title, block_type, html_body, created_at, updated_at
     FROM newsletter_content_blocks
     ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function getContentBlock(
  id: string,
  pool: pg.Pool = defaultPool,
): Promise<NewsletterContentBlock | null> {
  await ensureTable(pool);
  const result = await pool.query(
    `SELECT id, title, block_type, html_body, created_at, updated_at
     FROM newsletter_content_blocks WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createContentBlock(
  params: { title: string; block_type: NewsletterBlockType; html_body: string },
  pool: pg.Pool = defaultPool,
): Promise<NewsletterContentBlock> {
  await ensureTable(pool);
  const result = await pool.query(
    `INSERT INTO newsletter_content_blocks (title, block_type, html_body)
     VALUES ($1, $2, $3)
     RETURNING id, title, block_type, html_body, created_at, updated_at`,
    [params.title, params.block_type, params.html_body],
  );
  return result.rows[0];
}

export async function updateContentBlock(
  id: string,
  params: { title?: string; block_type?: NewsletterBlockType; html_body?: string },
  pool: pg.Pool = defaultPool,
): Promise<NewsletterContentBlock | null> {
  await ensureTable(pool);
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  if (params.title !== undefined) {
    values.push(params.title);
    sets.push(`title = $${values.length}`);
  }
  if (params.block_type !== undefined) {
    values.push(params.block_type);
    sets.push(`block_type = $${values.length}`);
  }
  if (params.html_body !== undefined) {
    values.push(params.html_body);
    sets.push(`html_body = $${values.length}`);
  }
  if (sets.length === 1) return getContentBlock(id, pool); // only updated_at — no real change
  values.push(id);
  const result = await pool.query(
    `UPDATE newsletter_content_blocks SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, title, block_type, html_body, created_at, updated_at`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteContentBlock(
  id: string,
  pool: pg.Pool = defaultPool,
): Promise<void> {
  await ensureTable(pool);
  await pool.query(`DELETE FROM newsletter_content_blocks WHERE id = $1`, [id]);
}
```

- [ ] **Step 1.2: Verify the file compiles**

```bash
cd /tmp/wt-t000609/website
pnpm tsc --noEmit 2>&1 | grep newsletter-blocks
```

Expected: no output (no errors).

- [ ] **Step 1.3: Commit**

```bash
cd /tmp/wt-t000609
git add website/src/lib/newsletter-blocks-db.ts
git commit -m "feat(newsletter): add newsletter_content_blocks DB layer"
```

---

## Task 2: DB unit tests — `newsletter-blocks-db.test.ts`

**Files:**
- Create: `website/src/lib/newsletter-blocks-db.test.ts`

- [ ] **Step 2.1: Write the test file**

```typescript
// website/src/lib/newsletter-blocks-db.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listContentBlocks,
  getContentBlock,
  createContentBlock,
  updateContentBlock,
  deleteContentBlock,
} from './newsletter-blocks-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE TABLE newsletter_content_blocks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      block_type  TEXT NOT NULL DEFAULT 'text',
      html_body   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('createContentBlock + listContentBlocks', () => {
  it('creates a block and lists it', async () => {
    const block = await createContentBlock(
      { title: 'Willkommens-Header', block_type: 'header', html_body: '<h1>Hallo!</h1>' },
      pool,
    );
    expect(block.id).toBeTruthy();
    expect(block.title).toBe('Willkommens-Header');
    expect(block.block_type).toBe('header');
    expect(block.html_body).toBe('<h1>Hallo!</h1>');

    const list = await listContentBlocks(pool);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(b => b.id === block.id)).toBe(true);
  });

  it('creates multiple blocks of different types', async () => {
    await createContentBlock({ title: 'CTA-Block', block_type: 'cta', html_body: '<a>Jetzt buchen</a>' }, pool);
    await createContentBlock({ title: 'Footer-Gruss', block_type: 'footer', html_body: '<p>MfG</p>' }, pool);
    const list = await listContentBlocks(pool);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});

describe('getContentBlock', () => {
  it('returns a block by id', async () => {
    const created = await createContentBlock(
      { title: 'Angebot-Block', block_type: 'angebot', html_body: '<div>Angebot</div>' },
      pool,
    );
    const fetched = await getContentBlock(created.id, pool);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Angebot-Block');
  });

  it('returns null for unknown id', async () => {
    const result = await getContentBlock('00000000-0000-4000-8000-000000000000', pool);
    expect(result).toBeNull();
  });
});

describe('updateContentBlock', () => {
  it('updates title and html_body', async () => {
    const block = await createContentBlock(
      { title: 'Alt', block_type: 'text', html_body: '<p>alt</p>' },
      pool,
    );
    const updated = await updateContentBlock(
      block.id,
      { title: 'Neu', html_body: '<p>neu</p>' },
      pool,
    );
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Neu');
    expect(updated!.html_body).toBe('<p>neu</p>');
    expect(updated!.block_type).toBe('text'); // unchanged
  });

  it('returns null for unknown id', async () => {
    const result = await updateContentBlock(
      '00000000-0000-4000-8000-000000000001',
      { title: 'X' },
      pool,
    );
    expect(result).toBeNull();
  });
});

describe('deleteContentBlock', () => {
  it('removes the block so it no longer appears in list', async () => {
    const block = await createContentBlock(
      { title: 'Zu löschen', block_type: 'text', html_body: '<p>bye</p>' },
      pool,
    );
    await deleteContentBlock(block.id, pool);
    const fetched = await getContentBlock(block.id, pool);
    expect(fetched).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run the tests to verify they pass**

```bash
cd /tmp/wt-t000609/website
pnpm vitest run src/lib/newsletter-blocks-db.test.ts
```

Expected output: all tests pass, no failures.

- [ ] **Step 2.3: Commit**

```bash
cd /tmp/wt-t000609
git add website/src/lib/newsletter-blocks-db.test.ts
git commit -m "test(newsletter): add unit tests for newsletter_content_blocks CRUD"
```

---

## Task 3: API routes — `/api/admin/newsletter/blocks/`

**Files:**
- Create: `website/src/pages/api/admin/newsletter/blocks/index.ts`
- Create: `website/src/pages/api/admin/newsletter/blocks/[id].ts`

- [ ] **Step 3.1: Create the collection route (GET + POST)**

```typescript
// website/src/pages/api/admin/newsletter/blocks/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  listContentBlocks,
  createContentBlock,
  type NewsletterBlockType,
} from '../../../../../lib/newsletter-blocks-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const blocks = await listContentBlocks();
  return new Response(JSON.stringify(blocks), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let body: { title?: string; block_type?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const title = String(body.title ?? '').trim();
  const html_body = String(body.html_body ?? '').trim();
  const block_type = String(body.block_type ?? 'text').trim() as NewsletterBlockType;
  if (!title || !html_body) {
    return new Response(
      JSON.stringify({ error: 'Titel und Inhalt sind erforderlich' }),
      { status: 400 },
    );
  }
  const VALID_TYPES: NewsletterBlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
  if (!VALID_TYPES.includes(block_type)) {
    return new Response(
      JSON.stringify({ error: `Ungültiger block_type: ${block_type}` }),
      { status: 400 },
    );
  }
  const block = await createContentBlock({ title, block_type, html_body });
  return new Response(JSON.stringify(block), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3.2: Create the item route (PUT + DELETE)**

```typescript
// website/src/pages/api/admin/newsletter/blocks/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  updateContentBlock,
  deleteContentBlock,
  type NewsletterBlockType,
} from '../../../../../lib/newsletter-blocks-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  let body: { title?: string; block_type?: string; html_body?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const VALID_TYPES: NewsletterBlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
  const block_type =
    body.block_type !== undefined
      ? (String(body.block_type) as NewsletterBlockType)
      : undefined;
  if (block_type !== undefined && !VALID_TYPES.includes(block_type)) {
    return new Response(
      JSON.stringify({ error: `Ungültiger block_type: ${block_type}` }),
      { status: 400 },
    );
  }
  const updated = await updateContentBlock(id, {
    title: body.title !== undefined ? String(body.title).trim() : undefined,
    block_type,
    html_body: body.html_body !== undefined ? String(body.html_body).trim() : undefined,
  });
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Block nicht gefunden' }), { status: 404 });
  }
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  await deleteContentBlock(id);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3.3: Verify TypeScript compiles**

```bash
cd /tmp/wt-t000609/website
pnpm tsc --noEmit 2>&1 | grep blocks
```

Expected: no output (no errors).

- [ ] **Step 3.4: Commit**

```bash
cd /tmp/wt-t000609
git add website/src/pages/api/admin/newsletter/blocks/
git commit -m "feat(newsletter): add /api/admin/newsletter/blocks REST endpoints"
```

---

## Task 4: `NewsletterBlockLibrary.svelte` — library UI component

**Files:**
- Create: `website/src/components/admin/NewsletterBlockLibrary.svelte`

This component is used in the new "Vorlagen" tab. It has two panels: a left sidebar with the block list and a right main area with the editor.

- [ ] **Step 4.1: Create the component**

```svelte
<!-- website/src/components/admin/NewsletterBlockLibrary.svelte -->
<script lang="ts">
  import HtmlEditor from './HtmlEditor.svelte';

  type BlockType = 'header' | 'angebot' | 'cta' | 'text' | 'footer';

  type ContentBlock = {
    id: string;
    title: string;
    block_type: BlockType;
    html_body: string;
    created_at: string;
    updated_at: string;
  };

  const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
    header: 'Kopfzeile',
    angebot: 'Angebot',
    cta: 'Call-to-Action',
    text: 'Textblock',
    footer: 'Abschluss',
  };

  const BLOCK_STARTERS: Record<BlockType, string> = {
    header: `<h1 style="color:#333;font-family:Georgia,serif;">Betreff-Zeile</h1>\n<p style="color:#666;font-family:sans-serif;">Willkommens-/Intro-Satz.</p>`,
    angebot: `<div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin:16px 0;">\n  <h2 style="color:#333;font-family:sans-serif;margin:0 0 8px;">Angebots-Titel</h2>\n  <p style="color:#555;font-family:sans-serif;font-size:15px;">Kurze Beschreibung des Angebots.</p>\n  <p style="font-family:sans-serif;"><strong>Preis: 0 €</strong></p>\n</div>`,
    cta: `<div style="text-align:center;margin:24px 0;">\n  <a href="https://LINK" style="background:#b8973a;color:#fff;padding:12px 28px;border-radius:6px;font-family:sans-serif;font-weight:bold;text-decoration:none;display:inline-block;">\n    Jetzt buchen\n  </a>\n</div>`,
    text: `<p style="color:#555;font-family:sans-serif;font-size:16px;line-height:1.6;">\n  Ihr Text hier.\n</p>`,
    footer: `<p style="color:#888;font-family:sans-serif;font-size:14px;margin-top:32px;">\n  Mit freundlichen Grüßen,<br>\n  <strong>Ihr Name</strong>\n</p>`,
  };

  const BLOCK_TYPE_BADGE: Record<BlockType, string> = {
    header: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    angebot: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    cta: 'bg-gold/10 text-gold border-gold/20',
    text: 'bg-dark-lighter text-muted border-dark-lighter',
    footer: 'bg-green-500/10 text-green-400 border-green-500/20',
  };

  // ── State ─────────────────────────────────────────────────────────────────────
  let blocks: ContentBlock[] = $state([]);
  let loading = $state(true);
  let loadError = $state('');

  let selectedId: string | null = $state(null);
  let editTitle = $state('');
  let editType = $state<BlockType>('text');
  let editHtml = $state('');
  let editMsg = $state('');
  let editSaving = $state(false);

  let showNew = $state(false);
  let newTitle = $state('');
  let newType = $state<BlockType>('text');
  let newHtml = $state('');
  let newMsg = $state('');
  let newSaving = $state(false);

  let deleteConfirm: string | null = $state(null);

  // preview
  let previewHtml = $state('');

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function loadBlocks() {
    loading = true; loadError = '';
    try {
      const res = await fetch('/api/admin/newsletter/blocks');
      blocks = res.ok ? await res.json() : [];
      if (!res.ok) loadError = 'Fehler beim Laden.';
    } catch {
      loadError = 'Verbindungsfehler.';
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadBlocks(); });

  // ── Select ────────────────────────────────────────────────────────────────────
  function selectBlock(b: ContentBlock) {
    selectedId = b.id;
    editTitle = b.title;
    editType = b.block_type;
    editHtml = b.html_body;
    editMsg = '';
    showNew = false;
  }

  // ── Save edit ─────────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!selectedId || !editTitle.trim() || !editHtml.trim()) {
      editMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    editSaving = true; editMsg = '';
    try {
      const res = await fetch(`/api/admin/newsletter/blocks/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, block_type: editType, html_body: editHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        editMsg = 'Gespeichert.';
        blocks = blocks.map(b => b.id === selectedId ? { ...b, ...data } : b);
      } else {
        editMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      editMsg = 'Verbindungsfehler.';
    } finally {
      editSaving = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function confirmDelete(id: string) {
    const res = await fetch(`/api/admin/newsletter/blocks/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      deleteConfirm = null;
      blocks = blocks.filter(b => b.id !== id);
      if (selectedId === id) { selectedId = null; editTitle = ''; editHtml = ''; }
    }
  }

  // ── New block ─────────────────────────────────────────────────────────────────
  function openNew() {
    showNew = true;
    selectedId = null;
    newTitle = '';
    newType = 'text';
    newHtml = BLOCK_STARTERS['text'];
    newMsg = '';
  }

  $effect(() => {
    // When new block type changes, prefill starter HTML only if still default/empty
    if (showNew) {
      newHtml = BLOCK_STARTERS[newType];
    }
  });

  async function createBlock() {
    if (!newTitle.trim() || !newHtml.trim()) {
      newMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    newSaving = true; newMsg = '';
    try {
      const res = await fetch('/api/admin/newsletter/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, block_type: newType, html_body: newHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        blocks = [data, ...blocks];
        showNew = false;
        selectBlock(data);
      } else {
        newMsg = data.error ?? 'Fehler beim Erstellen.';
      }
    } catch {
      newMsg = 'Verbindungsfehler.';
    } finally {
      newSaving = false;
    }
  }

  const BLOCK_TYPES: BlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
</script>

<div class="flex gap-6 h-full min-h-[500px]">
  <!-- Left: block list -->
  <div class="w-56 flex-shrink-0 flex flex-col gap-2">
    <div class="flex items-center justify-between mb-1">
      <p class="text-xs text-muted font-medium uppercase tracking-widest">Blöcke</p>
      <button onclick={openNew}
        class="px-2 py-1 bg-gold text-dark text-xs font-semibold rounded hover:bg-gold/80">
        + Neu
      </button>
    </div>

    {#if loading}
      <p class="text-muted text-xs">Lade…</p>
    {:else if loadError}
      <p class="text-red-400 text-xs">{loadError}</p>
    {:else if blocks.length === 0}
      <p class="text-muted text-xs">Noch keine Blöcke. Erstelle deinen ersten.</p>
    {:else}
      <div class="flex flex-col gap-1">
        {#each blocks as b}
          <button
            onclick={() => selectBlock(b)}
            class={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${selectedId === b.id ? 'border-gold/60 bg-gold/10' : 'border-dark-lighter bg-dark-light hover:border-gold/30'}`}
          >
            <p class="text-light font-medium truncate">{b.title}</p>
            <span class={`inline-block mt-0.5 px-1.5 py-0 rounded border text-[10px] ${BLOCK_TYPE_BADGE[b.block_type]}`}>
              {BLOCK_TYPE_LABELS[b.block_type]}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Right: editor or new-block form -->
  <div class="flex-1 min-w-0">
    {#if showNew}
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-light">Neuer Block</h3>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted mb-1">Titel *</label>
            <input type="text" bind:value={newTitle} placeholder="z.B. Willkommens-Header"
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Typ</label>
            <select bind:value={newType}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50">
              {#each BLOCK_TYPES as t}
                <option value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              {/each}
            </select>
          </div>
        </div>

        <HtmlEditor
          bind:value={newHtml}
          previewMode="server"
          previewUrl="/api/admin/newsletter/preview"
          previewBody={() => ({ subject: newTitle || '(Vorschau)', html_body: newHtml })}
          label="HTML-Inhalt *"
          placeholder="<p>Block-Inhalt hier.</p>"
          rows={14}
        />

        {#if newMsg}<p class="text-red-400 text-sm">{newMsg}</p>{/if}
        <div class="flex gap-3">
          <button onclick={() => { showNew = false; }}
            class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm hover:bg-dark-light">
            Abbrechen
          </button>
          <button onclick={createBlock} disabled={newSaving}
            class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
            {newSaving ? 'Erstelle…' : 'Block erstellen'}
          </button>
        </div>
      </div>

    {:else if selectedId}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted mb-1">Titel *</label>
            <input type="text" bind:value={editTitle}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Typ</label>
            <select bind:value={editType}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50">
              {#each BLOCK_TYPES as t}
                <option value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              {/each}
            </select>
          </div>
        </div>

        <HtmlEditor
          bind:value={editHtml}
          previewMode="server"
          previewUrl="/api/admin/newsletter/preview"
          previewBody={() => ({ subject: editTitle || '(Vorschau)', html_body: editHtml })}
          label="HTML-Inhalt *"
          placeholder="<p>Block-Inhalt hier.</p>"
          rows={14}
        />

        {#if editMsg}
          <p class={`text-sm ${editMsg === 'Gespeichert.' ? 'text-green-400' : 'text-red-400'}`}>{editMsg}</p>
        {/if}

        <div class="flex gap-3 items-center">
          <button onclick={saveEdit} disabled={editSaving}
            class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
            {editSaving ? 'Speichere…' : 'Speichern'}
          </button>
          {#if deleteConfirm === selectedId}
            <span class="text-xs text-muted">Sicher löschen?</span>
            <button onclick={() => confirmDelete(selectedId!)}
              class="text-xs text-red-400 hover:text-red-300">Ja, löschen</button>
            <button onclick={() => deleteConfirm = null}
              class="text-xs text-muted hover:text-light">Abbrechen</button>
          {:else}
            <button onclick={() => deleteConfirm = selectedId}
              class="text-xs text-muted hover:text-red-400 transition-colors ml-auto">
              Löschen
            </button>
          {/if}
        </div>
      </div>

    {:else}
      <div class="flex items-center justify-center h-full text-muted text-sm">
        Wähle einen Block aus der Liste oder erstelle einen neuen.
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 4.2: Verify the component compiles (TypeScript check)**

```bash
cd /tmp/wt-t000609/website
pnpm tsc --noEmit 2>&1 | grep NewsletterBlock
```

Expected: no output (no errors). If there are errors, fix them before continuing.

- [ ] **Step 4.3: Commit**

```bash
cd /tmp/wt-t000609
git add website/src/components/admin/NewsletterBlockLibrary.svelte
git commit -m "feat(newsletter): add NewsletterBlockLibrary Svelte component"
```

---

## Task 5: Wire library into `NewsletterAdmin.svelte` — new tab + compose insert

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

The changes are:
1. Import `NewsletterBlockLibrary`
2. Extend `activeTab` type to include `'vorlagen'`
3. Add "Vorlagen" tab button in the tab bar
4. Add `{:else if activeTab === 'vorlagen'}` branch rendering the library
5. Add a "Block einfügen" button + dropdown in the Compose tab

- [ ] **Step 5.1: Update the script block — import + state changes**

Open `website/src/components/admin/NewsletterAdmin.svelte`.

Replace the import line at the top of `<script lang="ts">`:

```typescript
  import HtmlEditor from './HtmlEditor.svelte';
  import NewsletterBlockLibrary from './NewsletterBlockLibrary.svelte';
```

Change the `activeTab` type declaration from:
```typescript
  let activeTab: 'subscribers' | 'campaigns' | 'compose' = $state('subscribers');
```
to:
```typescript
  let activeTab: 'subscribers' | 'campaigns' | 'compose' | 'vorlagen' = $state('subscribers');
```

Add these new state variables in the `// helpers` section (after the `fmtDate` function):

```typescript
  // ── Block insert (Compose tab) ───────────────────────────────────────────────
  let showBlockPicker = $state(false);
  let blockPickerBlocks: { id: string; title: string; block_type: string; html_body: string }[] = $state([]);
  let blockPickerLoading = $state(false);

  async function loadBlockPicker() {
    if (blockPickerBlocks.length > 0) return; // cached
    blockPickerLoading = true;
    try {
      const res = await fetch('/api/admin/newsletter/blocks');
      blockPickerBlocks = res.ok ? await res.json() : [];
    } catch { /* ignore */ } finally {
      blockPickerLoading = false;
    }
  }

  function insertBlock(htmlBody: string) {
    composeHtml = composeHtml + '\n' + htmlBody;
    showBlockPicker = false;
  }

  const BLOCK_TYPE_LABELS: Record<string, string> = {
    header: 'Kopfzeile', angebot: 'Angebot', cta: 'CTA', text: 'Text', footer: 'Abschluss',
  };
```

- [ ] **Step 5.2: Update the tab bar HTML**

Find the tab bar in the template:
```html
<!-- Tab bar -->
<div class="flex gap-1 mb-6 border-b border-dark-lighter">
  {#each [['subscribers','Abonnenten'],['campaigns','Kampagnen'],['compose','Neue Kampagne']] as [tab, label]}
```

Replace with:
```html
<!-- Tab bar -->
<div class="flex gap-1 mb-6 border-b border-dark-lighter">
  {#each [['subscribers','Abonnenten'],['campaigns','Kampagnen'],['compose','Neue Kampagne'],['vorlagen','Vorlagen']] as [tab, label]}
```

- [ ] **Step 5.3: Add the "Vorlagen" tab content block**

Find the end of the compose tab section (after the `{/if}` that closes `{:else if activeTab === 'compose'}`). Add a new `{:else if}` branch **before** the final `{/if}`:

```svelte
{:else if activeTab === 'vorlagen'}
  <div class="pt-2">
    <p class="text-xs text-muted mb-4">Gespeicherte Blöcke kannst du im Tab „Neue Kampagne" per „Block einfügen" direkt in den Entwurf übernehmen.</p>
    <NewsletterBlockLibrary />
  </div>
```

- [ ] **Step 5.4: Add "Block einfügen" button in the Compose tab**

In the Compose tab section, find:
```svelte
    <HtmlEditor
      bind:value={composeHtml}
      previewMode="server"
      previewUrl="/api/admin/newsletter/preview"
      previewBody={() => ({ subject: composeSubject, html_body: composeHtml })}
      label="HTML-Inhalt *"
      placeholder="<h1>Hallo!</h1><p>Dein Newsletter-Inhalt hier.</p>"
      rows={20}
    />
```

Replace with:
```svelte
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-sm text-muted">HTML-Inhalt *</label>
        <div class="relative">
          <button
            onclick={async () => { showBlockPicker = !showBlockPicker; if (showBlockPicker) await loadBlockPicker(); }}
            class="px-3 py-1 bg-dark-lighter text-muted hover:text-light text-xs rounded-lg border border-dark-lighter hover:border-gold/40 transition-colors"
          >
            + Block einfügen
          </button>
          {#if showBlockPicker}
            <div class="absolute right-0 top-8 z-20 w-72 bg-dark-light border border-dark-lighter rounded-xl shadow-lg p-3 space-y-1 max-h-64 overflow-y-auto">
              {#if blockPickerLoading}
                <p class="text-muted text-xs">Lade…</p>
              {:else if blockPickerBlocks.length === 0}
                <p class="text-muted text-xs">Keine Blöcke gespeichert. Erstelle welche im Tab „Vorlagen".</p>
              {:else}
                {#each blockPickerBlocks as b}
                  <button
                    onclick={() => insertBlock(b.html_body)}
                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-gold/10 transition-colors"
                  >
                    <p class="text-light text-xs font-medium">{b.title}</p>
                    <p class="text-muted text-[10px]">{BLOCK_TYPE_LABELS[b.block_type] ?? b.block_type}</p>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>
      <HtmlEditor
        bind:value={composeHtml}
        previewMode="server"
        previewUrl="/api/admin/newsletter/preview"
        previewBody={() => ({ subject: composeSubject, html_body: composeHtml })}
        placeholder="<h1>Hallo!</h1><p>Dein Newsletter-Inhalt hier.</p>"
        rows={20}
      />
    </div>
```

Note: The `label` prop is removed from `HtmlEditor` here (it's now rendered in the wrapper div above). If `HtmlEditor` requires `label`, pass `label=""` or keep it — check the component's prop definition first.

- [ ] **Step 5.5: Close the block picker on outside click**

Add this effect after the other `$effect` blocks in the script:

```typescript
  // Close block picker when clicking outside
  $effect(() => {
    if (!showBlockPicker) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-block-picker]')) {
        showBlockPicker = false;
      }
    }
    document.addEventListener('click', handleOutside, { capture: true });
    return () => document.removeEventListener('click', handleOutside, { capture: true });
  });
```

Also add `data-block-picker` attribute to the picker container div:
```svelte
          <div class="relative" data-block-picker>
```

- [ ] **Step 5.6: Verify TypeScript + Svelte compiles**

```bash
cd /tmp/wt-t000609/website
pnpm tsc --noEmit 2>&1 | grep -i "newsletter\|error"
```

Expected: no errors. If you see prop errors for `HtmlEditor`, check its interface in `website/src/components/admin/HtmlEditor.svelte` and adjust accordingly.

- [ ] **Step 5.7: Commit**

```bash
cd /tmp/wt-t000609
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter): add Vorlagen tab and block-insert picker to NewsletterAdmin"
```

---

## Task 6: Full test run + final verification

- [ ] **Step 6.1: Run the full website test suite**

```bash
cd /tmp/wt-t000609/website
pnpm vitest run
```

Expected: all tests pass, including the new `newsletter-blocks-db.test.ts` tests.

- [ ] **Step 6.2: Run offline BATS tests**

```bash
cd /tmp/wt-t000609
bash scripts/task-oracle.sh 'run all offline tests' 2>/dev/null | head -5
# Then run the suggested command, or directly:
./tests/runner.sh offline 2>&1 | tail -20
```

Expected: all BATS tests pass. No new failures introduced.

- [ ] **Step 6.3: TypeScript full check**

```bash
cd /tmp/wt-t000609/website
pnpm tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 6.4: Final commit + push**

```bash
cd /tmp/wt-t000609
git push -u origin feature/t000609-newsletter-vorlagen
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `newsletter_content_blocks` table with `ensureTables()` pattern → Task 1
- [x] Types `NewsletterBlockType` + `NewsletterContentBlock` → Task 1
- [x] CRUD functions `listContentBlocks`, `getContentBlock`, `createContentBlock`, `updateContentBlock`, `deleteContentBlock` → Task 1
- [x] Unit tests with pg-mem → Task 2
- [x] API: GET+POST `/blocks/` → Task 3
- [x] API: PUT+DELETE `/blocks/[id]` → Task 3
- [x] `NewsletterBlockLibrary.svelte` with left sidebar + right editor → Task 4
- [x] Block-type-aware starter HTML (BLOCK_STARTERS constants) → Task 4
- [x] Block preview via server-side iframe (HtmlEditor previewMode="server") → Task 4
- [x] Delete with inline confirmation (same pattern as NewsletterAdmin subscribers) → Task 4
- [x] New "Vorlagen" tab in NewsletterAdmin → Task 5
- [x] "Block einfügen" picker in Compose tab with append → Task 5
- [x] Outside-click closes picker → Task 5

**Not in scope (confirmed):** Drag-and-drop ordering, WYSIWYG editor, multilingual blocks, composer assistant. No k3d/brett/factory changes.
