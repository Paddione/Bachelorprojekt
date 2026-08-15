<script lang="ts">
  // T008016/E4: Der API-Katalog ist in <ApiKatalog /> (einziger Konsument von
  // api-inventory.json unter components/leitstand/, Guard T3). Hier bleibt
  // die OpenSpec-Suche; der Vorschau-Katalog wurde durch das Vollmodul ersetzt.
  import ApiKatalog from '../ApiKatalog.svelte';

  // ── OpenSpec-Suche: eigener $state-Block, direkter fetch (etabliertes
  //    Kartenmuster fuer SDLC-API-Routen, Befund 3 aus E3). ──
  interface OpenspecHit {
    slug: string; ticket_id: string | null; section_title: string | null;
    file_type: string | null; snippet: string; similarity: number;
  }
  let query = $state('');
  let results = $state<OpenspecHit[] | null>(null);
  let searchError = $state<string | null>(null);
  let searching = $state(false);

  async function search() {
    const q = query.trim();
    if (q.length < 2) { searchError = 'Mindestens 2 Zeichen.'; results = null; return; }
    searching = true;
    searchError = null;
    try {
      const res = await fetch(`/sdlc/api/openspec/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok || body.error) { searchError = body.error ?? `HTTP ${res.status}`; results = null; return; }
      results = body.results ?? [];
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Suche fehlgeschlagen';
      results = null;
    } finally {
      searching = false;
    }
  }
</script>

<section class="deck-wissen" data-testid="deck-panel-wissen">
  <h2 class="deck-wissen__heading">API-Katalog</h2>
  <ApiKatalog />

  <h2 class="deck-wissen__heading">OpenSpec-Suche</h2>
  <form class="deck-wissen__search" onsubmit={(e) => { e.preventDefault(); search(); }}>
    <input
      type="search"
      placeholder="Change, Spec oder Ticket…"
      bind:value={query}
      aria-label="OpenSpec durchsuchen"
    />
    <button type="submit" disabled={searching}>{searching ? '…' : 'Suchen'}</button>
  </form>

  {#if searchError}
    <p class="deck-wissen__error">{searchError}</p>
  {/if}

  {#if results && results.length > 0}
    <ul class="deck-wissen__results">
      {#each results as hit}
        <li class="deck-wissen__result">
          <span class="deck-wissen__result-top">
            <span class="deck-wissen__slug">{hit.slug}</span>
            <span class="deck-wissen__similarity">{Math.round(hit.similarity * 100)}%</span>
          </span>
          <span class="deck-wissen__meta">
            {hit.ticket_id ?? '—'} · {hit.section_title ?? '—'} · {hit.file_type ?? '—'}
          </span>
          <p class="deck-wissen__snippet">{hit.snippet}</p>
        </li>
      {/each}
    </ul>
  {:else if results && results.length === 0}
    <p class="deck-wissen__empty">Keine Treffer.</p>
  {/if}
</section>

<style>
  .deck-wissen {
    padding: var(--ls-space-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-4, 8px);
  }

  .deck-wissen__heading {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: var(--ls-space-4, 8px) 0 0;
  }

  .deck-wissen__search {
    display: flex;
    gap: var(--ls-space-2, 4px);
  }

  .deck-wissen__search input {
    flex: 1;
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-text-primary, #e6edf3);
    font-family: var(--ls-font-sans, system-ui);
    font-size: 0.8rem;
    padding: 6px 10px;
  }

  .deck-wissen__search input:focus {
    outline: none;
    border-color: var(--ls-signal-info, #4c8dff);
  }

  .deck-wissen__search button {
    background: var(--ls-signal-info-dim, rgba(76, 141, 255, 0.15));
    border: 1px solid var(--ls-signal-info, #4c8dff);
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-signal-info, #4c8dff);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    padding: 6px 12px;
    cursor: pointer;
  }

  .deck-wissen__search button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .deck-wissen__error {
    color: var(--ls-signal-red, #ff5c5c);
    font-size: 0.8rem;
    margin: 0;
  }

  .deck-wissen__empty {
    color: var(--ls-text-muted, #707b8a);
    font-size: 0.8rem;
    margin: 0;
  }

  .deck-wissen__results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-3, 6px);
  }

  .deck-wissen__result {
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-sm, 4px);
    padding: var(--ls-space-3, 6px) var(--ls-space-4, 8px);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .deck-wissen__result-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--ls-space-2, 4px);
  }

  .deck-wissen__slug {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    color: var(--ls-text-primary, #e6edf3);
  }

  .deck-wissen__similarity {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-signal-green, #3fb950);
  }

  .deck-wissen__meta {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .deck-wissen__snippet {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ls-text-secondary, #9aa4b2);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
</style>
