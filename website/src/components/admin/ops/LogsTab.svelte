<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  const NAMESPACES = [
    { id: 'workspace',            label: 'mentolder (workspace)' },
    { id: 'workspace-korczewski', label: 'korczewski (workspace-korczewski)' },
    { id: 'argocd',               label: 'argocd' },
    { id: 'website',              label: 'website (mentolder)' },
    { id: 'website-korczewski',   label: 'website (korczewski)' },
  ];

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; containers: string[] };

  let ns = 'workspace';
  let pods: Pod[] = [];
  let selectedPod = '';
  let selectedContainer = '';
  let tail = 200;
  let filter = '';
  let autoScroll = true;

  let lines: string[] = [];
  let streaming = false;
  let podsLoading = false;
  let podsError: string | null = null;

  let logEl: HTMLElement;
  let es: EventSource | null = null;

  async function loadPods() {
    podsLoading = true; podsError = null;
    try {
      const res = await fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(ns)}`);
      const j = await res.json();
      if (!res.ok) { podsError = j.error ?? `Fehler ${res.status}`; return; }
      pods = j.pods;
      selectedPod = pods[0]?.name ?? '';
      selectedContainer = pods[0]?.containers?.[0] ?? '';
    } catch (e) { podsError = (e as Error).message; }
    finally { podsLoading = false; }
  }

  function startStream() {
    stopStream();
    lines = [];
    streaming = true;
    const params = new URLSearchParams({ ns, pod: selectedPod, tail: String(tail) });
    if (selectedContainer) params.set('container', selectedContainer);
    es = new EventSource(`/api/admin/ops/log-stream/stream?${params}`);
    es.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data._eof) { streaming = false; return; }
        lines = [...lines.slice(-2000), data]; // keep last 2000 lines
        if (autoScroll) { await tick(); logEl?.scrollTo(0, logEl.scrollHeight); }
      } catch {}
    };
    es.onerror = () => { streaming = false; es?.close(); };
  }

  function stopStream() {
    es?.close(); es = null; streaming = false;
  }

  function levelClass(line: string) {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('fatal') || l.includes('err ')) return 'text-red-400';
    if (l.includes('warn')) return 'text-yellow-400';
    return 'text-green-300';
  }

  $: filteredLines = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  onMount(loadPods);
  onDestroy(stopStream);
</script>

<div class="space-y-4">
  <!-- Controls -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Namespace</label>
      <select bind:value={ns} on:change={loadPods}
        class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each NAMESPACES as n}<option value={n.id}>{n.label}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Pod</label>
      <select bind:value={selectedPod} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each pods as p}<option value={p.name}>{p.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Container</label>
      <select bind:value={selectedContainer} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each (pods.find(p => p.name === selectedPod)?.containers ?? []) as c}<option value={c}>{c}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Letzte Zeilen</label>
      <select bind:value={tail} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each [50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    {#if streaming}
      <button on:click={stopStream} class="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded">Stop</button>
    {:else}
      <button on:click={startStream} disabled={!selectedPod}
        class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
        Live-Stream starten
      </button>
    {/if}
  </div>

  <!-- Filter + auto-scroll -->
  <div class="flex gap-3 items-center">
    <input bind:value={filter} placeholder="Filter..."
      class="flex-1 max-w-xs bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" />
    <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={autoScroll} class="rounded" />
      Auto-Scroll
    </label>
    <span class="text-xs text-gray-500">{lines.length} Zeilen</span>
  </div>

  <!-- Log output -->
  <div bind:this={logEl}
    class="bg-gray-950 border border-gray-700 rounded-lg p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed">
    {#if lines.length === 0}
      <p class="text-gray-600">{streaming ? 'Warte auf Logs...' : 'Stream starten um Logs anzuzeigen.'}</p>
    {/if}
    {#each filteredLines as line}
      <div class="{levelClass(line)} break-all">{line}</div>
    {/each}
  </div>

  {#if podsError}<p class="text-red-400 text-xs">{podsError}</p>{/if}
</div>
