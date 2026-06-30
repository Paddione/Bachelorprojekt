<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { levelClassFromText } from '../../../lib/logging/log-format';

  export let cluster: string = 'mentolder';

  const NAMESPACES = [
    { id: 'workspace',            label: 'mentolder (workspace)' },
    { id: 'workspace-korczewski', label: 'korczewski (workspace-korczewski)' },
    { id: 'website',              label: 'website (mentolder)' },
    { id: 'website-korczewski',   label: 'website (korczewski)' },
  ];

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; containers: string[] };

  let ns = cluster === 'korczewski' ? 'workspace-korczewski' : 'workspace';
  let pods: Pod[] = [];
  let selectedPod = '';
  let selectedContainer = '';
  let tail = 200;
  let filter = '';
  let autoScroll = true;

  let lines: string[] = [];
  let streaming = false;
  let podsError: string | null = null;

  let logEl: HTMLElement;
  let es: EventSource | null = null;

  async function loadPods() {
    podsError = null;
    try {
      const res = await fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(ns)}`);
      const j = await res.json();
      if (!res.ok) { podsError = j.error ?? `Fehler ${res.status}`; return; }
      pods = j.pods;
      selectedPod = pods[0]?.name ?? '';
      selectedContainer = pods[0]?.containers?.[0] ?? '';
    } catch (e) { podsError = (e as Error).message; }
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

  $: filteredLines = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  onMount(loadPods);
  onDestroy(stopStream);
</script>

<div class="space-y-4">
  <!-- Controls -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <label class="ctl-label block mb-1">Namespace</label>
      <select bind:value={ns} on:change={loadPods}
        class="field rounded px-2 py-1.5 text-sm">
        {#each NAMESPACES as n}<option value={n.id}>{n.label}</option>{/each}
      </select>
    </div>
    <div>
      <label class="ctl-label block mb-1">Pod</label>
      <select bind:value={selectedPod} class="field rounded px-2 py-1.5 text-sm">
        {#each pods as p}<option value={p.name}>{p.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="ctl-label block mb-1">Container</label>
      <select bind:value={selectedContainer} class="field rounded px-2 py-1.5 text-sm">
        {#each (pods.find(p => p.name === selectedPod)?.containers ?? []) as c}<option value={c}>{c}</option>{/each}
      </select>
    </div>
    <div>
      <label class="ctl-label block mb-1">Letzte Zeilen</label>
      <select bind:value={tail} class="field rounded px-2 py-1.5 text-sm">
        {#each [50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    {#if streaming}
      <button on:click={stopStream} class="btn-danger px-3 py-1.5 text-sm rounded">Stop</button>
    {:else}
      <button on:click={startStream} disabled={!selectedPod}
        class="btn-success px-3 py-1.5 text-sm disabled:opacity-50 rounded">
        Live-Stream starten
      </button>
    {/if}
  </div>

  <!-- Filter + auto-scroll -->
  <div class="flex gap-3 items-center">
    <input bind:value={filter} placeholder="Filter..."
      class="field flex-1 max-w-xs rounded px-3 py-1.5 text-sm" />
    <label class="flex items-center gap-2 text-xs cursor-pointer ctl-label">
      <input type="checkbox" bind:checked={autoScroll} class="rounded" />
      Auto-Scroll
    </label>
    <span class="text-xs count-label">{lines.length} Zeilen</span>
  </div>

  <!-- Log output -->
  <div bind:this={logEl}
    class="log-box rounded-lg p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed">
    {#if lines.length === 0}
      <p class="empty-hint">{streaming ? 'Warte auf Logs...' : 'Stream starten um Logs anzuzeigen.'}</p>
    {/if}
    {#each filteredLines as line}
      <div class="{levelClassFromText(line)} break-all">{line}</div>
    {/each}
  </div>

  {#if podsError}<p class="log-error text-xs">{podsError}</p>{/if}
</div>

<style>
  .ctl-label {
    color: var(--admin-text-mute);
  }
  .count-label {
    color: var(--admin-text-mute);
  }
  .empty-hint {
    color: var(--admin-text-mute);
  }
  .field {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
    color: var(--admin-text);
  }
  .log-box {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
  }
  .btn-danger {
    background: var(--admin-danger);
    color: var(--admin-bg);
    border: none;
  }
  .btn-success {
    background: var(--admin-success);
    color: var(--admin-bg);
    border: none;
  }
  .log-error {
    color: var(--admin-danger);
  }
  .log-warn {
    color: var(--admin-warning);
  }
  .log-info {
    color: var(--admin-success);
  }
</style>
