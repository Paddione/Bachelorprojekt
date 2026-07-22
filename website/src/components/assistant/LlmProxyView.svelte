<script lang="ts">
  import { onMount } from 'svelte';

  interface BackendState { id: number; name: string; kind: string; enabled: boolean; health: 'ok' | 'unhealthy' | 'disabled' }
  interface ProxyState { proxy: 'online' | 'offline'; backends: BackendState[] }

  let state = $state<ProxyState | null>(null);
  let loading = $state(true);
  let busy = $state(false);

  async function load() {
    try {
      loading = true;
      const res = await fetch('/api/admin/llm-proxy/status', { credentials: 'same-origin' });
      state = res.ok ? ((await res.json()) as ProxyState) : null;
    } finally {
      loading = false;
    }
  }

  async function reload() {
    try { busy = true; await fetch('/api/admin/llm-proxy/reload', { method: 'POST', credentials: 'same-origin' }); await load(); }
    finally { busy = false; }
  }

  async function toggle(b: BackendState) {
    busy = true;
    await fetch(`/api/admin/llm-proxy/backends/${b.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    await load(); busy = false;
  }

  onMount(load);
</script>

<div class="lpv">
  {#if loading}
    <p class="lpv-mute">Status wird geladen…</p>
  {:else if !state || state.proxy === 'offline'}
    <p class="lpv-offline">Proxy offline — Start: <code>task llm:proxy:start</code></p>
  {:else}
    <p class="lpv-status"><span class="lpv-dot lpv-dot--ok"></span> online · {state.backends.length} Backends</p>
    <ul class="lpv-list">
      {#each state.backends as b (b.id)}
        <li>
          <span class="lpv-dot lpv-dot--{b.health}"></span>
          <span class="lpv-name">{b.name}</span>
          <span class="lpv-kind">{b.kind}</span>
          <input type="checkbox" checked={b.enabled} disabled={busy} onchange={() => toggle(b)} />
        </li>
      {/each}
    </ul>
  {/if}
  <div class="lpv-actions">
    <button onclick={reload} disabled={busy}>{busy ? 'Lädt…' : 'Neu proben'}</button>
    <a href="/admin/pipeline?tab=control">Im Steuerung-Tab bearbeiten</a>
  </div>
</div>

<style>
  .lpv { display: flex; flex-direction: column; gap: 12px; padding: 16px 22px; }
  .lpv-offline { color: var(--danger); font-family: var(--mono); font-size: 13px; }
  .lpv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .lpv-list li { display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center; gap: 10px; }
  .lpv-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--mute); }
  .lpv-dot--ok { background: var(--brass); }
  .lpv-dot--unhealthy { background: var(--danger); }
  .lpv-actions { display: flex; gap: 12px; align-items: center; }
  .lpv-actions a { color: var(--brass); font-size: 13px; }
</style>
