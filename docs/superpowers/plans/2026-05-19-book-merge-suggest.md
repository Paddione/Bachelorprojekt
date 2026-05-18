---
ticket_id: T000480
title: Book Merge Auto-Suggest Implementation Plan
domains: []
status: active
pr_number: null
---

# Book Merge Auto-Suggest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing `clusterByEmbedding` function via a new API endpoint and a "Vorschläge laden" button in `BookMergePanel.svelte` so admins can get one-click auto-suggested book groups.

**Architecture:** New sibling file `suggest.ts` alongside `merge.ts` handles the GET endpoint. `BookMergePanel.svelte` gains three new state vars, two new functions (`loadSuggestions`, `applySuggestion`), a button, and inline suggestion cards — all below the existing book list. Clicking a card pre-fills the existing merge form; the merge flow itself is unchanged.

**Tech Stack:** Astro API routes (TypeScript), Svelte 5 runes (`$state`, `$derived`), `clusterByEmbedding` from `coaching-merge.ts`, pgvector cosine similarity.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `website/src/pages/api/admin/books/merge/suggest.ts` | **Create** | GET endpoint: auth check → `clusterByEmbedding(pool, 0.75)` → `{ suggestions: MergeSpec[] }` |
| `website/src/components/admin/BookMergePanel.svelte` | **Modify** | Add suggestions state, `loadSuggestions()`, `applySuggestion()`, button + cards UI, style rules |

No other files change.

---

## Task 1: Create the suggest API endpoint

**Files:**
- Create: `website/src/pages/api/admin/books/merge/suggest.ts`

This endpoint lives in the `merge/` subdirectory alongside the existing `merge.ts`. Astro maps the filesystem path directly to the URL, so this file is automatically reachable at `GET /api/admin/books/merge/suggest`.

- [ ] **Step 1: Create the file**

```typescript
// website/src/pages/api/admin/books/merge/suggest.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { clusterByEmbedding } from '../../../../../lib/coaching-merge';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const suggestions = await clusterByEmbedding(pool, 0.75);
    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
```

- [ ] **Step 2: Verify the import depth**

Count the `../` levels: the file is at `pages/api/admin/books/merge/suggest.ts` — that is 5 directories deep from `src/`, so `../../../../../lib/auth` is correct (5 levels up lands at `src/`, then `lib/auth`). Confirm by running:

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest
ls website/src/lib/auth.ts
```

Expected: file exists. If it doesn't, check `website/src/lib/` for the actual filename and adjust the import.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest
git add website/src/pages/api/admin/books/merge/suggest.ts
git commit -m "feat(coaching): add GET /api/admin/books/merge/suggest endpoint"
```

---

## Task 2: Update BookMergePanel.svelte

**Files:**
- Modify: `website/src/components/admin/BookMergePanel.svelte`

The current file has three sections: `<script>`, template, `<style>`. All additions go into those existing sections — no restructuring needed.

### 2a — Add types, state, and functions to the `<script>` block

- [ ] **Step 1: Add the MergeSpec type and new state vars**

In the `<script lang="ts">` block, after the existing `type SmallBook` declaration, add:

```typescript
  type MergeSpec = { title: string; slug: string; sourceBookIds: string[] };

  let suggestions = $state<MergeSpec[]>([]);
  let suggestLoading = $state(false);
  let suggestError = $state<string | null>(null);
```

- [ ] **Step 2: Add loadSuggestions() and applySuggestion()**

Add these two functions after the existing `$effect(() => { slug = titleToSlug(title); })` line:

```typescript
  async function loadSuggestions() {
    suggestLoading = true;
    suggestError = null;
    try {
      const res = await fetch('/api/admin/books/merge/suggest');
      if (res.ok) {
        const data = await res.json() as { suggestions: MergeSpec[] };
        suggestions = data.suggestions;
        if (suggestions.length === 0) {
          suggestError = 'Keine Vorschläge — Bücher zu verschieden oder Embeddings fehlen.';
        }
      } else {
        suggestError = 'Fehler beim Laden der Vorschläge.';
      }
    } catch {
      suggestError = 'Netzwerkfehler beim Laden der Vorschläge.';
    } finally {
      suggestLoading = false;
    }
  }

  function applySuggestion(spec: MergeSpec) {
    selected = new Set(spec.sourceBookIds);
    title = spec.title;
    slug = spec.slug;
  }
```

- [ ] **Step 3: Wire suggestion refresh into the existing merge() function**

Inside the existing `merge()` function, after the line `books = books.filter(b => !gone.has(b.id));`, add a call to reload suggestions so stale groups are removed:

```typescript
      void loadSuggestions();
```

The full updated `merge()` success block looks like:

```typescript
      newSlug = slug.trim();
      successMsg = `"${title}" erstellt — ${totalChunks} Chunks übertragen.`;
      const gone = new Set(selected);
      books = books.filter(b => !gone.has(b.id));
      void loadSuggestions();   // ← add this line
      selected = new Set();
      title = '';
      slug = '';
```

