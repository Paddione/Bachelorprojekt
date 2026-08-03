<script lang="ts">
  import { onMount } from 'svelte';

  interface DiscoveredModel { id: string; loaded?: boolean }
  interface BackendState {
    id: number; name: string; kind: string; base_url: string;
    enabled: boolean; priority: number; health: 'ok' | 'unhealthy' | 'disabled';
    fixups: string[]; models: DiscoveredModel[];
  }
  interface ProxyState {
    proxy: 'online' | 'offline';
    port?: number; uptimeSec?: number; version?: string;
    backends: BackendState[];
  }
  interface ModelSlot { phase: string; provider: string; modelId: string; baseUrl: string | null }

  const KINDS = ['llamacpp', 'lmstudio', 'openai-remote'] as const;

  let state = $state<ProxyState | null>(null);
  let slots = $state<ModelSlot[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let probing = $state(false);
  let expanded = $state<Record<number, boolean>>({});

  // Inline create/edit form (FactoryModelSlots-Muster — kein Drawer).
  let editId = $state<number | null>(null);
  let form = $state(blankForm());

  function blankForm() {
    return { name: '', kind: 'llamacpp' as string, base_url: '', api_key_env: '', priority: 10, enabled: true };
  }

  const isOffline = $derived(state?.proxy === 'offline');

  async function load() {
    try {
      loading = true;
      const [stRes, slotRes] = await Promise.all([
        fetch('/api/admin/llm-proxy/status', { credentials: 'same-origin' }),
        fetch('/api/factory-model-slots', { credentials: 'same-origin' }),
      ]);
      if (!stRes.ok) throw new Error(`HTTP ${stRes.status}`);
      state = (await stRes.json()) as ProxyState;
      if (slotRes.ok) slots = (await slotRes.json()).slots ?? [];
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loading = false;
    }
  }

  async function probe() {
    try {
      probing = true;
      await fetch('/api/admin/llm-proxy/reload', { method: 'POST', credentials: 'same-origin' });
      await load();
    } finally {
      probing = false;
    }
  }

  async function patchBackend(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/llm-proxy/backends/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { error = `Update fehlgeschlagen (HTTP ${res.status})`; return; }
    await load();
  }

  function toggleEnabled(b: BackendState) { patchBackend(b.id, { enabled: !b.enabled }); }
  function bump(b: BackendState, delta: number) { patchBackend(b.id, { priority: Math.max(0, b.priority + delta) }); }

  async function saveForm() {
    const url = editId ? `/api/admin/llm-proxy/backends/${editId}` : '/api/admin/llm-proxy/backends';
    const res = await fetch(url, {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, api_key_env: form.api_key_env.trim() || null }),
    });
    if (!res.ok) { error = `Speichern fehlgeschlagen (HTTP ${res.status})`; return; }
    editId = null; form = blankForm();
    await load();
  }

  function startEdit(b: BackendState) {
    editId = b.id;
    form = { name: b.name, kind: b.kind, base_url: b.base_url, api_key_env: '', priority: b.priority, enabled: b.enabled };
  }

  // Effektive Auflösung: pro Factory-Phase das Modell, das der Proxy JETZT bedienen würde.
  function resolvePhase(slot: ModelSlot): { served: string; fallback: boolean; backend: string } {
    const healthy = (state?.backends ?? [])
      .filter((b) => b.enabled && b.health === 'ok')
      .sort((a, b) => a.priority - b.priority);
    for (const b of healthy) {
      if (b.models.some((m) => m.id === slot.modelId)) return { served: slot.modelId, fallback: false, backend: b.name };
    }
    const top = healthy[0];
    if (top && top.models[0]) return { served: top.models[0].id, fallback: true, backend: top.name };
    return { served: '—', fallback: false, backend: '—' };
  }

  onMount(load);
</script>

