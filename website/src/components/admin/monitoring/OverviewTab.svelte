<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ navigate: 'cluster' | 'deployments' | 'logs' }>();

  type Pod = { phase: string; ready: boolean; restarts: number };
  type Deployment = { status: 'healthy' | 'degraded' | 'stopped'; name: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };

  let pods: Pod[] = [];
  let nodes: { name: string; cpu: string; memory: string }[] = [];
  let events: KubeEvent[] = [];
  let deployments: Deployment[] = [];
  let loading = true;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchAll() {
    loading = true;
    const [monRes, depRes] = await Promise.allSettled([
      fetch('/api/admin/monitoring'),
      fetch('/api/admin/deployments'),
    ]);
    if (monRes.status === 'fulfilled' && monRes.value.ok) {
      const d = await monRes.value.json();
      pods = d.pods ?? [];
      nodes = d.nodes ?? [];
      events = (d.events ?? []).filter((e: KubeEvent) => e.type === 'Warning').slice(0, 3);
    }
    if (depRes.status === 'fulfilled' && depRes.value.ok) {
      deployments = (await depRes.value.json()).deployments ?? [];
    }
    loading = false;
  }

  onMount(() => {
    fetchAll();
    refreshInterval = setInterval(fetchAll, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));

  $: runningPods = pods.filter(p => p.ready).length;
  $: failedPods = pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown').length;
  $: pendingPods = pods.filter(p => !p.ready && p.phase !== 'Failed').length;
  $: healthyDeps = deployments.filter(d => d.status === 'healthy').length;
  $: firstDegraded = deployments.find(d => d.status !== 'healthy');
  $: avgCpu = nodes.length > 0
    ? Math.round(nodes.reduce((s, n) => s + (parseInt(n.cpu) || 0), 0) / nodes.length)
    : null;
</script>

<div class="space-y-4">
  <!-- 3 status cards -->
  <div class="grid grid-cols-3 gap-3">
    <button on:click={() => dispatch('navigate', 'cluster')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Pods</div>
      <div class="text-2xl font-bold font-mono {failedPods > 0 ? 'text-red-400' : 'text-green-400'}">
        {runningPods}/{pods.length}
      </div>
      <div class="text-xs text-gray-500 mt-1">{pendingPods} pending · {failedPods} failed</div>
    </button>

    <button on:click={() => dispatch('navigate', 'cluster')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Nodes</div>
      <div class="text-2xl font-bold font-mono text-green-400">{nodes.length}/{nodes.length}</div>
      <div class="text-xs text-gray-500 mt-1">{avgCpu != null ? `CPU ⌀${avgCpu}%` : '—'}</div>
    </button>

    <button on:click={() => dispatch('navigate', 'deployments')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors
        {firstDegraded ? 'border-orange-700/50' : ''}">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Deployments</div>
      <div class="text-2xl font-bold font-mono {firstDegraded ? 'text-yellow-400' : 'text-green-400'}">
        {healthyDeps}/{deployments.length}
      </div>
      <div class="text-xs text-gray-500 mt-1 truncate">{firstDegraded ? firstDegraded.name : 'alle healthy'}</div>
    </button>
  </div>

  <!-- Recent warning events -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
    <div class="flex justify-between items-center mb-3">
      <span class="text-sm font-semibold text-gray-200">Letzte Warnings</span>
      <button on:click={() => dispatch('navigate', 'logs')} class="text-xs text-blue-400 hover:text-blue-300">→ Logs</button>
    </div>
    {#if events.length > 0}
      <div class="space-y-2">
        {#each events as evt}
          <div class="flex items-baseline gap-2 text-xs">
            <span class="shrink-0 px-1.5 py-0.5 rounded text-xs bg-orange-900/40 text-orange-400">
              {evt.reason}
            </span>
            <span class="text-gray-300 truncate">{evt.message}</span>
            <span class="text-gray-500 ml-auto shrink-0">{evt.age}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-xs text-gray-500">{loading ? 'Lädt…' : '✓ Keine Warning-Events im workspace-Namespace'}</p>
    {/if}
  </div>
</div>
