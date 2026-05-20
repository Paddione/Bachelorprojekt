---
ticket_id: T000115
title: Wissen-Hub Implementation Plan
domains: []
status: active
pr_number: null
---

# Wissen-Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Wissen" nav group to the admin sidebar with a 4-tab hub page (`/admin/wissen`) consolidating PDF/EPUB book ingestion, JSON import, web crawl, collection management, merge, and drafts review — all currently orphaned or split across unreachable pages.

**Architecture:** New `WissenHub.svelte` (Svelte 5 runes, `$state`/`$props`) renders four tabs by composing six already-existing modal components without modifying them. `wissen.astro` does SSR data loading (collections + books + draft count) and passes props in. `AdminLayout.astro` gets a new "Wissen" nav group; `admin.astro` gets a dashboard tile.

**Tech Stack:** Astro SSR, Svelte 5 runes, TypeScript, existing knowledge-db/coaching-db libs, Tailwind-free admin CSS vars (`--admin-primary`, `--admin-border`, etc.)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `website/src/pages/api/admin/coaching/books/[id]/index.ts` | Add `DELETE` handler |
| Create | `website/src/components/admin/WissenHub.svelte` | 4-tab hub, composes existing modals |
| Create | `website/src/pages/admin/wissen.astro` | SSR data load + render hub |
| Modify | `website/src/pages/admin/wissensquellen.astro` | Replace body with 301 redirect |
| Modify | `website/src/layouts/AdminLayout.astro` | Add Wissen group, remove Entwürfe from Redaktion |
| Modify | `website/src/pages/admin.astro` | Add Wissensbasis tile to adminLinks |

---

## Task 0: Add DELETE endpoint for coaching books

**Files:**
- Modify: `website/src/pages/api/admin/coaching/books/[id]/index.ts`

Context: books store text as a `knowledge.collections` row (source `'custom'`) via `ensureCollection()`. `deleteCollection()` from `knowledge-db` handles cascade to chunks — but it guards non-custom sources, and books always use `'custom'`, so it works. Delete the `coaching.books` row first (avoids FK violation if no cascade), then the collection.

- [ ] **Step 1: Add DELETE handler**