<div class="llm-proxy-panel">
  <div class="lp-header">
    <h3>LLM-Proxy</h3>
    <button class="ff-pill ff-pill--ghost" onclick={probe} disabled={probing}>
      {probing ? 'Probe läuft…' : 'Jetzt proben'}
    </button>
  </div>

  {#if loading}
    <div class="lp-loading">Status wird geladen…</div>
  {:else if error && !state}
    <div class="lp-error"><p>{error}</p><button class="ff-pill ff-pill--ghost" onclick={load}>Erneut</button></div>
  {:else if state}
    {#if isOffline}
      <div class="lp-offline">Proxy offline — Start: <code>task llm:proxy:start</code></div>
    {:else}
      <div class="lp-status">
        <span class="lp-dot lp-dot--ok"></span> online · Port {state.port ?? '—'} ·
        Uptime {state.uptimeSec ? `${Math.floor(state.uptimeSec / 60)}m` : '—'} · v{state.version ?? '—'}
      </div>
    {/if}

    <table class="lp-table">
      <thead><tr><th>Name</th><th>Kind</th><th>URL</th><th>Health</th><th>Prio</th><th>An</th><th></th></tr></thead>
      <tbody>
        {#each state.backends as b (b.id)}
          <tr>
            <td>{b.name}</td>
            <td>{b.kind}</td>
            <td class="lp-url">{b.base_url}</td>
            <td><span class="lp-badge lp-badge--{b.health}">{b.health}</span></td>
            <td class="lp-prio">
              {b.priority}
              <button aria-label="höher" onclick={() => bump(b, -1)} disabled={isOffline}>↑</button>
              <button aria-label="niedriger" onclick={() => bump(b, 1)} disabled={isOffline}>↓</button>
            </td>
            <td><input type="checkbox" checked={b.enabled} onchange={() => toggleEnabled(b)} /></td>
            <td>
              <button class="ff-pill ff-pill--ghost" onclick={() => (expanded[b.id] = !expanded[b.id])}>Modelle</button>
              <button class="ff-pill ff-pill--ghost" onclick={() => startEdit(b)}>Bearbeiten</button>
            </td>
          </tr>
          {#if expanded[b.id]}
            <tr class="lp-models-row"><td colspan="7">
              {#if b.models.length === 0}
                <span class="lp-mute">keine Modelle entdeckt</span>
              {:else}
                {#each b.models as m}
                  <span class="lp-model">{m.id}{#if m.loaded}<span class="lp-badge lp-badge--ok">loaded</span>{/if}</span>
                {/each}
              {/if}
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>

    <div class="lp-form">
      <h4>{editId ? 'Backend bearbeiten' : 'Backend anlegen'}</h4>
      <input placeholder="Name" bind:value={form.name} />
      <select bind:value={form.kind}>{#each KINDS as k}<option value={k}>{k}</option>{/each}</select>
      <input placeholder="Base URL" bind:value={form.base_url} />
      <input placeholder="API-Key-Env-Name (optional)" bind:value={form.api_key_env} />
      <input type="number" min="0" bind:value={form.priority} />
      <label><input type="checkbox" bind:checked={form.enabled} /> enabled</label>
      <button class="ff-pill" onclick={saveForm}>{editId ? 'Speichern' : 'Anlegen'}</button>
      {#if editId}<button class="ff-pill ff-pill--ghost" onclick={() => { editId = null; form = blankForm(); }}>Abbrechen</button>{/if}
    </div>

    <div class="lp-resolution">
      <h4>Effektive Auflösung pro Phase</h4>
      {#each slots as slot (slot.phase)}
        {@const r = resolvePhase(slot)}
        <div class="lp-res-row">
          <span class="lp-phase">{slot.phase}</span>
          <span>{r.served} <span class="lp-mute">@ {r.backend}</span></span>
          {#if r.fallback}<span class="lp-fallback">→ Fallback auf {r.served}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .llm-proxy-panel { background: var(--ink-850); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .lp-header { display: flex; align-items: center; justify-content: space-between; }
  .lp-offline { color: var(--danger); font-family: var(--mono); font-size: 13px; }
  .lp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .lp-badge--unhealthy { color: var(--danger); }
  .lp-fallback { color: var(--brass); font-size: 12px; }
</style>
