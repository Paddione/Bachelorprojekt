<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Deployment = { name: string; desired: number; ready: number; available: number; status: 'healthy' | 'degraded' | 'stopped' };
  type DeploymentAction = { type: 'restart' | 'scale'; deployment: Deployment };

  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let pendingAction: DeploymentAction | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchDeployments() {
    try {
      loading = true;
      const res = await fetch('/api/admin/deployments');
      if (res.ok) {
        const json = await res.json();
        deployments = json.deployments ?? [];
      } else {
        error = `Fehler ${res.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function openAction(action: DeploymentAction) {
    pendingAction = action;
    scaleTarget = action.type === 'scale' ? action.deployment.desired : 1;
    actionError = null;
  }

  async function confirmAction() {
    if (!pendingAction) return;
    actionLoading = true;
    actionError = null;
    try {
      const { type, deployment } = pendingAction;
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/api/admin/deployments/${deployment.name}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const json = await res.json();
      if (!res.ok) { actionError = json.error ?? 'Fehler'; return; }
      pendingAction = null;
      setTimeout(fetchDeployments, 1000);
    } catch { actionError = 'Netzwerkfehler'; }
    finally { actionLoading = false; }
  }

  function statusClass(status: Deployment['status']) {
    if (status === 'healthy') return 'bg-green-900/40 text-green-400';
    if (status === 'degraded') return 'bg-orange-900/40 text-orange-400';
    return 'bg-yellow-900/40 text-yellow-400';
  }

  onMount(() => {
    fetchDeployments();
    refreshInterval = setInterval(fetchDeployments, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    <h2 class="text-sm font-semibold text-gray-200">Deployments</h2>
    <button on:click={fetchDeployments} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="grid grid-cols-[2fr_80px_80px_110px_130px] gap-0 px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
      <span>Deployment</span><span>Desired</span><span>Ready</span><span>Status</span><span>Aktionen</span>
    </div>
    {#each deployments as dep}
      <div class="grid grid-cols-[2fr_80px_80px_110px_130px] gap-0 px-3 py-2.5 border-b border-gray-700/50 text-sm items-center last:border-0
        {dep.status === 'degraded' ? 'bg-orange-900/10' : dep.status === 'stopped' ? 'bg-yellow-900/10' : ''}">
        <span class="font-mono text-gray-200 text-xs">{dep.name}</span>
        <span class="text-gray-400 text-xs">{dep.desired}</span>
        <span class="text-xs {dep.ready === dep.desired ? 'text-green-400' : 'text-red-400'}">{dep.ready}/{dep.desired}</span>
        <span class="text-xs px-2 py-0.5 rounded-full inline-block {statusClass(dep.status)}">{dep.status}</span>
        <div class="flex gap-2">
          <button on:click={() => openAction({ type: 'restart', deployment: dep })}
            class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">↺ Restart</button>
          <button on:click={() => openAction({ type: 'scale', deployment: dep })}
            class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">⤢ Scale</button>
        </div>
      </div>
    {/each}
    {#if loading && deployments.length === 0}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>
</div>

<!-- Action confirmation modal -->
{#if pendingAction}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-sm space-y-3">
      {#if pendingAction.type === 'restart'}
        <h3 class="font-semibold text-gray-100">Restart {pendingAction.deployment.name}?</h3>
        <p class="text-sm text-gray-400">Rolling restart — kurze Unterbrechung möglich.</p>
      {:else}
        <h3 class="font-semibold text-gray-100">Scale {pendingAction.deployment.name}</h3>
        <div class="flex items-center gap-3">
          <label class="text-sm text-gray-400">Replicas:</label>
          <input type="number" bind:value={scaleTarget} min={0} max={10}
            class="w-20 bg-gray-900 border border-gray-600 rounded p-1.5 text-sm text-gray-200 text-center" />
        </div>
      {/if}
      {#if actionError}<p class="text-red-400 text-sm">{actionError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => pendingAction = null}
          class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={confirmAction} disabled={actionLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {actionLoading ? '…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  </div>
{/if}