Full file after edit — replace the entire file:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getBook } from '../../../../../../lib/coaching-db';
import { deleteCollection } from '../../../../../../lib/knowledge-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const id = params.id as string;
  const book = await getBook(pool, id);
  if (!book) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(book), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const id = params.id as string;
  const book = await getBook(pool, id);
  if (!book) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });

  // Delete book row first, then collection (cascades to chunks + drafts)
  await pool.query('DELETE FROM coaching.books WHERE id = $1', [id]);
  await deleteCollection(book.knowledgeCollectionId);

  return new Response(null, { status: 204 });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /tmp/wt-wissen-hub/website && npx tsc --noEmit 2>&1 | grep -i "coaching/books" || echo "no errors in that file"
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/pages/api/admin/coaching/books/[id]/index.ts
git commit -m "feat(api): add DELETE /api/admin/coaching/books/:id [T000115]"
```

---

## Task 1: Create WissenHub.svelte — tab shell + Einlesen tab

**Files:**
- Create: `website/src/components/admin/WissenHub.svelte`

The component uses Svelte 5 runes (`$state`, `$props`). It renders all six modal components unconditionally (they stay hidden until triggered by events). The Einlesen tab embeds `BookUploadForm` directly and has trigger buttons for the JSON and web crawl modals.

Note: `BookUploadForm.svelte` accepts only `.pdf` and `.epub` (the upload API enforces this). HTML pages are ingested via web crawl.

- [ ] **Step 1: Create WissenHub.svelte**

```svelte
<!-- website/src/components/admin/WissenHub.svelte -->
<script lang="ts">
  import BookUploadForm from './BookUploadForm.svelte';
  import KnowledgeJsonImport from './KnowledgeJsonImport.svelte';
  import WebCrawlSourceModal from './WebCrawlSourceModal.svelte';
  import KnowledgeSourceModal from './KnowledgeSourceModal.svelte';
  import CollectionMergePanel from './CollectionMergePanel.svelte';
  import DraftsInbox from './DraftsInbox.svelte';
  import type { Collection } from '../../lib/knowledge-db';
  import type { Book } from '../../lib/coaching-db';

  let {
    initialCollections = [],
    initialBooks = [],
    draftCount = 0,
  }: {
    initialCollections: Collection[];
    initialBooks: Book[];
    draftCount: number;
  } = $props();

  type Tab = 'einlesen' | 'sammlungen' | 'operationen' | 'entworfe';
  let activeTab = $state<Tab>('einlesen');

  // Sammlungen: merge live state from SSR props
  let collections = $state<Collection[]>(initialCollections);
  let books = $state<Book[]>(initialBooks);

  function openJsonImport() {
    window.dispatchEvent(new CustomEvent('open-json-import-modal'));
  }
  function openWebCrawl() {
    window.dispatchEvent(new CustomEvent('open-web-crawl-modal'));
  }
  function openNewCollection() {
    window.dispatchEvent(new CustomEvent('open-wissensquellen-modal'));
  }
  function openMerge() {
    window.dispatchEvent(new CustomEvent('open-collection-merge'));
  }

  async function deleteBook(id: string) {
    if (!confirm('Buch und alle zugehörigen Chunks löschen?')) return;
    const r = await fetch(`/api/admin/coaching/books/${id}`, { method: 'DELETE' });
    if (r.ok) books = books.filter(b => b.id !== id);
    else alert('Fehler beim Löschen');
  }

  async function deleteCollection(id: string) {
    if (!confirm('Sammlung und alle Chunks löschen?')) return;
    const r = await fetch(`/api/admin/knowledge/collections/${id}`, { method: 'DELETE' });
    if (r.ok) collections = collections.filter(c => c.id !== id);
    else {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? 'Fehler beim Löschen');
    }
  }

  async function reindex(id: string, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = 'Läuft…';
    const r = await fetch(`/api/admin/knowledge/collections/${id}/reindex`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    btn.textContent = 'Re-index';
    if (j.cmd) alert(`Bitte ausführen:\n${j.cmd}`);
    else if (!r.ok) alert(j.message ?? j.error ?? 'Fehler');
  }
</script>

<div class="wissen-hub">
  <!-- Tab bar -->
  <div class="tab-bar">
    {#each ([
      { id: 'einlesen',    label: 'Einlesen' },
      { id: 'sammlungen',  label: 'Sammlungen' },
      { id: 'operationen', label: 'Operationen' },
      { id: 'entworfe',    label: 'Entwürfe', badge: draftCount > 0 ? draftCount : undefined },
    ] as const) as tab}
      <button
        class="tab-btn {activeTab === tab.id ? 'active' : ''}"
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
        {#if tab.badge}
          <span class="badge">{tab.badge}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Einlesen -->
  {#if activeTab === 'einlesen'}
    <div class="tab-content">
      <div class="ingest-grid">
        <!-- Book upload card -->
        <div class="card">
          <div class="card-head book">📚 Buch hochladen</div>
          <p class="card-desc">PDF oder EPUB — wird chunked, embedded und als Coaching-Buch gespeichert.</p>
          <BookUploadForm />
        </div>

        <!-- JSON + Web card -->
        <div class="card">
          <div class="card-head source">🔗 JSON / Web-Quelle</div>
          <p class="card-desc">Strukturiertes JSON importieren oder eine Website crawlen und als Wissenssammlung speichern.</p>
          <div class="btn-row">
            <button class="btn-secondary" onclick={openJsonImport}>JSON importieren</button>
            <button class="btn-secondary" onclick={openWebCrawl}>+ Web-Quelle</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Sammlungen -->
  {#if activeTab === 'sammlungen'}
    <div class="tab-content">
      <div class="table-actions">
        <button class="btn-secondary" onclick={openNewCollection}>+ Neue Sammlung</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th><th>Typ</th><th>Marke</th><th>Chunks</th><th>Letzter Index</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each books as book (book.id)}
            <tr>
              <td>{book.title}</td>
              <td><code>buch</code></td>
              <td>{book.slug ?? '—'}</td>
              <td>{book.chunkCount ?? '—'}</td>
              <td>—</td>
              <td class="actions">
                <button class="btn-danger" onclick={() => deleteBook(book.id)}>Löschen</button>
              </td>
            </tr>
          {/each}
          {#each collections as col (col.id)}
            <tr>
              <td>{col.name}</td>
              <td><code>{col.source}</code></td>
              <td>{col.brand ?? '—'}</td>
              <td>{col.chunk_count}</td>
              <td>{col.last_indexed_at ? new Date(col.last_indexed_at).toLocaleString('de-DE') : '—'}</td>
              <td class="actions">
                {#if col.source !== 'pr_history' && col.source !== 'specs_plans' && col.source !== 'claude_md' && col.source !== 'bug_tickets'}
                  <button class="btn-action" onclick={(e) => reindex(col.id, e.currentTarget as HTMLButtonElement)}>Re-index</button>
                  <button class="btn-danger" onclick={() => deleteCollection(col.id)}>Löschen</button>
                {:else}
                  <button class="btn-action" onclick={(e) => reindex(col.id, e.currentTarget as HTMLButtonElement)}>Re-index</button>
                {/if}
              </td>
            </tr>
          {/each}
          {#if books.length === 0 && collections.length === 0}
            <tr><td colspan="6" class="empty">Noch keine Quellen indexiert.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Operationen -->
  {#if activeTab === 'operationen'}
    <div class="tab-content">
      <div class="ops-section">
        <h3>Zusammenführen</h3>
        <p class="section-desc">Zwei oder mehr Sammlungen in eine neue Sammlung zusammenführen.</p>
        <button class="btn-primary" onclick={openMerge}>Merge-Dialog öffnen</button>
      </div>
    </div>
  {/if}

  <!-- Entwürfe -->
  {#if activeTab === 'entworfe'}
    <div class="tab-content">
      <DraftsInbox />
    </div>
  {/if}
</div>

<!-- Always-mounted modals (hidden until triggered) -->
<KnowledgeJsonImport onCreated={() => location.reload()} />
<WebCrawlSourceModal onCreated={() => location.reload()} />
<KnowledgeSourceModal onCreated={() => location.reload()} />
<CollectionMergePanel />

<style>
  .wissen-hub { padding: 1.5rem; max-width: 1100px; }

  .tab-bar {
    display: flex;
    gap: 4px;
    background: var(--admin-sidebar-bg, #1a1a2e);
    padding: 4px;
    border-radius: 14px;
    width: fit-content;
    margin-bottom: 1.5rem;
  }
  .tab-btn {
    padding: 6px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--admin-text-mute, #888);
    transition: all 0.15s;
    min-height: 36px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tab-btn.active {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .tab-btn:not(.active):hover { color: #fff; }
  .badge {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    font-size: 10px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }
  .tab-btn.active .badge {
    background: var(--admin-bg, #0f1117);
    color: var(--admin-primary, #c9a84c);
  }

  .tab-content { animation: fadeIn 0.15s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .ingest-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 768px) { .ingest-grid { grid-template-columns: 1fr; } }

  .card {
    background: var(--admin-card-bg, #1a1a2e);
    border: 1px solid var(--admin-border, #2a2a3e);
    border-radius: 12px;
    padding: 1.25rem;
  }
  .card-head {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 0.5rem;
  }
  .card-head.book { color: var(--admin-primary, #c9a84c); }
  .card-head.source { color: #6b9fff; }
  .card-desc { font-size: 12px; color: var(--admin-text-mute, #888); margin-bottom: 1rem; }

  .btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn-primary {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    border: none;
    padding: 0.55rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-secondary {
    background: transparent;
    color: var(--admin-primary, #c9a84c);
    border: 1px solid var(--admin-primary, #c9a84c);
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-action {
    background: transparent;
    color: var(--admin-text-mute, #888);
    border: 1px solid var(--admin-border, #3a3a5e);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-action:hover { color: #fff; border-color: #aaa; }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-danger {
    background: transparent;
    color: #c96e6e;
    border: 1px solid #c96e6e;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .table-actions { margin-bottom: 0.75rem; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th, .data-table td {
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid var(--admin-border, #2a2a3e);
    text-align: left;
    color: var(--admin-fg, #e0e0e0);
  }
  .data-table th {
    color: var(--admin-text-mute, #888);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .actions { display: flex; gap: 0.4rem; white-space: nowrap; }
  .empty { color: var(--admin-text-mute, #888); font-style: italic; text-align: center; padding: 2rem; }
  code {
    font-family: monospace;
    font-size: 11px;
    background: var(--admin-bg, #0f1117);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .ops-section { padding: 1.5rem; background: var(--admin-card-bg, #1a1a2e); border: 1px solid var(--admin-border, #2a2a3e); border-radius: 12px; max-width: 500px; }
  .ops-section h3 { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.4rem; }
  .section-desc { font-size: 13px; color: var(--admin-text-mute, #888); margin-bottom: 1rem; }
</style>
```

- [ ] **Step 2: Check TypeScript**

```bash
cd /tmp/wt-wissen-hub/website && npx tsc --noEmit 2>&1 | grep -i "WissenHub\|wissen-hub" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/components/admin/WissenHub.svelte
git commit -m "feat(admin): WissenHub.svelte — 4-tab knowledge hub shell [T000115]"
```

---

## Task 2: Create wissen.astro — SSR page

**Files:**
- Create: `website/src/pages/admin/wissen.astro`

- [ ] **Step 1: Create the page**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import WissenHub from '../../components/admin/WissenHub.svelte';
import { listCollections } from '../../lib/knowledge-db';
import { listBooks } from '../../lib/coaching-db';
import { pool } from '../../lib/website-db';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

let collections: Awaited<ReturnType<typeof listCollections>> = [];
let books: Awaited<ReturnType<typeof listBooks>> = [];
let draftCount = 0;

await Promise.allSettled([
  listCollections().then(c => { collections = c; }),
  listBooks(pool).then(b => { books = b; }),
  pool
    .query("SELECT count(*)::int AS n FROM coaching.drafts WHERE status = 'open'")
    .then(r => { draftCount = r.rows[0]?.n ?? 0; }),
]);
---

<AdminLayout title="Wissensbasis">
  <WissenHub
    client:load
    initialCollections={collections}
    initialBooks={books}
    draftCount={draftCount}
  />
</AdminLayout>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /tmp/wt-wissen-hub/website && npx tsc --noEmit 2>&1 | grep -i "wissen.astro" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/pages/admin/wissen.astro
git commit -m "feat(admin): /admin/wissen page — SSR data load [T000115]"
```

---

## Task 3: Update AdminLayout.astro — Wissen nav group

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

Two changes: (1) remove `Entwürfe` from Redaktion group, (2) add `Wissen` group after Redaktion. The `draftsPending` count was feeding the Entwürfe badge — now we remove the nav item (the badge shows on the tab inside WissenHub instead, fed from SSR in wissen.astro).

- [ ] **Step 1: Remove Entwürfe from Redaktion and add Wissen group**

In `website/src/layouts/AdminLayout.astro`, find the Redaktion group and apply two edits:

**Edit A** — remove the Entwürfe nav entry from Redaktion items:

Old:
```typescript
      { href: '/admin/knowledge/drafts',  label: 'Entwürfe',    icon: 'edit',   badge: draftsPending },
```
New: *(delete that line entirely)*

**Edit B** — add Wissen group after the closing brace of the Redaktion group:

Find:
```typescript
  {
    label: 'Kapital',
```

Insert before it:
```typescript
  {
    label: 'Wissen',
    iconClass: 'nav-icon-wissen',
    items: [
      { href: '/admin/wissen', label: 'Wissensbasis', icon: 'book',
        matches: ['/admin/wissen', '/admin/wissensquellen', '/admin/knowledge'] },
    ],
  },
```

- [ ] **Step 2: Verify sidebar renders — start dev server**

```bash
cd /tmp/wt-wissen-hub/website && npm run dev -- --port 4322 &
sleep 6
curl -s http://localhost:4322/ | grep -c "html" && echo "dev server up"
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): Wissen nav group, remove Entwürfe from Redaktion [T000115]"
```

---

## Task 4: Update admin.astro — dashboard tile

**Files:**
- Modify: `website/src/pages/admin.astro`

The `SVG.book` icon is already defined at line ~67 of `admin.astro`.

- [ ] **Step 1: Add Wissensbasis tile**

In `website/src/pages/admin.astro`, find `adminLinks` and add the new entry. Insert after the Monitoring line:

Old:
```typescript
  { href: '/admin/monitoring',                                   label: 'Monitoring', icon: SVG.dashboard, color: 'oklch(0.80 0.09 75)' },
```

New:
```typescript
  { href: '/admin/monitoring',                                   label: 'Monitoring', icon: SVG.dashboard, color: 'oklch(0.80 0.09 75)' },
  { href: '/admin/wissen',                                       label: 'Wissensbasis', icon: SVG.book,    color: '#a78bfa' },
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/pages/admin.astro
git commit -m "feat(admin): Wissensbasis tile on admin dashboard [T000115]"
```

---

## Task 5: Redirect wissensquellen → wissen

**Files:**
- Modify: `website/src/pages/admin/wissensquellen.astro`

Keep the auth guard, replace everything else with a redirect.

- [ ] **Step 1: Replace page body**

Replace the entire file content with:

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

return Astro.redirect('/admin/wissen', 301);
---
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-wissen-hub
git add website/src/pages/admin/wissensquellen.astro
git commit -m "feat(admin): redirect /admin/wissensquellen → /admin/wissen [T000115]"
```

---

## Task 6: Smoke test all success criteria

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd /tmp/wt-wissen-hub/website && npm run dev -- --port 4322 &
sleep 8
```

- [ ] **Step 2: Check all 9 criteria manually in browser at http://localhost:4322/admin/wissen**

```
SC1: /admin/wissen renders (no 500)
SC2: Sidebar shows "Wissen" group with "Wissensbasis" link
SC3: Admin dashboard (/) shows "Wissensbasis" tile
SC4: Einlesen tab → BookUploadForm visible (PDF/EPUB)
SC5: Einlesen tab → "JSON importieren" button fires modal
SC6: Sammlungen tab → table renders books + collections
SC7: Sammlungen tab → delete button calls DELETE /api/admin/coaching/books/:id (200→204)
SC8: Operationen tab → "Merge-Dialog öffnen" button fires CollectionMergePanel modal
SC9: Entwürfe tab → DraftsInbox renders
SC10: /admin/wissensquellen 301-redirects to /admin/wissen
SC11: "Entwürfe" no longer in Redaktion nav group
```

- [ ] **Step 3: Check redirect**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:4322/admin/wissensquellen
```
Expected: `301 http://localhost:4322/admin/wissen`

- [ ] **Step 4: Run offline tests (must stay green)**

```bash
cd /tmp/wt-wissen-hub && task test:all 2>&1 | tail -20
```

Expected: all tests pass (no manifest or unit failures).

- [ ] **Step 5: Final commit + push**

```bash
cd /tmp/wt-wissen-hub && git push -u origin feature/wissen-hub
```

---

## Replace T000115

Before pushing, update commit messages or just note: create ticket via the platform and replace `T000115` in the plan header. The ticket creation happens in dev-flow-plan step 4.5 and the ID is injected into the plan frontmatter automatically.
