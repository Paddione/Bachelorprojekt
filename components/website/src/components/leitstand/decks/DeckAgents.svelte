<script lang="ts">
  // DeckAgents.svelte — Nebendomaenen-Deck "Agents" (T016600).
  // Agents-Übersicht aus /sdlc/api/agents-overview: lokale Backends,
  // Sessions, agent-lock-Claims mit Ticket-Verknüpfung, Public-API-Status.
  // Takt: Fetch bei Mount + alle 30 s (Server cached 25 s); Cleanup bei
  // Dismount (DeckLeiste mountet nur das aktive Deck). Fail-soft: jede
  // Sektion rendert ihren eigenen Fehlerzustand.
  import { onMount, onDestroy } from 'svelte';
  import { parseLeitstandQuery, pushLeitstandSelection } from '../../../lib/sdlc/leitstand-url';

  interface Backend { name: string; kind: string; url: string; status: string; models: string[]; detail: string }
  interface Recent { id: string; title: string; updated: number | null }
  interface Sessions { backend: string; status: string; detail: string; count: number; recent: Recent[] }
  interface Claim {
    scope: string; id: string; tool: string; ownerSid: string;
    state: 'live' | 'stale'; label: string; branch: string;
    ticket: string; worktree: string; file: string;
  }
  interface PubApi { name: string; url: string; status: string; detail: string }
  interface Payload {
    fetchedAt: string; cacheHit: boolean; generatedAt: number | null;
    localBackends: Backend[]; agentProcesses: { pid: number; etime: string; cmd: string }[];
    agentSessions: Record<string, Sessions>; publicApi: PubApi[];
    claims: Claim[]; errors: Record<string, string>;
  }

  const POLL_MS = 30_000;

  let payload = $state<Payload | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const res = await fetch('/sdlc/api/agents-overview', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = (await res.json()) as Payload;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Netzwerkfehler beim Laden.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    timer = setInterval(() => void load(), POLL_MS);
  });

  onDestroy(() => {
    if (timer !== null) clearInterval(timer);
  });

  function selectTicket(id: string) {
    const current = parseLeitstandQuery(new URLSearchParams(window.location.search));
    pushLeitstandSelection({ ...current, ticket: id });
  }

  const upCount = $derived(payload ? payload.localBackends.filter((b) => b.status === 'up').length : 0);
  const totalCount = $derived(payload ? payload.localBackends.length : 0);
  const liveClaims = $derived(payload ? payload.claims.filter((c) => c.state === 'live') : []);
  const sessionList = $derived(payload ? Object.values(payload.agentSessions) : []);
  const fetchedTime = $derived(
    payload ? new Date(payload.fetchedAt).toLocaleTimeString('de-DE') : '',
  );
</script>

