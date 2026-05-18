# Coaching Book Merge — Design Spec
**Date:** 2026-05-18  
**Status:** approved  
**Domain:** coaching, knowledge

## Problem

The batch-ingest pipeline produced 86 books with 1 chunk and 11 books with 2 chunks — individual exercise sheets ingested as separate books. These are too small for useful RAG context and flood the classify queue and admin UI with noise. The "Co 2 Block 1" books (29 chunks each) represent the ideal size. Small books need to be grouped and merged into coherent units.

**Thresholds:** small = ≤5 chunks · target group = 20–30 chunks per merged book.

---

## Architecture

### Shared lib: `website/src/lib/coaching-merge.ts`

Single source of truth for the merge operation. Used by both the CLI script and the API route.

```ts
interface MergeSpec {
  title: string;
  slug: string;           // collection name becomes `coaching-<slug>`
  sourceBookIds: string[];
}

interface MergeResult {
  mergedBookId: string;
  chunksReassigned: number;
  draftsDeleted: number;
}

export async function mergeBooks(pool: Pool, spec: MergeSpec): Promise<MergeResult>
```

Two internal helpers (not exported):
- `proposeTitleFromBooks(books)` — derives a title suggestion from common words across source titles; used by the CLI preview and the UI pre-fill field.
- `clusterByEmbedding(chunks, minSimilarity)` — groups chunk embeddings by cosine similarity (pgvector `<=>` operator); returns `MergeSpec[]` candidates; used only by the semantic CLI mode.

### DB operation (single transaction)

1. `INSERT INTO knowledge.collections` — new merged collection
2. `INSERT INTO coaching.books` — new merged book pointing to it
3. `UPDATE knowledge.documents SET collection_id = <new> WHERE collection_id IN (<sources>)`
4. `UPDATE knowledge.chunks SET collection_id = <new> WHERE collection_id IN (<sources>)`
5. `DELETE FROM coaching.drafts WHERE book_id IN (<source book ids>)` — clears stale drafts so the merged book re-classifies fresh
6. `DELETE FROM coaching.books WHERE id IN (<source book ids>)` — cascades to source collections

Embeddings on chunks stay intact — no re-indexing required. The merged book enters the classify queue normally via `classify-book.mts --slug=<slug>`.

---

## CLI Script: `scripts/coaching/merge-books.mts`

Three modes, same dry-run → confirm flow:

```bash
# Group all books whose title/filename contains the keyword
npx tsx merge-books.mts --mode=pattern --pattern=block4

# Cluster small books by embedding cosine similarity
npx tsx merge-books.mts --mode=semantic --min-similarity=0.75

# Print all small books (≤5 chunks) with IDs — useful for manual inspection
npx tsx merge-books.mts --mode=list
```

**Dry-run output format (all modes):**
```
Proposed merge: "Block 4 Materialien"  [slug: block4-materialien]
  Sources (14 books, 18 chunks total):
    block4 übung6 (1 chunk)
    block4 übung7 (1 chunk)
    block4 welle  (1 chunk)
    2023-09-27 block4 tarot karte (1 chunk)
    ...
  ⚠ 6 existing drafts will be deleted
  ✎ Proposed title: "Block 4 Materialien"  — accept? [Y/n/rename]
```

- `rename` → prompts for a custom title before committing
- `n` → skips this group, continues to next (semantic mode may have multiple clusters)
- `--yes` flag skips all prompts (CI / bulk automation use-case)

Semantic mode iterates clusters one at a time, showing the same preview per cluster.

---

## Admin UI: `/admin/knowledge/merge-books`

Entry point: **Wissen** group in `AdminLayout.astro` sidebar, alongside Bücher and Drafts.

### Layout (two-panel)

**Left panel — "Kleine Bücher"**
- Lists all books with ≤5 chunks, sorted by chunk count ascending
- Each row: checkbox · title · chunk count badge
- "Select all" toggle at top

**Right panel — "Neue Gruppe"** (activates when ≥2 books are checked)
- Title input — pre-filled via `proposeTitleFromBooks()` on the selected set
- Slug preview — auto-derived from title, editable
- Summary line: "X Bücher · Y Chunks gesamt · Z Drafts werden gelöscht"
- Red **"Zusammenführen"** button → POST `/api/admin/books/merge`

On success:
- Merged books disappear from the left panel
- Toast: *"Block 4 Materialien erstellt — jetzt klassifizieren?"* with a link that triggers classify for the new slug

### API route: `website/src/pages/api/admin/books/merge.ts`

- Keycloak auth guard (existing pattern)
- Validates `MergeSpec` (title non-empty, ≥2 source IDs, all IDs exist and are ≤5 chunks)
- Calls `mergeBooks(pool, spec)`
- Returns `MergeResult` as JSON

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Source book has >5 chunks | CLI warns + skips; API returns 400 |
| Source book already has accepted/published snippets | Warn prominently; require `--force` in CLI or explicit checkbox in UI |
| Title/slug collision with existing collection | Prompt for rename (CLI) / inline error (UI) |
| Transaction failure | Full rollback; no partial state |

---

## Out of scope

- Re-embedding merged chunks (embeddings are preserved as-is)
- Automatic classify trigger (user initiates manually after merge)
- Splitting an oversized book (inverse operation, not requested)
- Undo / soft-delete of source books
