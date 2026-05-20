# Wissen-Hub — Design Spec

**Date:** 2026-05-20  
**Branch:** feature/wissen-hub  
**Status:** approved

## Problem

Two knowledge management systems exist but are both unreachable from the admin nav:

- `/admin/wissensquellen` — full knowledge collection UI (JSON import, web crawl, merge, delete, reindex) — **orphaned, no nav entry**
- `BookUploadForm.svelte` — PDF/EPUB/HTML ingestion via `/api/admin/coaching/books/upload` — **also orphaned**
- `DraftsInbox.svelte` — AI-classified chunk review — linked from Redaktion nav but belongs with knowledge management

## Solution

Create a new **Wissen-Hub** page at `/admin/wissen` — a 4-tab multi-tab component that consolidates all knowledge pipeline work. Add a dedicated **Wissen** nav group to the sidebar. Add a dashboard tile to `adminLinks`.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `website/src/pages/admin/wissen.astro` | New hub page — SSR: loads collections + draft count, renders `WissenHub.svelte` |
| `website/src/components/admin/WissenHub.svelte` | 4-tab hub component |
| `website/src/pages/admin/wissensquellen.astro` | **Replace** with 301 redirect → `/admin/wissen` |

### Modified files

| File | Change |
|------|--------|
| `website/src/layouts/AdminLayout.astro` | Add "Wissen" nav group; remove "Entwürfe" from Redaktion group |
| `website/src/pages/admin.astro` | Add "Wissensbasis" tile to `adminLinks` |

### Modified files (additions)

| File | Change |
|------|--------|
| `website/src/pages/api/admin/coaching/books/[id]/index.ts` | Add `DELETE` handler to delete a book + its chunks |

### Reused components (no changes needed)

- `BookUploadForm.svelte` — embedded in Einlesen tab
- `KnowledgeJsonImport.svelte` — modal, opened via `open-json-import-modal` event button in Einlesen tab
- `WebCrawlSourceModal.svelte` — modal, opened via `open-web-crawl-modal` event button in Einlesen tab
- `KnowledgeSourceModal.svelte` — modal, opened via `open-wissensquellen-modal` event button in Sammlungen tab
- `CollectionMergePanel.svelte` — embedded in Operationen tab (always-visible, listens for `open-collection-merge` on mount)
- `DraftsInbox.svelte` — embedded in Entwürfe tab

---

## WissenHub.svelte — 4 tabs

### Tab 1 · Einlesen

Two side-by-side cards:

**Buch / Dokument card** (left):
- Drag-drop zone accepting `.pdf`, `.epub`, `.html`
- Title + Author text fields (pre-filled from filename)
- "Hochladen & Verarbeiten" button
- Uses `BookUploadForm.svelte` logic (refactored inline or as a component prop)

**JSON / Web-Quelle card** (right):
- "JSON importieren" button — fires `open-json-import-modal` → opens `KnowledgeJsonImport.svelte` modal
- "+ Web-Quelle" button — fires `open-web-crawl-modal` → opens `WebCrawlSourceModal.svelte` modal

Both modals are already self-contained; they just need buttons to trigger them. The Einlesen tab renders both components (`client:load`) and two trigger buttons.

### Tab 2 · Sammlungen

Unified table merging all collection types (books from `coaching.books` + collections from `knowledge.collections`):

| Spalte | Wert |
|--------|------|
| Name | collection/book name |
| Typ | `buch` · `json` · `web_crawl` · `custom` |
| Marke | mentolder / korczewski / — |
| Chunks | count |
| Letzter Index | relative timestamp |
| Aktionen | Reindex · Crawl starten (web only) · Löschen |

SSR props: `initialCollections` (from `listCollections()`), `initialBooks` (from `GET /api/admin/coaching/books`). Deleting a book calls the new `DELETE /api/admin/coaching/books/:id` endpoint (drops book row + cascades to chunks); deleting a collection calls existing `DELETE /api/admin/knowledge/collections/:id`.

### Tab 3 · Operationen

Two sections:

**Zusammenführen**: Renders `CollectionMergePanel.svelte` inline (already listens for `open-collection-merge` event — trigger on mount or always-visible).

**Bulk-Aktionen** (stretch, skip if complex): checkboxes in Sammlungen tab to select multiple → delete-selected button here. Only implement if trivial.

### Tab 4 · Entwürfe

Renders `DraftsInbox.svelte` inline. This component is self-contained (fetches its own data on mount). No SSR props needed.

---

## AdminLayout.astro changes

```ts
// Remove from Redaktion group:
{ href: '/admin/knowledge/drafts', label: 'Entwürfe', icon: 'edit', badge: draftsPending }

// Add new nav group after Redaktion:
{
  label: 'Wissen',
  iconClass: 'nav-icon-wissen',  // reuse existing icon or add new
  items: [
    { href: '/admin/wissen', label: 'Wissensbasis', icon: 'book',
      matches: ['/admin/wissen', '/admin/wissensquellen', '/admin/knowledge'] }
  ]
}
```

The `draftsPending` badge count moves to the `WissenHub.svelte` Entwürfe tab badge — pass it as an SSR prop from `wissen.astro`.

---

## admin.astro dashboard tile

Add to `adminLinks` (after "Monitoring" or grouped with knowledge-adjacent tiles):

```ts
{ href: '/admin/wissen', label: 'Wissensbasis', icon: SVG.book, color: '#a78bfa' }
```

The `SVG.book` icon already exists in `admin.astro`.

---

## Data loading in wissen.astro

```ts
import { listCollections } from '../../lib/knowledge-db';
import { pool } from '../../lib/website-db';

let collections = [];
let books = [];
let draftCount = 0;

await Promise.allSettled([
  listCollections().then(c => { collections = c; }),
  pool.query('SELECT id, title, author, created_at FROM coaching.books ORDER BY created_at DESC')
    .then(r => { books = r.rows; }),
  pool.query("SELECT COUNT(*) FROM coaching.drafts WHERE status = 'open'")
    .then(r => { draftCount = parseInt(r.rows[0].count, 10); }),
]);
```

All three are best-effort (`allSettled`) so the page renders even if the coaching schema doesn't exist yet in dev.

---

## Redirect

Replace `wissensquellen.astro` body with:

```ts
return Astro.redirect('/admin/wissen', 301);
```

Keep the auth guard before the redirect.

---

## Icon

The sidebar `nav-icon-wissen` class: reuse the existing `book` SVG from `admin.astro` SVG map, or add it to the icon map in `AdminLayout.astro`. The existing `layout` or `edit` icons are acceptable fallbacks.

---

## Out of scope

- No new API endpoints needed — all existing endpoints are reused
- No DB schema changes
- Bulk-select in Sammlungen is a stretch goal; skip if adds significant complexity
- Reindex for books (only relevant for knowledge collections) — show button only for non-book rows

---

## Success criteria

1. `/admin/wissen` is reachable from the sidebar under "Wissen" group
2. "Wissensbasis" tile appears on the admin dashboard
3. PDF, EPUB, HTML upload works from Einlesen tab
4. JSON import works from Einlesen tab
5. All collections (books + knowledge collections) visible in Sammlungen tab with delete/reindex
6. Merge panel functional in Operationen tab
7. DraftsInbox renders in Entwürfe tab
8. `/admin/wissensquellen` redirects to `/admin/wissen`
9. "Entwürfe" removed from Redaktion nav group
