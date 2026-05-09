<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

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
    if (s === 'healthy') return 'text-green-400';
    if (s === 'degraded') return 'text-yellow-400';
    return 'text-gray-500';
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
    {#if successMsg}<p class="text-green-400 text-sm">{successMsg}</p>{:else}<span />{/if}
    <button on:click={load} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  {#each Object.entries(grouped) as [label, deps]}
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-200 mb-3">{label}</h3>
      <div class="space-y-2">
        {#each deps as d}
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm text-gray-200 font-mono">{d.name}</span>
              <span class="ml-3 text-xs {statusCls(d.status)}">{statusLabel(d.status)} ({d.ready}/{d.desired})</span>
            </div>
            <div class="flex gap-2">
              <button on:click={() => { pending = { type: 'restart', deployment: d }; }}
                class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded">
                Neu starten
              </button>
              <button on:click={() => { pending = { type: 'scale', deployment: d }; scaleTarget = d.desired; }}
                class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded">
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
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-sm w-full mx-4">
      {#if pending.type === 'restart'}
        <h3 class="text-base font-semibold text-white mb-2">Wirklich neu starten?</h3>
        <p class="text-sm text-gray-300 mb-4">
          <span class="font-mono text-blue-300">{pending.deployment.name}</span> ({pending.deployment.nsLabel}) wird sofort neu gestartet.
        </p>
      {:else}
        <h3 class="text-base font-semibold text-white mb-2">Replicas anpassen</h3>
        <p class="text-sm text-gray-300 mb-3">
          <span class="font-mono text-blue-300">{pending.deployment.name}</span> ({pending.deployment.nsLabel})
        </p>
        <input type="number" min="0" max="20" bind:value={scaleTarget}
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-4" />
      {/if}
      {#if actionError}<p class="text-red-400 text-sm mb-3">{actionError}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button on:click={() => pending = null}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white">Abbrechen</button>
        <button on:click={confirm} disabled={actionLoading}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {actionLoading ? 'Lädt…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  </div>
{/if}
