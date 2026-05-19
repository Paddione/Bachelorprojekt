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
