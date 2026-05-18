<!-- website/src/components/admin/BookMergePanel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type SmallBook = { id: string; title: string; chunkCount: number; slug: string };
  type MergeSpec = { title: string; slug: string; sourceBookIds: string[] };

  let books: SmallBook[] = $state([]);
  let selected = $state(new Set<string>());
  let title = $state('');
  let slug = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let newSlug = $state<string | null>(null);

  let suggestions = $state<MergeSpec[]>([]);
  let suggestLoading = $state(false);
  let suggestError = $state<string | null>(null);

  onMount(async () => {
    const res = await fetch('/api/admin/books/merge');
    if (res.ok) {
      const data = await res.json() as { books: SmallBook[] };
      books = data.books;
    }
  });

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

  function toggleBook(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;

    if (next.size >= 2) {
      const sel = books.filter(b => next.has(b.id));
      title = proposeTitle(sel);
      slug = titleToSlug(title);
    }
  }

  function toggleAll() {
    selected = selected.size === books.length ? new Set() : new Set(books.map(b => b.id));
    if (selected.size >= 2) {
      const sel = books.filter(b => selected.has(b.id));
      title = proposeTitle(sel);
      slug = titleToSlug(title);
    }
  }

  function proposeTitle(sel: SmallBook[]): string {
    if (sel.length === 0) return '';
    const freq = new Map<string, number>();
    const stop = new Set(['und','der','die','das','ein','eine','für','mit','von']);
    for (const b of sel) {
      const words = b.title.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2 && !stop.has(w));
      for (const w of new Set(words)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const common = [...freq.entries()].filter(([,f]) => f >= Math.max(2, Math.floor(sel.length * 0.4))).sort((a,b) => b[1]-a[1]);
    if (common.length === 0) return sel[0].title + ' u.a.';
    const kw = common[0][0];
    return kw.charAt(0).toUpperCase() + kw.slice(1) + ' Materialien';
  }

  function titleToSlug(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  $effect(() => { slug = titleToSlug(title); });

  const selectedBooks = $derived(books.filter(b => selected.has(b.id)));
  const totalChunks = $derived(selectedBooks.reduce((s, b) => s + b.chunkCount, 0));
  const canMerge = $derived(!busy && selected.size >= 2 && !!title.trim() && !!slug.trim());

  async function merge() {
    busy = true; error = null; successMsg = null; newSlug = null;
    try {
      const res = await fetch('/api/admin/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), slug: slug.trim(), sourceBookIds: [...selected] }),
      });
      const data = await res.json() as { error?: string; mergedBookId?: string };
      if (!res.ok) { error = data.error ?? 'Fehler'; return; }
      newSlug = slug.trim();
      successMsg = `"${title}" erstellt — ${totalChunks} Chunks übertragen.`;
      // Remove merged books from list
      const gone = new Set(selected);
      books = books.filter(b => !gone.has(b.id));
      void loadSuggestions();
      selected = new Set();
      title = '';
      slug = '';
    } catch {
      error = 'Netzwerkfehler';
    } finally {
      busy = false;
    }
  }
</script>

<div class="merge-panel">
  <div class="left">
    <div class="panel-head">
      <h2>Kleine Bücher</h2>
      <button class="btn-ghost" onclick={toggleAll}>
        {selected.size === books.length && books.length > 0 ? 'Keine' : 'Alle'}
      </button>
    </div>
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
  </div>

  <div class="right" class:active={selected.size >= 2}>
    <h2>Neue Gruppe</h2>
    {#if selected.size < 2}
      <p class="hint">Wähle mindestens 2 Bücher aus.</p>
    {:else}
      <div class="form">
        <label class="field">
          <span>Titel</span>
          <input type="text" bind:value={title} placeholder="Gruppenname" />
        </label>
        <label class="field">
          <span>Slug</span>
          <input type="text" bind:value={slug} placeholder="slug-der-gruppe" />
        </label>
        <p class="summary">
          {selected.size} Bücher · {totalChunks} Chunks gesamt
        </p>
        {#if error}<p class="err">{error}</p>{/if}
        {#if successMsg}
          <p class="success">
            ✓ {successMsg}
            {#if newSlug}
              <a href="/admin/knowledge/books">Zu den Büchern →</a>
            {/if}
          </p>
        {/if}
        <button class="btn-danger" disabled={!canMerge} onclick={merge}>
          {busy ? 'Läuft…' : 'Zusammenführen'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .merge-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .book-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .book-row label { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; border-radius: 4px; cursor: pointer; }
  .book-row:hover label { background: var(--color-surface-2, #f5f5f5); }
  .book-row.selected label { background: var(--color-accent-subtle, #e8f0fe); }
  .book-title { flex: 1; font-size: 0.875rem; }
  .chunk-badge { font-size: 0.75rem; color: var(--color-text-muted, #666); background: var(--color-surface-3, #eee); padding: 0 0.4rem; border-radius: 999px; }
  .right { opacity: 0.4; transition: opacity 0.15s; }
  .right.active { opacity: 1; }
  .form { display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
  .field input { padding: 0.4rem 0.5rem; border: 1px solid var(--color-border, #ddd); border-radius: 4px; }
  .summary { font-size: 0.8rem; color: var(--color-text-muted, #666); }
  .btn-danger { background: #c0392b; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-weight: 600; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: none; border: 1px solid var(--color-border, #ddd); padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
  .err { color: #c0392b; font-size: 0.85rem; }
  .success { color: #27ae60; font-size: 0.85rem; }
  .empty, .hint { color: var(--color-text-muted, #666); font-size: 0.875rem; }

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

  @media (max-width: 700px) { .merge-panel { grid-template-columns: 1fr; } }
</style>