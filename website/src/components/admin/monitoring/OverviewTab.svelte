<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ navigate: 'cluster' | 'tasks' | 'deployments' }>();

  type Pod = { phase: string; ready: boolean; restarts: number };
  type Deployment = { status: 'healthy' | 'degraded' | 'stopped'; name: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };
  type TestRun = { pass: number; fail: number; skip: number; startedAt: string; durationMs: number | null; tier: string };

  let pods: Pod[] = [];
  let nodes: { name: string; cpu: string; memory: string }[] = [];
  let events: KubeEvent[] = [];
  let deployments: Deployment[] = [];
  let lastTestRun: TestRun | null = null;
  let loading = true;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchAll() {
    loading = true;
    const [monRes, depRes, testRes] = await Promise.allSettled([
      fetch('/api/admin/monitoring'),
      fetch('/api/admin/deployments'),
      fetch('/api/admin/test-runs'),
    ]);
    if (monRes.status === 'fulfilled' && monRes.value.ok) {
      const d = await monRes.value.json();
      pods = d.pods ?? [];
      nodes = d.nodes ?? [];
      events = (d.events ?? []).slice(0, 3);
    }
    if (depRes.status === 'fulfilled' && depRes.value.ok) {
      deployments = (await depRes.value.json()).deployments ?? [];
    }
    if (testRes.status === 'fulfilled' && testRes.value.ok) {
      const runs = await testRes.value.json();
      lastTestRun = runs[0] ?? null;
    }
    loading = false;
  }

  async function startTests() {
    dispatch('navigate', 'tasks');
    // Give the tab a moment to mount, then trigger the run
    await fetch('/api/admin/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'prod' }),
    });
  }

  async function regenerateReport() {
    await fetch('/api/admin/tests/report', { method: 'POST' });
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
  <!-- 4 status cards -->
  <div class="grid grid-cols-4 gap-3">
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

    <button on:click={() => dispatch('navigate', 'tasks')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Letzter Testlauf</div>
      {#if lastTestRun}
        <div class="text-2xl font-bold font-mono {lastTestRun.fail > 0 ? 'text-red-400' : 'text-green-400'}">
          {lastTestRun.pass}/{lastTestRun.pass + lastTestRun.fail + lastTestRun.skip}
        </div>
        <div class="text-xs text-gray-500 mt-1">
          {new Date(lastTestRun.startedAt).toLocaleDateString('de-DE')} · {lastTestRun.fail} fail
        </div>
      {:else}
        <div class="text-2xl font-bold font-mono text-gray-500">—</div>
        <div class="text-xs text-gray-500 mt-1">kein Lauf</div>
      {/if}
    </button>

  </div>

  <!-- Middle row -->
  <div class="grid grid-cols-1 gap-3">
    <!-- Recent events -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">Aktuelle Events</span>
        <button on:click={() => dispatch('navigate', 'cluster')} class="text-xs text-blue-400 hover:text-blue-300">→ Cluster</button>
      </div>
      {#if events.length > 0}
        <div class="space-y-2">
          {#each events as evt}
            <div class="flex items-baseline gap-2 text-xs">
              <span class="shrink-0 px-1.5 py-0.5 rounded text-xs {evt.type === 'Warning' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}">
                {evt.type}
              </span>
              <span class="text-gray-300 truncate">{evt.message}</span>
              <span class="text-gray-500 ml-auto shrink-0">{evt.age}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-gray-500">{loading ? 'Lädt…' : 'Keine Events'}</p>
      {/if}
    </div>

  </div>

  <!-- Bottom row -->
  <div class="grid grid-cols-[2fr_1fr] gap-3">
    <!-- Test run summary -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">
          Letzter Testlauf{lastTestRun ? ` — ${lastTestRun.tier} · ${new Date(lastTestRun.startedAt).toLocaleString('de-DE')}` : ''}
        </span>
        <button on:click={() => dispatch('navigate', 'tasks')} class="text-xs text-blue-400 hover:text-blue-300">→ Tasks</button>
      </div>
      {#if lastTestRun}
        <div class="flex gap-2 flex-wrap">
          <span class="text-xs px-2 py-1 bg-gray-900 border border-green-700/50 text-green-400 rounded">✓ {lastTestRun.pass} pass</span>
          <span class="text-xs px-2 py-1 bg-gray-900 border border-red-700/50 text-red-400 rounded">✗ {lastTestRun.fail} fail</span>
          <span class="text-xs px-2 py-1 bg-gray-900 border border-gray-600 text-gray-400 rounded">⊘ {lastTestRun.skip} skip</span>
        </div>
      {:else}
        <p class="text-xs text-gray-500">Noch kein Testlauf vorhanden.</p>
      {/if}
    </div>

    <!-- Quick actions -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="text-sm font-semibold text-gray-200 mb-3">Schnellzugriff</div>
      <div class="space-y-2">
        <button on:click={startTests}
          class="w-full text-sm py-2 bg-green-700 hover:bg-green-600 text-white rounded font-medium">
          ▶ Tests starten
        </button>
        <button on:click={regenerateReport}
          class="w-full text-sm py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
          Bericht generieren
        </button>
      </div>
    </div>
  </div>
</div>
