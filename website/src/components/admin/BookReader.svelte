<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let bookId: string;

  type Chunk = {
    id: string;
    position: number;
    text: string;
    metadata: { page?: number | null };
  };
  type Cluster = { id: string; name: string };

  let chunks: Chunk[] = [];
  let clusters: Cluster[] = [];
  let loading = false;
  let exhausted = false;
  let offset = 0;
  const LIMIT = 50;

  let containerEl: HTMLElement;
  let selection: {
    text: string;
    rect: DOMRect;
    chunkId: string;
    page: number | null;
  } | null = null;
  let modalOpen = false;
  let saveError = '';
  let form = {
    title: '',
    body: '',
    tags: '',
    clusterId: '',
    page: null as number | null,
  };

  onMount(async () => {
    await Promise.all([loadMore(), loadClusters()]);
    document.addEventListener('mouseup', handleSelection);
  });

  onDestroy(() => {
    document.removeEventListener('mouseup', handleSelection);
  });

  async function loadMore() {
    if (loading || exhausted) return;
    loading = true;
    try {
      const r = await fetch(
        `/api/admin/coaching/books/${bookId}/chunks?limit=${LIMIT}&offset=${offset}`,
      );
      if (!r.ok) throw new Error(`chunks ${r.status}`);
      const data = await r.json();
      chunks = [...chunks, ...data.chunks];
      offset += data.chunks.length;
      if (data.chunks.length < LIMIT) exhausted = true;
    } finally {
      loading = false;
    }
  }

  async function loadClusters() {
    const r = await fetch(`/api/admin/coaching/clusters?book_id=${bookId}`);
    if (r.ok) clusters = await r.json();
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerEl?.contains(sel.anchorNode)) {
      selection = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    let el: HTMLElement | null = sel.anchorNode as HTMLElement;
    while (el && !el.dataset?.chunkId) el = el.parentElement;
    if (!el) {
      selection = null;
      return;
    }
    selection = {
      text: sel.toString(),
      rect,
      chunkId: el.dataset.chunkId!,
      page: el.dataset.page ? parseInt(el.dataset.page, 10) : null,
    };
  }

  function openModal() {
    if (!selection) return;
    form = {
      title:
        selection.text.slice(0, 60).trim() +
        (selection.text.length > 60 ? '…' : ''),
      body: selection.text,
      tags: '',
      clusterId: '',
      page: selection.page,
    };
    saveError = '';
    modalOpen = true;
  }

  async function saveSnippet() {
    if (!selection) return;
    const payload = {
      bookId,
      title: form.title,
      body: form.body,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      page: form.page,
      clusterId: form.clusterId || null,
      knowledgeChunkId: selection.chunkId,
    };
    const r = await fetch('/api/admin/coaching/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      saveError = `Fehler beim Speichern (${r.status})`;
      return;
    }
    const snippet = await r.json();
    modalOpen = false;
    selection = null;
    window.dispatchEvent(
      new CustomEvent('coaching:snippet-created', { detail: snippet }),
    );
  }

  function onScroll() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    if (scrollTop + clientHeight > scrollHeight - 200) loadMore();
  }
</script>

<div class="reader" bind:this={containerEl} on:scroll={onScroll}>
  {#each chunks as chunk (chunk.id)}
    <p
      class="chunk"
      data-chunk-id={chunk.id}
      data-page={chunk.metadata.page ?? ''}
    >
      {chunk.text}
    </p>
  {/each}
  {#if loading}
    <p class="loading">Lade …</p>
  {/if}
  {#if exhausted && chunks.length === 0}
    <p class="loading">Dieses Buch enthält noch keine Chunks.</p>
  {/if}
</div>

{#if selection && !modalOpen}
  <button
    class="float-btn"
    style="top: {selection.rect.top +
      window.scrollY -
      40}px; left: {selection.rect.left + window.scrollX}px"
    on:click={openModal}>+ Snippet anlegen</button
  >
{/if}

{#if modalOpen}
  <div
    class="modal-backdrop"
    on:click={() => (modalOpen = false)}
    on:keydown={(e) => e.key === 'Escape' && (modalOpen = false)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="document">
      <h3>Snippet anlegen</h3>
      <label>
        Titel
        <input bind:value={form.title} />
      </label>
      <label>
        Text
        <textarea bind:value={form.body} rows="6"></textarea>
      </label>
      <label>
        Tags (Komma-separiert)
        <input bind:value={form.tags} placeholder="reflexion, körper" />
      </label>
      <label>
        Cluster
        <select bind:value={form.clusterId}>
          <option value="">— kein Cluster —</option>
          {#each clusters as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </label>
      <label>
        Seite
        <input type="number" bind:value={form.page} />
      </label>
      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}
      <div class="actions">
        <button on:click={() => (modalOpen = false)}>Abbrechen</button>
        <button class="primary" on:click={saveSnippet}>Speichern</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .reader {
    max-height: 70vh;
    overflow-y: auto;
    padding: 1rem 1.5rem;
    line-height: 1.7;
    font-family: 'Newsreader', Georgia, serif;
    font-size: 1rem;
  }
  .chunk { margin: 0 0 0.85rem; }
  .loading { text-align: center; color: var(--text-muted, #888); }
  .float-btn {
    position: absolute;
    padding: 0.4rem 0.75rem;
    background: var(--brass, #c9a55c);
    color: #1a1817;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 100;
    font-size: 0.82rem;
    font-weight: 500;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal {
    background: var(--bg-2, #fff);
    padding: 1.5rem;
    border-radius: 8px;
    min-width: 480px;
    max-width: 600px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }
  .modal h3 { margin: 0 0 1rem; font-family: 'Newsreader', Georgia, serif; font-weight: 400; }
  .modal label { display: block; margin: 0.75rem 0; font-size: 0.85rem; color: var(--text-muted, #555); }
  .modal label input,
  .modal label select,
  .modal label textarea {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.45rem;
    font-size: 0.92rem;
    border: 1px solid var(--line, #ddd);
    border-radius: 4px;
  }
  .modal .error { color: #b06b4a; font-size: 0.85rem; margin: 0.5rem 0 0; }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .actions button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--line, #ddd);
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .actions button.primary {
    background: var(--brass, #c9a55c);
    color: #1a1817;
    border-color: var(--brass, #c9a55c);
  }
</style>
