<script lang="ts">
  interface Session {
    slug: string; type: string; title: string; port: number;
    public_url: string; local_url: string; started_at: string;
  }

  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/sessions', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      sessions = Array.isArray(body.sessions) ? body.sessions : [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  function icon(type: string): string {
    if (type === 'form') return '📋';
    if (type === 'brainstorm') return '🎯';
    return '🧩';
  }

  function host(url: string): string {
    try { return new URL(url).host; } catch { return url; }
  }

  function open(s: Session) {
    window.dispatchEvent(new CustomEvent('mediaviewer:open-session', {
      detail: { url: s.public_url, slug: s.slug, type: s.type },
    }));
  }

  $effect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  });
</script>

<div class="sessions">
  <header>
    <span>Aktive Sessions</span>
    <button class="refresh" type="button" onclick={load} aria-label="Aktualisieren">↺</button>
  </header>

  {#if loading && sessions.length === 0}
    <p class="muted">Lädt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else if sessions.length === 0}
    <p class="muted">(Keine aktiven Sessions)</p>
  {:else}
    <ul>
      {#each sessions as s (s.slug)}
        <li>
          <button type="button" class="card" onclick={() => open(s)} aria-label={s.title}>
            <span class="ic">{icon(s.type)}</span>
            <span class="meta">
              <span class="title">{s.title}</span>
              <span class="sub">{s.type} · {host(s.public_url)}</span>
            </span>
            <span class="go" aria-hidden="true">→</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .sessions { flex: 1; display: flex; flex-direction: column; min-height: 0; color: #cdd6e4; background: #0b111c; padding: 0.75rem; gap: 0.5rem; }
  header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
  .refresh { background: none; border: 1px solid #2a3a52; color: inherit; border-radius: 6px; cursor: pointer; padding: 0.1rem 0.5rem; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; }
  .card { width: 100%; display: flex; align-items: center; gap: 0.6rem; background: #111a29; border: 1px solid #243349; border-radius: 8px; padding: 0.6rem 0.7rem; color: inherit; cursor: pointer; text-align: left; }
  .card:hover { border-color: #3a567d; }
  .ic { font-size: 1.2rem; }
  .meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .sub { font-size: 0.8rem; color: #8aa0bd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { color: #6f8bb0; }
  .muted { color: #7c8aa0; }
</style>
