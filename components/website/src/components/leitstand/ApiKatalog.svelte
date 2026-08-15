<script lang="ts">
  // ApiKatalog.svelte — Vollwertiger API-Katalog des Wissens-Decks (T008016/E4).
  // Ersetzt die 8-Zeilen-Vorschau in DeckWissen.svelte: filterbarer Katalog
  // ueber ALLE 123 Routen, gruppiert nach Pfadsegment, plus MCP-Server-Health.
  // MCP-Health laeuft ausschliesslich ueber die Server-Route /sdlc/api/mcp-health
  // (delta-spec: Browser MUSS MCP-Ports indirekt pruefen); der Poll ist bei
  // unsichtbarem Tab pausiert (document.hidden).
  import { onMount } from 'svelte';
  import apiInventory from '../../data/api-inventory.json';

  interface ApiRoute {
    path: string; file: string; methods: string[]; backend: string[];
    description: string | null; tier: string | null; deprecated: string | null;
  }
  interface McpServerEntry { name: string; transport: string | null; endpoint: string | null }
  interface ApiInventory {
    routes: ApiRoute[];
    mcpServers: McpServerEntry[];
    factoryTools: unknown[];
  }

  interface McpHealthServer { name: string; ok: boolean; error: string | null }
  interface McpHealth { fetchedAt: string; servers: McpHealthServer[] }

  const inventory = apiInventory as ApiInventory;
  const HEALTH_REFRESH_MS = 30_000;

  // ── Suche ──
  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inventory.routes;
    return inventory.routes.filter((r) =>
      r.path.toLowerCase().includes(q) ||
      r.file.toLowerCase().includes(q) ||
      r.methods.join(',').toLowerCase().includes(q) ||
      r.backend.join(',').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.tier ?? '').toLowerCase().includes(q),
    );
  });

  // Gruppierung nach zweitem Pfadsegment (alle Routen liegen unter /sdlc/api).
  interface RouteGroup { prefix: string; routes: ApiRoute[] }
  const groups = $derived.by(() => {
    const map = new Map<string, ApiRoute[]>();
    for (const r of filtered) {
      const seg = r.path.split('/')[3] ?? '';
      const key = seg ? `/sdlc/api/${seg}` : '/sdlc/api';
      const list = map.get(key);
      if (list) list.push(r); else map.set(key, [r]);
    }
    return [...map.entries()]
      .map(([prefix, routes]): RouteGroup => ({ prefix, routes }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  });

  const totalCount = inventory.routes.length;
  const shownCount = $derived(filtered.length);

  // ── MCP-Health (nur ueber die Server-Route) ──
  let health = $state<McpHealth | null>(null);
  let healthError = $state<string | null>(null);
  let healthTimer: ReturnType<typeof setInterval> | null = null;

  async function loadHealth() {
    try {
      const res = await fetch('/sdlc/api/mcp-health', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      health = (await res.json()) as McpHealth;
      healthError = null;
    } catch (e) {
      healthError = e instanceof Error ? e.message : 'MCP-Health nicht erreichbar';
    }
  }

  function onVisibility() {
    if (document.hidden) {
      if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
    } else if (!healthTimer) {
      void loadHealth();
      healthTimer = setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
    }
  }

  onMount(() => {
    void loadHealth();
    healthTimer = setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (healthTimer) clearInterval(healthTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  const METHOD_TONES: Record<string, string> = {
    GET: 'ls-method--get',
    POST: 'ls-method--post',
    PUT: 'ls-method--put',
    DELETE: 'ls-method--delete',
    PATCH: 'ls-method--patch',
  };

  const BACKEND_LABELS: Record<string, string> = {
    postgres: 'PostgreSQL',
    'k8s-rest': 'Kubernetes API',
    filesystem: 'Dateisystem',
    github: 'GitHub REST',
    kubectl: 'kubectl',
    unknown: 'unbekannt',
  };
</script>

<section class="ls-api-katalog" data-testid="leitstand-api-katalog" aria-label="API-Katalog">
  <header class="ls-api-katalog__head">
    <h2 class="ls-api-katalog__heading">API-Katalog</h2>
    <p class="ls-api-katalog__count">{shownCount} / {totalCount} Routen</p>
  </header>

  <input
    class="ls-api-katalog__search"
    type="search"
    placeholder="Pfad, Datei, Methode, Backend…"
    bind:value={query}
    aria-label="API-Katalog durchsuchen"
  />

  {#if shownCount === 0}
    <p class="ls-api-katalog__empty">Keine Routen gefunden.</p>
  {:else}
    <div class="ls-api-katalog__groups">
      {#each groups as group}
        <section class="ls-api-katalog__group">
          <h3 class="ls-api-katalog__group-head">
            <span class="ls-api-katalog__group-prefix">{group.prefix}</span>
            <span class="ls-api-katalog__group-count">{group.routes.length}</span>
          </h3>
          <table class="ls-api-katalog__table">
            <thead>
              <tr>
                <th>Pfad</th>
                <th>Methoden</th>
                <th>Backend</th>
              </tr>
            </thead>
            <tbody>
              {#each group.routes as route}
                <tr>
                  <td>
                    <code class="ls-api-katalog__path">{route.path}</code>
                    {#if route.tier}
                      <span class="ls-api-katalog__tier">{route.tier}</span>
                    {/if}
                    {#if route.deprecated}
                      <span class="ls-api-katalog__deprecated">deprecated</span>
                    {/if}
                    {#if route.description}
                      <p class="ls-api-katalog__desc">{route.description}</p>
                    {/if}
                  </td>
                  <td>
                    <span class="ls-api-katalog__methods">
                      {#each route.methods as method}
                        <span class="ls-method {METHOD_TONES[method] ?? ''}">{method}</span>
                      {/each}
                    </span>
                  </td>
                  <td>
                    <span class="ls-api-katalog__backends">
                      {#each route.backend as backend}
                        <span class="ls-api-katalog__backend">{BACKEND_LABELS[backend] ?? backend}</span>
                      {/each}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>
  {/if}

  <h3 class="ls-api-katalog__heading ls-api-katalog__mcp-heading">MCP-Server</h3>
  {#if healthError}
    <p class="ls-api-katalog__error">{healthError}</p>
  {:else if health}
    <ul class="ls-api-katalog__mcp" data-testid="leitstand-mcp-health">
      {#each health.servers as server}
        <li class="ls-api-katalog__mcp-row {server.ok ? 'ls-api-katalog__mcp-row--ok' : 'ls-api-katalog__mcp-row--down'}">
          <span class="ls-api-katalog__mcp-name">{server.name}</span>
          {#if server.ok}
            <span class="ls-api-katalog__mcp-state">ok</span>
          {:else}
            <span class="ls-api-katalog__mcp-state">down</span>
            <span class="ls-api-katalog__mcp-err">{server.error}</span>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="ls-api-katalog__meta">Datenstand: {new Date(health.fetchedAt).toLocaleString('de-DE')}</p>
  {:else}
    <p class="ls-api-katalog__meta">MCP-Health wird geladen …</p>
  {/if}
</section>

<style>
  .ls-api-katalog {
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-4, 8px);
  }

  .ls-api-katalog__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--ls-space-4, 8px);
  }

  .ls-api-katalog__heading {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: 0;
  }

  .ls-api-katalog__mcp-heading {
    margin-top: var(--ls-space-4, 8px);
  }

  .ls-api-katalog__count {
    margin: 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .ls-api-katalog__search {
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-text-primary, #e6edf3);
    font-family: var(--ls-font-sans, system-ui);
    font-size: 0.8rem;
    padding: 6px 10px;
  }

  .ls-api-katalog__search:focus {
    outline: none;
    border-color: var(--ls-signal-info, #4c8dff);
  }

  .ls-api-katalog__empty {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .ls-api-katalog__groups {
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-5, 12px);
  }

  .ls-api-katalog__group {
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-2, 4px);
  }

  .ls-api-katalog__group-head {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--ls-space-2, 4px);
  }

  .ls-api-katalog__group-prefix {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .ls-api-katalog__group-count {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .ls-api-katalog__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .ls-api-katalog__table th {
    text-align: left;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    font-weight: 500;
    padding: var(--ls-space-2, 4px);
    border-bottom: 1px solid var(--ls-line-strong, #232a35);
  }

  .ls-api-katalog__table td {
    padding: var(--ls-space-2, 4px);
    border-bottom: 1px solid var(--ls-line, #1d232c);
    color: var(--ls-text-secondary, #9aa4b2);
    vertical-align: top;
  }

  .ls-api-katalog__path {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    color: var(--ls-text-primary, #e6edf3);
  }

  .ls-api-katalog__desc {
    margin: 2px 0 0;
    font-size: 0.7rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .ls-api-katalog__tier,
  .ls-api-katalog__deprecated {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.6rem;
    margin-left: var(--ls-space-2, 4px);
    padding: 1px 5px;
    border-radius: var(--ls-radius-sm, 4px);
    border: 1px solid var(--ls-line, #1d232c);
  }

  .ls-api-katalog__tier { color: var(--ls-signal-info, #4c8dff); }
  .ls-api-katalog__deprecated { color: var(--ls-signal-red, #ff5c5c); }

  .ls-api-katalog__methods,
  .ls-api-katalog__backends {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--ls-space-2, 4px);
  }

  .ls-method {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.6rem;
    padding: 1px 5px;
    border-radius: var(--ls-radius-sm, 4px);
    border: 1px solid var(--ls-line, #1d232c);
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .ls-method--get    { color: var(--ls-signal-green, #3fb950); }
  .ls-method--post   { color: var(--ls-signal-info, #4c8dff); }
  .ls-method--put    { color: var(--ls-signal-amber, #d29922); }
  .ls-method--delete { color: var(--ls-signal-red, #ff5c5c); }
  .ls-method--patch  { color: var(--ls-signal-purple, #a371f7); }

  .ls-api-katalog__backend {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.6rem;
    padding: 1px 5px;
    border-radius: var(--ls-radius-sm, 4px);
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .ls-api-katalog__mcp {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-2, 4px);
  }

  .ls-api-katalog__mcp-row {
    display: flex;
    align-items: baseline;
    gap: var(--ls-space-3, 6px);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    padding: var(--ls-space-2, 4px) var(--ls-space-3, 6px);
    border-radius: var(--ls-radius-sm, 4px);
    border: 1px solid var(--ls-line, #1d232c);
  }

  .ls-api-katalog__mcp-row--ok { border-color: var(--ls-signal-green, #3fb950); }
  .ls-api-katalog__mcp-row--down { border-color: var(--ls-signal-red, #ff5c5c); }

  .ls-api-katalog__mcp-name { color: var(--ls-text-primary, #e6edf3); }
  .ls-api-katalog__mcp-state { color: var(--ls-text-muted, #707b8a); }
  .ls-api-katalog__mcp-err { color: var(--ls-signal-red, #ff5c5c); }

  .ls-api-katalog__meta {
    margin: 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .ls-api-katalog__error {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ls-signal-red, #ff5c5c);
  }
</style>
