<script lang="ts">
  import { onMount } from 'svelte';

  interface LoadoutStatus {
    slug: string;
    unit: string;
    port: number;
    active: string;
    sub: string;
    running: boolean;
    enabled: boolean;
    chosen: { ctx: number | null } | null;
  }

  interface LoadoutDocItem {
    slug: string;
    label?: string;
    model?: string;
    port?: number;
    enabled?: boolean;
    exclusiveGroup?: string;
  }

  interface PinStatus {
    pinned: boolean;
    slug?: string;
    pid?: number;
  }

  let statusList = $state<LoadoutStatus[]>([]);
  let models = $state<string[]>([]);
  let pin = $state<PinStatus | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionPending = $state<Record<string, boolean>>({});

  async function load() {
    try {
      loading = true;
      const [stRes, modRes, pinRes] = await Promise.all([
        fetch('/sdlc/api/llm-proxy/loadouts/status', { credentials: 'same-origin' }),
        fetch('/sdlc/api/llm-proxy/models', { credentials: 'same-origin' }),
        fetch('/sdlc/api/llm-proxy/loadouts/pin', { credentials: 'same-origin' }),
      ]);

      if (stRes.ok) {
        const stData = (await stRes.json()) as { status: LoadoutStatus[] };
        statusList = stData.status || [];
      } else {
        const errData = (await stRes.json().catch(() => ({}))) as { error?: { message?: string } };
        error = errData.error?.message ?? `Status HTTP ${stRes.status}`;
      }

      if (modRes.ok) {
        const modData = (await modRes.json()) as { models: string[] };
        models = modData.models || [];
      }

      if (pinRes.ok) {
        pin = (await pinRes.json()) as PinStatus;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loading = false;
    }
  }

  async function pollStatusUntil(slug: string, targetRunning: boolean, maxTries = 30) {
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch('/sdlc/api/llm-proxy/loadouts/status', { credentials: 'same-origin' });
        if (!res.ok) continue;
        const data = (await res.json()) as { status: LoadoutStatus[] };
        statusList = data.status || [];
        const item = statusList.find((l) => l.slug === slug);
        if (item && item.running === targetRunning) {
          break;
        }
      } catch {
        // ignore polling errors
      }
    }
  }

  async function triggerAction(slug: string, action: 'start' | 'stop') {
    try {
      actionPending[slug] = true;
      error = null;
      const res = await fetch(`/sdlc/api/llm-proxy/loadouts/${slug}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        error = errData.error?.message ?? `Aktion fehlgeschlagen (HTTP ${res.status})`;
      } else {
        await pollStatusUntil(slug, action === 'start');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Aktion fehlgeschlagen';
    } finally {
      actionPending[slug] = false;
      await load();
    }
  }

  onMount(load);
</script>

<div class="llm-loadout-panel">
  <div class="ll-header">
    <h3>Loadouts & GPU-Modelle</h3>
    <button class="ff-pill ff-pill--ghost" onclick={load} disabled={loading}>
      {loading ? 'Laden…' : 'Aktualisieren'}
    </button>
  </div>

  {#if pin?.pinned}
    <div class="ll-pin-banner">
      Angepinntes Loadout: <strong>{pin.slug}</strong> (PID {pin.pid})
    </div>
  {/if}

  {#if error}
    <div class="ll-error">{error}</div>
  {/if}

  {#if loading && statusList.length === 0}
    <div class="ll-loading">Loadouts werden geladen…</div>
  {:else}
    <table class="ll-table">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Port</th>
          <th>Zustand</th>
          <th>Kontext (Ctx)</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each statusList as l (l.slug)}
          <tr>
            <td>
              <strong>{l.slug}</strong>
              {#if !l.enabled}
                <span class="ll-badge ll-badge--disabled">deaktiviert</span>
              {/if}
            </td>
            <td><code>:{l.port}</code></td>
            <td>
              {#if l.running}
                <span class="ll-badge ll-badge--ok">aktiv ({l.sub || 'running'})</span>
              {:else}
                <span class="ll-badge ll-badge--mute">{l.active || 'inaktiv'}</span>
              {/if}
            </td>
            <td>{l.chosen?.ctx ? `${l.chosen.ctx} Tokens` : '—'}</td>
            <td>
              {#if l.running}
                <button
                  class="ff-pill ff-pill--danger"
                  onclick={() => triggerAction(l.slug, 'stop')}
                  disabled={actionPending[l.slug]}
                >
                  {actionPending[l.slug] ? 'Stoppe…' : 'Stoppen'}
                </button>
              {:else}
                <button
                  class="ff-pill"
                  onclick={() => triggerAction(l.slug, 'start')}
                  disabled={actionPending[l.slug] || !l.enabled}
                >
                  {actionPending[l.slug] ? 'Starte…' : 'Starten'}
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if models.length > 0}
      <div class="ll-models">
        <h4>Verfügbare Modelldateien ({models.length})</h4>
        <div class="ll-models-list">
          {#each models as m}
            <span class="ll-model-tag">{m}</span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .llm-loadout-panel {
    background: var(--ink-850);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .ll-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ll-pin-banner {
    background: var(--ink-800);
    border-left: 3px solid var(--accent, #6366f1);
    padding: 0.5rem 1rem;
    font-size: 13px;
  }
  .ll-error {
    color: var(--danger);
    font-size: 13px;
  }
  .ll-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .ll-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }
  .ll-badge--ok {
    background: rgba(34, 197, 94, 0.15);
    color: var(--success, #22c55e);
  }
  .ll-badge--disabled {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger, #ef4444);
    margin-left: 0.5rem;
  }
  .ll-badge--mute {
    background: var(--ink-800);
    color: var(--text-muted, #707b8a);
  }
  .ll-models {
    margin-top: 0.5rem;
  }
  .ll-models-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }
  .ll-model-tag {
    font-family: var(--mono);
    font-size: 11px;
    background: var(--ink-800);
    padding: 2px 6px;
    border-radius: 4px;
  }
</style>
