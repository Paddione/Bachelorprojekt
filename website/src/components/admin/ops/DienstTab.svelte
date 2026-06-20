<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let cluster: string = 'mentolder';

  type Deployment = { ns: string; nsLabel: string; name: string; desired: number; ready: number; status: string };
  type Action = { type: 'restart' | 'scale'; deployment: Deployment };

  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let pending: Action | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
  let successMsg: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function load() {
    try {
      loading = deployments.length === 0;
      const res = await fetch('/api/admin/ops/deployments/list');
      if (res.ok) { const j = await res.json(); deployments = j.deployments; error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  async function confirm() {
    if (!pending) return;
    actionLoading = true; actionError = null;
    const { type, deployment: d } = pending;
    try {
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/api/admin/ops/deployments/${d.ns}/${d.name}/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const j = await res.json();
      if (!res.ok) { actionError = j.error ?? 'Fehler'; return; }
      successMsg = type === 'restart' ? `${d.name} wird neu gestartet…` : `${d.name} skaliert auf ${scaleTarget}`;
      pending = null;
      setTimeout(() => { successMsg = null; load(); }, 2000);
    } catch { actionError = 'Netzwerkfehler'; }
    finally { actionLoading = false; }
  }

  function statusCls(s: string) {
    if (s === 'healthy') return 'status-healthy';
    if (s === 'degraded') return 'status-degraded';
    return 'status-stopped';
  }
  function statusLabel(s: string) {
    if (s === 'healthy') return '🟢 Läuft';
    if (s === 'degraded') return '🟡 Teils';
    return '⚫ Gestoppt';
  }

  onMount(() => { load(); interval = setInterval(load, 30_000); });
  onDestroy(() => clearInterval(interval));

  $: grouped = deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
    (acc[d.nsLabel] ??= []).push(d); return acc;
  }, {});
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    {#if successMsg}<p class="msg-success text-sm">{successMsg}</p>{:else}<span />{/if}
    <button on:click={load} disabled={loading}
      class="btn-accent px-3 py-1.5 text-sm disabled:opacity-50 rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="msg-error text-sm">{error}</p>{/if}

  {#each Object.entries(grouped) as [label, deps]}
    <div class="group-card rounded-lg p-4">
      <h3 class="text-sm font-semibold mb-3 group-heading">{label}</h3>
      <div class="space-y-2">
        {#each deps as d}
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-mono dep-name">{d.name}</span>
              <span class="ml-3 text-xs {statusCls(d.status)}">{statusLabel(d.status)} ({d.ready}/{d.desired})</span>
            </div>
            <div class="flex gap-2">
              <button on:click={() => { pending = { type: 'restart', deployment: d }; }}
                class="btn-accent px-2 py-1 text-xs rounded">
                Neu starten
              </button>
              <button on:click={() => { pending = { type: 'scale', deployment: d }; scaleTarget = d.desired; }}
                class="btn-neutral px-2 py-1 text-xs rounded">
                Skalieren
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<!-- Confirmation dialog -->
{#if pending}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="dialog-panel rounded-lg p-6 max-w-sm w-full mx-4">
      {#if pending.type === 'restart'}
        <h3 class="text-base font-semibold mb-2 dialog-title">Wirklich neu starten?</h3>
        <p class="text-sm mb-4 dialog-text">
          <span class="font-mono dep-accent">{pending.deployment.name}</span> ({pending.deployment.nsLabel}) wird sofort neu gestartet.
        </p>
      {:else}
        <h3 class="text-base font-semibold mb-2 dialog-title">Replicas anpassen</h3>
        <p class="text-sm mb-3 dialog-text">
          <span class="font-mono dep-accent">{pending.deployment.name}</span> ({pending.deployment.nsLabel})
        </p>
        <input type="number" min="0" max="20" bind:value={scaleTarget}
          class="field w-full rounded px-3 py-2 text-sm mb-4" />
      {/if}
      {#if actionError}<p class="msg-error text-sm mb-3">{actionError}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button on:click={() => pending = null}
          class="btn-ghost px-4 py-2 text-sm">Abbrechen</button>
        <button on:click={confirm} disabled={actionLoading}
          class="btn-accent px-4 py-2 text-sm disabled:opacity-50 rounded">
          {actionLoading ? 'Lädt…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .status-healthy {
    color: var(--admin-success);
  }
  .status-degraded {
    color: var(--admin-warning);
  }
  .status-stopped {
    color: var(--admin-text-mute);
  }
  .msg-success {
    color: var(--admin-success);
  }
  .msg-error {
    color: var(--admin-danger);
  }
  .group-card,
  .dialog-panel {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
  }
  .group-heading {
    color: var(--admin-text);
  }
  .dep-name {
    color: var(--admin-text);
  }
  .dialog-title {
    color: var(--admin-text);
  }
  .dialog-text {
    color: var(--admin-text-mute);
  }
  .dep-accent {
    color: var(--admin-accent);
  }
  .field {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
    color: var(--admin-text);
  }
  .btn-accent {
    background: var(--admin-accent);
    color: var(--admin-bg);
    border: none;
  }
  .btn-neutral {
    background: var(--admin-surface-hover);
    color: var(--admin-text);
    border: none;
  }
  .btn-ghost {
    color: var(--admin-text-mute);
    background: transparent;
    border: none;
  }
  .btn-ghost:hover {
    color: var(--admin-text);
  }
</style>
