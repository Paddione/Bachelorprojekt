# Wissensquellen — Zusammenführen (Collection Merge)

**Date:** 2026-05-19
**Branch:** feature/wissensquellen-merge
**Status:** approved

## Goal

Integrate collection merge functionality directly into `/admin/wissensquellen` as a slide-in panel. Remove the separate book-merge page and treat coaching books as plain collections everywhere in the admin. The user selects ≥2 custom/web_crawl collections, names the merged result, and triggers a single operation that creates the new collection, migrates all content, and deletes the sources.

## Scope

### Remove entirely
- `website/src/pages/admin/knowledge/merge-books.astro`
- `website/src/pages/admin/knowledge/books/index.astro`
- `website/src/pages/admin/knowledge/books/[id].astro`
- `website/src/components/admin/BookMergePanel.svelte`
- `website/src/pages/api/admin/books/merge.ts`
- `website/src/pages/api/admin/books/merge/suggest.ts`
- `website/src/lib/coaching-merge.ts`

### Modify
- `website/src/layouts/AdminLayout.astro` — remove "Bücher" and "Zusammenführen" nav items from "Wissen & Inhalte" group
- `website/src/pages/admin/wissensquellen.astro` — add "Zusammenführen" header button + mount `CollectionMergePanel`
- `website/src/lib/knowledge-db.ts` — add `mergeCollections()`

### Create
- `website/src/components/admin/CollectionMergePanel.svelte`
- `website/src/pages/api/admin/knowledge/collections/merge.ts`

## Data Layer — `mergeCollections()`

```ts
mergeCollections(args: {
  sourceIds: string[];
  name: string;
  description?: string;
  brand?: string | null;
}): Promise<Collection>
```

Steps, all inside a single `BEGIN`/`COMMIT` transaction:

1. Load all source collections (`SELECT ... WHERE id = ANY($1)`). Throw `Error('not_found')` if any is missing.
2. Validate every source has `source IN ('custom', 'web_crawl')`. Throw `Error('cannot_delete: <name>')` otherwise.
3. Validate all share the same `embedding_model`. Throw `MixedEmbeddingModelError` if not.
4. `INSERT INTO knowledge.collections` — `source = 'custom'`, `embedding_model` from sources.
5. For each source document: `INSERT INTO knowledge.documents (...) SELECT ..., $new_collection_id FROM knowledge.documents WHERE collection_id = $src_id RETURNING id` — capture new doc id.
6. For each (old_doc_id → new_doc_id) mapping: `INSERT INTO knowledge.chunks (...) SELECT ..., $new_doc_id, $new_collection_id FROM knowledge.chunks WHERE document_id = $old_id`.
7. `UPDATE knowledge.collections SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $new_id), last_indexed_at = now() WHERE id = $new_id`.
8. `DELETE FROM coaching.books WHERE knowledge_collection_id = ANY($source_ids)` — clean up any book records.
9. `DELETE FROM knowledge.collections WHERE id = ANY($source_ids)` — cascade removes source documents + chunks.

Returns the new collection row.

## API Endpoint

**`POST /api/admin/knowledge/collections/merge`**

Request body:
```json
{
  "sourceIds": ["uuid1", "uuid2"],
  "name": "Merged Collection Name",
  "brand": "mentolder",
  "description": "Optional description"
}
```

Responses:
- `201` — new `Collection` object
- `400` — `{ error: "name erforderlich" | "mindestens 2 Quellen erforderlich" | "cannot_delete: <name>" | "MixedEmbeddingModelError: ..." }`
- `409` — `{ error: "name bereits vergeben" }`
- `401` — unauthorized

No new GET endpoint needed — panel reuses `GET /api/admin/knowledge/collections`.

## Component — `CollectionMergePanel.svelte`

Slide-in drawer from the right, 440px wide, full viewport height, dim overlay behind it.
Opened/closed by listening to `CustomEvent('open-collection-merge')` on `window`.

**Layout:**
```
┌─────────────────────────────────────────┐
│ Sammlungen zusammenführen           [×] │
├─────────────────────────────────────────┤
│ [☐] Alle  ·  3 ausgewählt · 45 Chunks  │
├─────────────────────────────────────────┤
│ ☑ Webseite-Texte    custom  · 12 Chunks │
│ ☑ Blog-Artikel      custom  · 18 Chunks │
│ ☐ FAQ               web_crawl· 5 Chunks │
│ ☑ Kontakt-Snippets  custom  · 15 Chunks │
├─────────────────────────────────────────┤
│ ⚠ Modell-Konflikt: bge-m3 ≠ voyage     │  ← only when mismatched
│   (or, when models match:)              │
│ Name der Ziel-Sammlung                  │
│ [________________________]              │
│ Marke: [mentolder ▾]                   │
│ 3 Quellen · 45 Chunks gesamt           │
├─────────────────────────────────────────┤
│        [Zusammenführen & löschen]       │
└─────────────────────────────────────────┘
```

**Behaviour:**
- On mount: fetch `GET /api/admin/knowledge/collections`, filter to `custom` + `web_crawl`, store in reactive state
- Each row shows: checkbox, name, source badge, brand, chunk count, embedding model badge
- "Alle" checkbox toggles all; selection count + total chunks update reactively
- Embedding model mismatch detected reactively: red warning block replaces the form, submit disabled
- Submit disabled when: `selected.size < 2`, no name, mismatch present, or request in flight
- On success: "✓ `{name}` erstellt — {n} Chunks übertragen." inline, then `location.reload()` after 1.5 s
- On error: inline red message, panel stays open

## `wissensquellen.astro` Changes

1. Add "Zusammenführen" button in `.head-actions` alongside existing buttons
2. Import and mount `<CollectionMergePanel client:load />`
3. Add event listener: `document.getElementById('merge-btn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('open-collection-merge')))`

## `AdminLayout.astro` Changes

In the "Wissen & Inhalte" nav group, remove:
- `{ href: '/admin/knowledge/books', label: 'Bücher', ... }`
- `{ href: '/admin/knowledge/merge-books', label: 'Zusammenführen', ... }`

## Constraints

- Only `custom` and `web_crawl` collections can be merged (builtins are system-managed, undeleteable)
- Collections with different `embedding_model` values cannot be merged (would break vector search)
- Merge is irreversible — no undo. The confirm copy on the submit button ("Zusammenführen & löschen") communicates this
- The `coaching-merge.ts` lib and `/api/admin/books/merge*` routes are dead code after this change and are removed