<section class="deck-agents" data-testid="deck-panel-agents" data-purpose-id="deck-agents">
  <div class="deck-agents__head">
    <h2 class="deck-agents__heading">Agents</h2>
    {#if payload}
      <span
        class="deck-agents__dot"
        class:deck-agents__dot--ok={upCount === totalCount && !payload.errors['agents-script']}
        class:deck-agents__dot--warn={upCount !== totalCount || payload.errors['agents-script']}
        title="{upCount}/{totalCount} Backends up, {liveClaims.length} live Claims"
      ></span>
    {/if}
    <button type="button" class="deck-agents__refresh" onclick={() => void load()} aria-label="Agents-Übersicht aktualisieren">
      Aktualisieren
    </button>
  </div>
  <p class="deck-agents__meta">
    {#if loading}Lade Übersicht…{:else if error}Fehler: {error}{:else}Stand: {fetchedTime} · alle 30 s{payload?.cacheHit ? ' · Cache' : ''}{/if}
  </p>

  {#if payload}
    <h3 class="deck-agents__sub">Backends ({upCount}/{totalCount} up)</h3>
    {#if payload.errors['agents-script']}
      <p class="deck-agents__error" data-testid="deck-agents-backends-error">
        Backends nicht verfügbar: {payload.errors['agents-script']}
      </p>
    {:else}
      <ul class="deck-agents__list" data-testid="deck-agents-backends">
        {#each payload.localBackends as b (b.name)}
          <li class="deck-agents__row" title="{b.url} — {b.detail}">
            <span class="deck-agents__dot" class:deck-agents__dot--ok={b.status === 'up'}></span>
            <span class="deck-agents__name">{b.name}</span>
            <span class="deck-agents__detail">{b.models.slice(0, 2).join(', ') || b.detail}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <h3 class="deck-agents__sub">Laufende Arbeiten ({liveClaims.length} live)</h3>
    {#if payload.errors['locks']}
      <p class="deck-agents__error">Claims nicht verfügbar: {payload.errors['locks']}</p>
    {:else if payload.claims.length === 0}
      <p class="deck-agents__hint">Keine aktiven Claims.</p>
    {:else}
      <ul class="deck-agents__list" data-testid="deck-agents-claims">
        {#each payload.claims as c (`${c.scope}/${c.file}`)}
          <li class="deck-agents__row deck-agents__row--claim">
            <span
              class="deck-agents__dot"
              class:deck-agents__dot--ok={c.state === 'live'}
              title={c.state}
            ></span>
            <span class="deck-agents__name">{c.id}</span>
            <span class="deck-agents__detail">{c.tool}{c.label ? ` · ${c.label}` : ''}{c.branch ? ` · ${c.branch}` : ''}</span>
            {#if c.ticket}
              <button
                type="button"
                class="deck-agents__ticket"
                title="Ticket {c.ticket} in der Kontextzone zeigen"
                onclick={() => selectTicket(c.ticket)}
              >
                {c.ticket}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <h3 class="deck-agents__sub">Sessions</h3>
    {#if sessionList.length === 0}
      <p class="deck-agents__hint">Keine Session-Quellen verfügbar.</p>
    {:else}
      <ul class="deck-agents__list" data-testid="deck-agents-sessions">
        {#each sessionList as s (s.backend)}
          <li class="deck-agents__session">
            <span class="deck-agents__name">{s.backend}</span>
            <span class="deck-agents__detail">{s.detail}</span>
            {#if s.recent.length > 0}
              <ul class="deck-agents__recent">
                {#each s.recent.slice(0, 3) as r (r.id)}
                  <li title={r.id}>{r.title || r.id}</li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <h3 class="deck-agents__sub">Public API</h3>
    <ul class="deck-agents__list" data-testid="deck-agents-public">
      {#each payload.publicApi as p (p.name)}
        <li class="deck-agents__row" title="{p.url} — {p.detail}">
          <span
            class="deck-agents__dot"
            class:deck-agents__dot--ok={p.status === 'up' || p.status === 'auth-required'}
          ></span>
          <span class="deck-agents__name">{p.name}</span>
          <span class="deck-agents__detail">{p.detail}</span>
        </li>
      {/each}
    </ul>
    <p class="deck-agents__meta">{payload.agentProcesses.length} Agent-Prozesse auf dem Host.</p>
  {/if}
</section>

<style>
  .deck-agents {
    padding: var(--ls-space-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-4, 8px);
  }

  .deck-agents__head {
    display: flex;
    align-items: center;
    gap: var(--ls-space-3, 6px);
  }

  .deck-agents__heading {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: 0;
    flex: 1;
  }

  .deck-agents__sub {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: var(--ls-space-4, 8px) 0 0;
  }

  .deck-agents__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ls-signal-error, #d64545);
    flex: none;
  }

  .deck-agents__dot--ok {
    background: var(--ls-status-ok, #3fb950);
  }

  .deck-agents__dot--warn {
    background: var(--ls-status-warning, #d29922);
  }

  .deck-agents__refresh {
    background: none;
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-text-secondary, #9aa4b2);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    padding: var(--ls-space-2, 4px) var(--ls-space-3, 6px);
    cursor: pointer;
  }

  .deck-agents__refresh:hover {
    color: var(--ls-text-primary, #e6edf3);
    border-color: var(--ls-signal-info-dim, rgba(76, 141, 255, 0.3));
  }

  .deck-agents__meta {
    color: var(--ls-text-muted, #707b8a);
    font-size: 0.75rem;
    margin: 0;
  }

  .deck-agents__hint {
    color: var(--ls-text-muted, #707b8a);
    font-size: 0.8rem;
    margin: 0;
  }

  .deck-agents__error {
    color: var(--ls-signal-error, #d64545);
    font-size: 0.8rem;
    margin: 0;
  }

  .deck-agents__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-2, 4px);
  }

  .deck-agents__row {
    display: flex;
    align-items: baseline;
    gap: var(--ls-space-3, 6px);
    font-size: 0.8rem;
    min-width: 0;
  }

  .deck-agents__name {
    font-family: var(--ls-font-mono, monospace);
    color: var(--ls-text-primary, #e6edf3);
    white-space: nowrap;
  }

  .deck-agents__detail {
    color: var(--ls-text-secondary, #9aa4b2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .deck-agents__ticket {
    background: none;
    border: 1px solid var(--ls-signal-info-dim, rgba(76, 141, 255, 0.3));
    border-radius: var(--ls-radius-sm, 4px);
    color: var(--ls-signal-info, #4c8dff);
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    padding: 0 var(--ls-space-2, 4px);
    cursor: pointer;
    flex: none;
  }

  .deck-agents__session {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.8rem;
  }

  .deck-agents__recent {
    list-style: none;
    margin: 0;
    padding-left: var(--ls-space-4, 8px);
    color: var(--ls-text-secondary, #9aa4b2);
    font-size: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .deck-agents__recent li {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
