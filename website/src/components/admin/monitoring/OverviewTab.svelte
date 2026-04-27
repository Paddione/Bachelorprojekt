<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ navigate: 'cluster' | 'tests' | 'deployments' | 'berichte' }>();

  type Pod = { phase: string; ready: boolean; restarts: number };
  type Deployment = { status: 'healthy' | 'degraded' | 'stopped'; name: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };
  type StalenessFinding = { system: string; status: 'ok' | 'warning' | 'stale'; issue: string };
  type StalenessReport = { issueCount: number; reportJson: { findings: StalenessFinding[]; generated_at: string }; createdAt: string };
  type TestRun = { pass: number; fail: number; skip: number; startedAt: string; durationMs: number | null; tier: string };

  let pods: Pod[] = [];
  let nodes: { name: string; cpu: string; memory: string }[] = [];
  let events: KubeEvent[] = [];
  let deployments: Deployment[] = [];
  let stalenessReport: StalenessReport | null = null;
  let lastTestRun: TestRun | null = null;
  let loading = true;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchAll() {
    loading = true;
    const [monRes, depRes, stalRes, testRes] = await Promise.allSettled([
      fetch('/api/admin/monitoring'),
      fetch('/api/admin/deployments'),
      fetch('/api/admin/staleness-report'),
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
    if (stalRes.status === 'fulfilled' && stalRes.value.ok) {
      stalenessReport = await stalRes.value.json();
    }
    if (testRes.status === 'fulfilled' && testRes.value.ok) {
      const runs = await testRes.value.json();
      lastTestRun = runs[0] ?? null;
    }
    loading = false;
  }

  async function startTests() {
    dispatch('navigate', 'tests');
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
  $: stalenessStatus = stalenessReport
    ? (stalenessReport.issueCount === 0 ? 'OK' : `${stalenessReport.issueCount} Warnungen`)
    : '—';
  $: stalenessColor = stalenessReport?.issueCount === 0 ? 'text-green-400' : 'text-yellow-400';
</script>

<div class="space-y-4">
  <!-- 5 status cards -->
  <div class="grid grid-cols-5 gap-3">
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

    <button on:click={() => dispatch('navigate', 'tests')}
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

    <button on:click={() => dispatch('navigate', 'berichte')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Staleness</div>
      <div class="text-2xl font-bold font-mono {stalenessColor}">{stalenessStatus}</div>
      <div class="text-xs text-gray-500 mt-1">
        {stalenessReport ? new Date(stalenessReport.createdAt).toLocaleDateString('de-DE') : '—'}
      </div>
    </button>
  </div>

  <!-- Middle row -->
  <div class="grid grid-cols-2 gap-3">
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

    <!-- Staleness summary -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">Staleness-Bericht</span>
        <button on:click={() => dispatch('navigate', 'berichte')} class="text-xs text-blue-400 hover:text-blue-300">→ Berichte</button>
      </div>
      {#if stalenessReport?.reportJson?.findings}
        <div class="space-y-1.5">
          {#each stalenessReport.reportJson.findings.slice(0, 4) as f}
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2 h-2 rounded-full shrink-0 {f.status === 'ok' ? 'bg-green-500' : f.status === 'warning' ? 'bg-yellow-400' : 'bg-red-500'}"></span>
              <span class="text-gray-300">{f.system}</span>
              <span class="ml-auto {f.status === 'ok' ? 'text-green-400' : 'text-yellow-400'}">{f.status}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-gray-500">{loading ? 'Lädt…' : 'Kein Bericht'}</p>
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
        <button on:click={() => dispatch('navigate', 'tests')} class="text-xs text-blue-400 hover:text-blue-300">→ Tests</button>
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
