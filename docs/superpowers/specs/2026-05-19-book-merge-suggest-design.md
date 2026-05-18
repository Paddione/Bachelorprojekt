# Book Merge Auto-Suggest — Design Spec

**Date:** 2026-05-19
**Branch:** feature/book-merge-suggest
**Status:** approved

## Summary

Expose the existing `clusterByEmbedding` function (in `coaching-merge.ts`) through a new API endpoint and a lightweight UI addition to `BookMergePanel.svelte`. Admins get a "Vorschläge laden" button that surfaces pgvector-clustered groups of small books — clicking a suggestion pre-fills the existing merge form so the normal merge flow handles the rest.

## Problem

`clusterByEmbedding` is fully implemented in `website/src/lib/coaching-merge.ts` but has no API endpoint and no UI surface. Admins must manually identify which small books belong together, which is tedious when there are many books with ≤5 chunks.

## Scope

**In scope:**
- New `GET /api/admin/books/merge/suggest` endpoint
- "✨ Vorschläge laden" button + inline suggestion cards in `BookMergePanel.svelte`
- Silent handling of books without embeddings (message only when zero suggestions result)

**Out of scope:**
- Configurable similarity threshold (stays hardcoded at 0.75)
- Bulk-merge all suggestions at once
- Suggestion persistence across page reloads

## Architecture

### New file: `website/src/pages/api/admin/books/merge/suggest.ts`

```
GET /api/admin/books/merge/suggest
  → Auth: getSession + isAdmin (same pattern as merge.ts)
  → calls clusterByEmbedding(pool, 0.75)
  → returns { suggestions: MergeSpec[] }
  → 200 with empty array if no clusters found
  → 500 on DB error
```

The endpoint sits alongside the existing `merge.ts` as a sibling file in the same directory. No changes to `merge.ts`.

### Modified: `website/src/components/admin/BookMergePanel.svelte`

**New state:**
```ts
let suggestions = $state<MergeSpec[]>([]);
let suggestLoading = $state(false);
let suggestError = $state<string | null>(null);
```

**New function:**
```ts
async function loadSuggestions() {
  suggestLoading = true; suggestError = null;
  const res = await fetch('/api/admin/books/merge/suggest');
  if (res.ok) {
    const data = await res.json();
    suggestions = data.suggestions;
    if (suggestions.length === 0) suggestError = 'Keine Vorschläge — Bücher zu verschieden oder Embeddings fehlen.';
  } else {
    suggestError = 'Fehler beim Laden der Vorschläge.';
  }
  suggestLoading = false;
}
```

**New UI (below the book list, above the manual toggle button):**
- "✨ Vorschläge laden" button (ghost style, full width)
- While loading: spinner / "Lade…" text
- On error / empty: grey info line (stille Auslassung — no error styling for empty)
- Per suggestion: compact card showing title, book count, total chunk count
  - Clicking a card calls `applySuggestion(spec)` which sets `selected`, `title`, `slug`
  - After applying, the right panel activates exactly as if the user had manually checked those books

**New function:**
```ts
function applySuggestion(spec: MergeSpec) {
  selected = new Set(spec.sourceBookIds);
  title = spec.title;
  slug = spec.slug;
}
```

After a successful merge: call `loadSuggestions()` again to refresh (some suggestions may now be invalid since source books are gone).

## Data Flow

```
Admin clicks "Vorschläge laden"
  → GET /api/admin/books/merge/suggest
    → clusterByEmbedding(pool, 0.75)
      → pgvector cosine similarity between first chunks
      → greedy union-find clustering (≥0.75 similarity)
    → { suggestions: MergeSpec[] }
  → Suggestion cards rendered below button

Admin clicks suggestion card
  → applySuggestion(spec) → pre-fills selected / title / slug
  → Right panel activates (canMerge = true when ≥2 books + title + slug)

Admin adjusts title/slug if needed → clicks "Zusammenführen"
  → POST /api/admin/books/merge (existing flow, unchanged)
  → On success: books removed from list, loadSuggestions() re-called
```

## Error Handling

| Case | Behavior |
|---|---|
| No embeddings on any book | Empty `suggestions` array → grey message "Keine Vorschläge — Bücher zu verschieden oder Embeddings fehlen." |
| DB error in suggest endpoint | 500 → UI shows "Fehler beim Laden der Vorschläge." |
| Suggestion references a book that was just merged | `mergeBooks` validates book IDs exist; returns 400 → existing error display in right panel |
| Book in suggestion exceeds 5-chunk threshold | `mergeBooks` rejects with 400 → existing error display |

## Files Changed

| File | Change |
|---|---|
| `website/src/pages/api/admin/books/merge/suggest.ts` | **New** — GET endpoint wrapping `clusterByEmbedding` |
| `website/src/components/admin/BookMergePanel.svelte` | **Modified** — suggestions state + button + cards + applySuggestion |

No changes to `coaching-merge.ts`, `merge.ts`, or the Astro page.

## Testing

- Unit: `coaching-merge.test.ts` already covers `clusterByEmbedding` — no new unit tests needed
- Manual smoke: load page → click "Vorschläge laden" → verify cards appear → click suggestion → verify form prefilled → merge → verify suggestion list refreshed
