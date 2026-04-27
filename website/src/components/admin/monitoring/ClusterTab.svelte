<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; cpu?: string; memory?: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };
  type ClusterNode = { name: string; cpu: string; memory: string };
  type MonitoringData = { pods: Pod[]; events: KubeEvent[]; nodes?: ClusterNode[]; metricsAvailable: boolean; fetchedAt: string };

  let data: MonitoringData | null = null;
  let loading = true;
  let error: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  // Bug ticket modal (same logic as old component)
  let selectedEvent: KubeEvent | null = null;
  let modalDescription = '';
  let modalCategory = 'fehler';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;

  async function fetchData() {
    try {
      loading = true;
      const res = await fetch('/api/admin/monitoring');
      if (res.ok) data = await res.json();
      else error = `Fehler ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function parsePercent(val: string) { return Math.min(parseInt(val, 10) || 0, 100); }

  function podStatusClass(pod: Pod) {
    if (pod.phase === 'Failed' || pod.phase === 'CrashLoopBackOff' || pod.phase === 'Unknown')
      return 'bg-red-900/20 text-red-400';
    if (!pod.ready || pod.phase === 'Pending' || pod.phase === 'ContainerCreating')
      return 'bg-yellow-900/20 text-yellow-400';
    return '';
  }

  function openEventModal(event: KubeEvent) {
    selectedEvent = event;
    modalDescription = `${event.reason} on ${event.object}: ${event.message}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  async function submitTicket() {
    if (!selectedEvent) return;
    modalLoading = true;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const json = await res.json();
      if (!res.ok) { modalError = json.error ?? 'Fehler'; return; }
      modalSuccessId = json.ticketId;
      setTimeout(() => { selectedEvent = null; }, 3000);
    } catch { modalError = 'Netzwerkfehler'; }
    finally { modalLoading = false; }
  }

  onMount(() => {
    fetchData();
    refreshInterval = setInterval(fetchData, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));

  $: runningCount = data?.pods.filter(p => p.ready).length ?? 0;
  $: pendingCount = data?.pods.filter(p => !p.ready && p.phase !== 'Failed').length ?? 0;
  $: failedCount = data?.pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown').length ?? 0;
  $: restartingCount = data?.pods.filter(p => p.restarts > 3).length ?? 0;
</script>

<div class="space-y-5">
  <div class="flex justify-between items-center">
    <span class="text-sm text-gray-400">
      {#if data?.fetchedAt}Aktualisiert: {new Date(data.fetchedAt).toLocaleTimeString('de-DE')}{/if}
    </span>
    <button on:click={fetchData} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  <!-- Node metrics -->
  {#if data?.nodes && data.nodes.length > 0}
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-200 mb-3">Nodes</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each data.nodes as node}
          {@const cpuPct = parsePercent(node.cpu)}
          {@const memPct = parsePercent(node.memory)}
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-gray-400">
              <span class="font-mono">{node.name}</span>
              <span>CPU {node.cpu} · Mem {node.memory}</span>
            </div>
            <div class="h-1.5 bg-gray-700 rounded overflow-hidden">
              <div class="h-full rounded transition-all {cpuPct < 65 ? 'bg-green-500' : cpuPct < 85 ? 'bg-orange-400' : 'bg-red-500'}"
                style="width: {cpuPct}%"></div>
            </div>
            <div class="h-1.5 bg-gray-700 rounded overflow-hidden">
              <div class="h-full rounded transition-all {memPct < 65 ? 'bg-green-500' : memPct < 85 ? 'bg-orange-400' : 'bg-red-500'}"
                style="width: {memPct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Pod summary -->
  <div class="grid grid-cols-4 gap-3">
    {#each [
      { label: 'Running', count: runningCount, color: 'text-green-400' },
      { label: 'Pending', count: pendingCount, color: 'text-yellow-400' },
      { label: 'Restarting', count: restartingCount, color: 'text-orange-400' },
      { label: 'Failed', count: failedCount, color: 'text-red-400' },
    ] as stat}
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
        <div class="text-xl font-bold font-mono {stat.color}">{stat.count}</div>
        <div class="text-xs text-gray-400 mt-1">{stat.label}</div>
      </div>
    {/each}
  </div>

  <!-- Pod table -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="grid grid-cols-[2fr_80px_60px_50px_70px_70px] gap-0 px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
      <span>Pod</span><span>Phase</span><span>Ready</span><span>↺</span><span>CPU</span><span>Mem</span>
    </div>
    {#if data?.pods}
      {#each data.pods as pod}
        <div class="grid grid-cols-[2fr_80px_60px_50px_70px_70px] gap-0 px-3 py-2 border-b border-gray-700/50 text-xs {podStatusClass(pod)} last:border-0">
          <span class="font-mono truncate text-gray-200">{pod.name}</span>
          <span class="{pod.phase === 'Running' ? 'text-green-400' : 'text-yellow-400'}">{pod.phase}</span>
          <span class="{pod.ready ? 'text-green-400' : 'text-red-400'}">{pod.ready ? '✓' : '✗'}</span>
          <span class="{pod.restarts > 3 ? 'text-orange-400' : 'text-gray-400'}">{pod.restarts}</span>
          <span class="text-gray-400">{pod.cpu ?? '—'}</span>
          <span class="text-gray-400">{pod.memory ?? '—'}</span>
        </div>
      {/each}
    {:else if loading}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>

  <!-- Events -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Events (letzte 10)</h3>
    </div>
    {#if data?.events}
      <div class="divide-y divide-gray-700/50">
        {#each data.events as event}
          <div class="grid grid-cols-[70px_100px_1fr_50px_auto] gap-2 px-3 py-2 text-xs items-center
            {event.type === 'Warning' ? 'bg-red-900/10' : ''}">
            <span class="rounded px-1.5 py-0.5 text-center
              {event.type === 'Warning' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}">
              {event.type}
            </span>
            <span class="text-gray-400 font-mono">{event.reason}</span>
            <span class="text-gray-200 truncate">{event.message}</span>
            <span class="text-gray-500 text-right">{event.age}</span>
            <button on:click={() => openEventModal(event)}
              class="text-blue-400 hover:text-blue-300 text-xs">Ticket</button>
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>
</div>

<!-- Bug ticket modal (same as old component) -->
{#if selectedEvent}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-md space-y-3">
      <h3 class="font-semibold text-gray-100">Bug-Ticket erstellen</h3>
      <textarea bind:value={modalDescription} rows={3}
        class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none"></textarea>
      <select bind:value={modalCategory} class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200">
        <option value="fehler">Fehler</option>
        <option value="verbesserung">Verbesserung</option>
      </select>
      {#if modalError}<p class="text-red-400 text-sm">{modalError}</p>{/if}
      {#if modalSuccessId}<p class="text-green-400 text-sm">Ticket {modalSuccessId} erstellt.</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => selectedEvent = null}
          class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={submitTicket} disabled={modalLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {modalLoading ? '…' : 'Erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
