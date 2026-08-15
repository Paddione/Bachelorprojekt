<script lang="ts">
  // T007957/E3, p2 Task 4: einzige Deck-Datei mit eigenem Script-Inhalt.
  // Import-Pfad-Korrektur gegenueber dem Plan (Befund, dokumentiert im PR):
  // der Plan nannte vier Ebenen ('../../../../data/...'), die Datei liegt aber
  // unter components/website/src/data/ -- von leitstand/decks/ aus sind es
  // genau drei Ebenen bis src.
  import apiInventory from '../../../data/api-inventory.json';

  interface ApiRoute {
    path: string; file: string; methods: string[]; backend: string[];
    description: string | null; tier: string | null; deprecated: string | null;
  }
  interface ApiInventory { routes: ApiRoute[]; mcpServers: unknown[]; factoryTools: unknown[] }

  const inventory = apiInventory as ApiInventory;
  const routeCount = inventory.routes.length;
  const byBackend = inventory.routes.reduce<Record<string, number>>((acc, r) => {
    for (const b of r.backend) acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const PREVIEW_LIMIT = 8;
  const preview = inventory.routes.slice(0, PREVIEW_LIMIT);

  // ── OpenSpec-Suche: eigener $state-Block, direkter fetch (etabliertes
  //    Kartenmuster fuer SDLC-API-Routen, Befund 3). ──
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
  <p class="deck-wissen__count">{routeCount} Routen</p>
  <div class="deck-wissen__chips">
    {#each Object.entries(byBackend) as [backend, count]}
      <span class="deck-wissen__chip">{backend} · {count}</span>
    {/each}
  </div>
  <table class="deck-wissen__table">
    <thead>
      <tr>
        <th>Pfad</th>
        <th>Methoden</th>
        <th>Backend</th>
      </tr>
    </thead>
    <tbody>
      {#each preview as route}
        <tr>
          <td class="deck-wissen__path">{route.path}</td>
          <td>{route.methods.join(', ')}</td>
          <td>{route.backend.join(', ')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="deck-wissen__hint">Vollständiger, filterbarer Katalog folgt in E4</p>

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

  .deck-wissen__count {
    color: var(--ls-text-secondary, #9aa4b2);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    margin: 0;
  }

  .deck-wissen__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ls-space-2, 4px);
  }

  .deck-wissen__chip {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: var(--ls-radius-sm, 4px);
    border: 1px solid var(--ls-line, #1d232c);
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .deck-wissen__table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
  }

  .deck-wissen__table th {
    text-align: left;
    color: var(--ls-text-muted, #707b8a);
    font-weight: 500;
    padding: var(--ls-space-2, 4px);
    border-bottom: 1px solid var(--ls-line-strong, #232a35);
  }

  .deck-wissen__table td {
    padding: var(--ls-space-2, 4px);
    border-bottom: 1px solid var(--ls-line, #1d232c);
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .deck-wissen__path {
    color: var(--ls-text-primary, #e6edf3);
  }

  .deck-wissen__hint {
    color: var(--ls-text-muted, #707b8a);
    font-size: 0.75rem;
    margin: 0;
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
