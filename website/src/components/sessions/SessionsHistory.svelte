<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ArchivedSession } from '../../lib/sessions/archive';

  // Svelte 5 runes
  let items = $state<ArchivedSession[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let offset = $state(0);
  let hasMore = $state(false);
  let typeFilter = $state('');
  let selectedMarkdown = $state<string | null>(null);

  let abortController: AbortController | null = null;

  async function load(reset = false) {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    loading = true;
    error = null;

    if (reset) {
      offset = 0;
      items = [];
      hasMore = false;
    }

    const queryParams = new URLSearchParams();
    queryParams.set('offset', String(offset));
    queryParams.set('limit', '50');
    if (typeFilter) {
      queryParams.set('type', typeFilter);
    }

    try {
      const res = await fetch(`/api/admin/sessions/history?${queryParams.toString()}`, {
        signal: abortController.signal
      });
      if (!res.ok) {
        throw new Error(`Fehler beim Laden (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (reset) {
        items = data.items;
      } else {
        items = [...items, ...data.items];
      }
      hasMore = data.hasMore;
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        error = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
      }
    } finally {
      loading = false;
    }
  }

  // Reactive effect when typeFilter changes
  $effect(() => {
    // Access typeFilter to set up dependency
    const _ = typeFilter;
    load(true);
  });

  onDestroy(() => {
    if (abortController) abortController.abort();
  });

  async function openSession(item: ArchivedSession) {
    selectedMarkdown = null;
    loading = true;
    try {
      const res = await fetch(`/api/admin/sessions/history/${item.id}`, {});
      if (!res.ok) {
        throw new Error('Not found');
      }
      selectedMarkdown = await res.text();
    } catch {
      selectedMarkdown = 'Inhalt nicht verfügbar';
    } finally {
      loading = false;
    }
  }

  function closeSession() {
    selectedMarkdown = null;
  }
</script>

<div class="sessions-history-container">
  <div class="filter-section">
    <label for="type-filter">Typ:</label>
    <select id="type-filter" bind:value={typeFilter}>
      <option value="">Alle</option>
      <option value="form">Formular (📋)</option>
      <option value="brainstorm">Brainstorm (🎯)</option>
    </select>
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <ul class="sessions-list">
    {#each items as item (item.id)}
      <li>
        <button type="button" class="session-card" onclick={() => openSession(item)} aria-label={item.title}>
          <span class="session-icon" aria-hidden="true">
            {item.type === 'form' ? '📋' : item.type === 'brainstorm' ? '🎯' : '🧩'}
          </span>
          <div class="session-info">
            <h4 class="session-title">{item.title}</h4>
            <span class="session-date">{new Date(item.date).toLocaleDateString()}</span>
            <span class="session-owner">Besitzer: {item.owner}</span>
            {#if item.participants && item.participants.length > 0}
              <span class="session-participants">Teilnehmer: {item.participants.join(', ')}</span>
            {/if}
          </div>
        </button>
      </li>
    {/each}
  </ul>

  {#if items.length === 0 && !loading && !error}
    <div class="empty-state">Keine vergangenen Sessions</div>
  {/if}

  {#if loading}
    <div class="loading-state">Lade...</div>
  {/if}

  {#if hasMore && !loading}
    <button type="button" class="load-more-btn" onclick={() => { offset += 50; load(); }}>
      Mehr laden
    </button>
  {/if}

  {#if selectedMarkdown !== null}
    <div class="modal-backdrop" onclick={closeSession} onkeydown={(e) => e.key === 'Escape' && closeSession()} role="presentation">
      <div class="modal-content" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 id="modal-title">Session-Ergebnis</h3>
          <button type="button" class="close-btn" onclick={closeSession}>Schließen</button>
        </div>
        <div class="modal-body">
          <pre class="markdown-preview">{selectedMarkdown}</pre>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .sessions-history-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    font-family: inherit;
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .filter-section label {
    font-weight: 600;
  }

  .filter-section select {
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #ccc);
    background: var(--bg-surface, #fff);
    color: var(--text-color, #333);
  }

  .sessions-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .session-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    background: var(--card-bg, #f9f9f9);
    border: 1px solid var(--card-border, #eee);
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    color: inherit;
    font-family: inherit;
  }

  .session-card:hover {
    background: var(--card-hover-bg, #f1f1f1);
  }

  .session-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .session-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .session-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .session-date, .session-owner, .session-participants {
    font-size: 0.8rem;
    color: var(--text-muted, #666);
  }

  .load-more-btn {
    align-self: center;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--primary-color, #007bff);
    background: transparent;
    color: var(--primary-color, #007bff);
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s, color 0.2s;
  }

  .load-more-btn:hover {
    background: var(--primary-color, #007bff);
    color: white;
  }

  .error-msg {
    color: var(--danger-color, #dc3545);
    padding: 0.5rem;
    border-radius: 4px;
    background: rgba(220, 53, 69, 0.1);
  }

  .empty-state, .loading-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted, #888);
    font-style: italic;
  }

  /* Modal Styles */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-surface, #fff);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color, #eee);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.15rem;
  }

  .close-btn {
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #ccc);
    background: transparent;
    cursor: pointer;
  }

  .close-btn:hover {
    background: var(--card-hover-bg, #f1f1f1);
  }

  .modal-body {
    padding: 1rem;
    overflow-y: auto;
    flex-grow: 1;
  }

  .markdown-preview {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 0.95rem;
    background: var(--code-bg, #f4f4f4);
    padding: 0.75rem;
    border-radius: 4px;
    max-height: 50vh;
    overflow-y: auto;
  }
</style>