### 2b — Add UI: button and suggestion cards

- [ ] **Step 4: Add the "Vorschläge laden" button and cards to the template**

The suggestion section goes inside `<div class="left">`, between the `</ul>` (end of book list) and the existing `<button class="btn-ghost" onclick={toggleAll}>` line in the `<div class="panel-head">`. Actually, the `panel-head` is at the TOP — so place the suggestion section at the BOTTOM of `<div class="left">`, after the `{:else}` block that contains the `<ul>`.

Find this in the template:
```html
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
```

Replace it with:

```html
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

    <div class="suggest-section">
      <button class="btn-suggest" disabled={suggestLoading} onclick={loadSuggestions}>
        {suggestLoading ? 'Lade…' : '✨ Vorschläge laden'}
      </button>
      {#if suggestError}
        <p class="suggest-hint">{suggestError}</p>
      {/if}
      {#if suggestions.length > 0}
        <ul class="suggest-list">
          {#each suggestions as spec}
            {@const specChunks = books.filter(b => spec.sourceBookIds.includes(b.id)).reduce((s, b) => s + b.chunkCount, 0)}
            <li class="suggest-card" onclick={() => applySuggestion(spec)}>
              <span class="suggest-title">{spec.title}</span>
              <span class="suggest-meta">{spec.sourceBookIds.length} Bücher · {specChunks} Chunks</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
```

### 2c — Add styles

- [ ] **Step 5: Add CSS for the new elements**

In the `<style>` block, append after the last existing rule:

```css
  .suggest-section { margin-top: 1rem; border-top: 1px solid var(--color-border, #ddd); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .btn-suggest { background: none; border: 1px solid var(--color-border, #ddd); padding: 0.35rem 0.7rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; width: 100%; text-align: left; }
  .btn-suggest:hover:not(:disabled) { background: var(--color-surface-2, #f5f5f5); }
  .btn-suggest:disabled { opacity: 0.6; cursor: not-allowed; }
  .suggest-hint { font-size: 0.8rem; color: var(--color-text-muted, #666); margin: 0; }
  .suggest-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .suggest-card { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.45rem 0.6rem; border: 1px solid var(--color-accent-subtle, #c8dafe); border-radius: 4px; cursor: pointer; background: var(--color-surface-2, #f5f5f5); }
  .suggest-card:hover { background: var(--color-accent-subtle, #e8f0fe); }
  .suggest-title { font-size: 0.85rem; font-weight: 600; }
  .suggest-meta { font-size: 0.75rem; color: var(--color-text-muted, #666); }
```

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest
git add website/src/components/admin/BookMergePanel.svelte
git commit -m "feat(coaching): add auto-suggest button and cards to BookMergePanel"
```

---

## Task 3: Verify and type-check

- [ ] **Step 1: Run offline tests**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest
task test:all
```

Expected: all BATS unit tests and manifest checks pass. This does not cover the new Svelte/TS changes — that is checked in the next step.

- [ ] **Step 2: TypeScript check on the website**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest/website
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If there are import errors on `suggest.ts`, recount the `../` levels — the file is 5 directories deep from `src/`.

- [ ] **Step 3: Commit verification result**

If both checks pass, no extra commit needed. If you had to fix a type error, commit the fix:

```bash
git add -A
git commit -m "fix(coaching): correct import paths in suggest endpoint"
```

---

## Task 4: Push and create PR

- [ ] **Step 1: Push branch**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/book-merge-suggest
git push -u origin feature/book-merge-suggest
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat(coaching): book merge auto-suggest via clusterByEmbedding" \
  --body "$(cat <<'EOF'
## Summary
- New `GET /api/admin/books/merge/suggest` endpoint wraps `clusterByEmbedding(pool, 0.75)` — returns pgvector-clustered groups of small books (≤5 chunks)
- `BookMergePanel.svelte` gains a \"✨ Vorschläge laden\" button below the book list; clicking a suggestion card pre-fills the existing merge form (title, slug, selection)
- Silent handling of books without embeddings; message shown only when zero suggestions result

## Test plan
- [ ] `task test:all` passes (offline tests)
- [ ] `npx tsc --noEmit` passes in `website/`
- [ ] Smoke: open `/admin/knowledge/merge-books` → click \"Vorschläge laden\" → verify suggestion cards appear → click a card → verify form pre-filled → merge → verify suggestions refresh

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge PR immediately**

```bash
gh pr merge --squash --auto
```

- [ ] **Step 4: Deploy to both clusters**

```bash
cd /home/patrick/Bachelorprojekt
task feature:website
```

Expected: website image rebuilt and rolled out on both mentolder and korczewski. Verify at `https://web.mentolder.de/admin/knowledge/merge-books`.
