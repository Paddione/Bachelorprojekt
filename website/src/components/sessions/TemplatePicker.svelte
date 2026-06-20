<script lang="ts">
  interface SessionTemplate {
    id: string; slug: string; title: string; body_markdown: string;
    is_default: boolean; owner_id: string | null; created_from_template_id: string | null;
  }

  let templates = $state<SessionTemplate[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let cloning = $state<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/sessions/templates', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      templates = Array.isArray(body.templates) ? body.templates : [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  function select(t: SessionTemplate) {
    window.dispatchEvent(new CustomEvent('template:select', { detail: { template: t } }));
  }

  async function clone(t: SessionTemplate) {
    cloning = t.id;
    try {
      const res = await fetch('/api/admin/sessions/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ templateId: t.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'clone failed';
    } finally {
      cloning = null;
    }
  }

  async function remove(t: SessionTemplate) {
    try {
      const res = await fetch(`/api/admin/sessions/templates/${t.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'delete failed';
    }
  }

  $effect(() => { load(); });
</script>

<div class="picker">
  <header><span>Vorlagen</span></header>

  {#if loading}
    <p class="muted">Laedt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else}
    <ul>
      {#each templates as t (t.id)}
        <li>
          <div class="card" onclick={() => select(t)} onkeydown={(e) => e.key === 'Enter' && select(t)} role="button" tabindex="0" aria-label={t.title}>
            <span class="meta">
              <span class="title">{t.title}</span>
              {#if t.is_default}
                <span class="badge">Default</span>
              {/if}
            </span>
            <span class="actions">
              {#if t.is_default}
                <button type="button" class="mini" onclick={(e) => { e.stopPropagation(); clone(t); }} disabled={cloning === t.id}>
                  {cloning === t.id ? '…' : 'Clone'}
                </button>
              {:else}
                <button type="button" class="mini danger" onclick={(e) => { e.stopPropagation(); remove(t); }}>
                  Loeschen
                </button>
              {/if}
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
  header { font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .card { width: 100%; display: flex; align-items: center; gap: 0.6rem; background: #111a29;
    border: 1px solid #243349; border-radius: 8px; padding: 0.6rem 0.7rem; color: inherit;
    cursor: pointer; text-align: left; box-sizing: border-box; }
  .card:hover { border-color: #3a567d; }
  .meta { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
  .title { font-weight: 600; }
  .badge { font-size: 0.7rem; background: #1e3a5f; color: #7ab8ff; padding: 0.1rem 0.4rem;
    border-radius: 4px; }
  .actions { display: flex; gap: 0.3rem; }
  .mini { font-size: 0.8rem; background: none; border: 1px solid #2a3a52; color: inherit;
    border-radius: 4px; cursor: pointer; padding: 0.2rem 0.5rem; }
  .mini.danger { border-color: #5a2a3a; color: #e07090; }
  .muted { color: #7c8aa0; }
</style>
