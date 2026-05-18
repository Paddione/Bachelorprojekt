<script lang="ts">
  import { onMount } from 'svelte';

  type Warning = {
    namespace: string;
    type: string;
    reason: string;
    object: string;
    message: string;
    ts: string;
    count: number;
  };

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; containers: string[] };

  // --- mode ---
  type Mode = 'warnings' | 'pod';
  let mode: Mode = 'warnings';

  // --- warnings state ---
  let warnings: Warning[] = [];
  let warningsLoading = false;
  let warningsError: string | null = null;

  async function fetchWarnings() {
    warningsLoading = true;
    warningsError = null;
    try {
      const res = await fetch('/api/admin/cluster/warnings');
      if (res.ok) {
        const j = await res.json();
        warnings = j.warnings ?? [];
      } else {
        const j = await res.json().catch(() => ({}));
        warningsError = j.error ?? `Fehler ${res.status}`;
      }
    } catch (e) {
      warningsError = (e as Error).message;
    } finally {
      warningsLoading = false;
    }
  }

  function formatAge(ts: string): string {
    if (!ts) return '—';
    const ms = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  }

  // --- pod logs state ---
  const NAMESPACES: { id: string; label: string }[] = [
    { id: 'workspace',            label: 'mentolder (workspace)' },
    { id: 'workspace-korczewski', label: 'korczewski (workspace-korczewski)' },
    { id: 'website',              label: 'website (mentolder)' },
    { id: 'website-korczewski',   label: 'website (korczewski)' },
  ];

  let namespace = 'workspace';
  let pods: Pod[] = [];
  let podsLoading = false;
  let podsError: string | null = null;
  let selectedPod = '';
  let selectedContainer = '';
  let tailLines = 200;

  let logs = '';
  let logsLoading = false;
  let logsError: string | null = null;

  async function fetchPods() {
    podsLoading = true;
    podsError = null;
    try {
      const res = await fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(namespace)}`);
      if (res.ok) {
        const j = await res.json();
        pods = j.pods;
        if (!pods.find(p => p.name === selectedPod)) {
          selectedPod = pods[0]?.name ?? '';
          selectedContainer = pods[0]?.containers?.[0] ?? '';
        }
      } else {
        const j = await res.json().catch(() => ({}));
        podsError = j.error ?? `Fehler ${res.status}`;
      }
    } catch (e) {
      podsError = (e as Error).message;
    } finally {
      podsLoading = false;
    }
  }

  async function fetchLogs() {
    if (!selectedPod) return;
    logsLoading = true;
    logsError = null;
    try {
      const params = new URLSearchParams({
        ns: namespace,
        pod: selectedPod,
        tail: String(tailLines),
      });
      if (selectedContainer) params.set('container', selectedContainer);
      const res = await fetch(`/api/admin/cluster/logs?${params}`);
      const txt = await res.text();
      if (res.ok) {
        logs = txt;
      } else {
        logsError = txt || `Fehler ${res.status}`;
        logs = '';
      }
    } catch (e) {
      logsError = (e as Error).message;
    } finally {
      logsLoading = false;
    }
  }

  function switchMode(m: Mode) {
    mode = m;
    if (m === 'warnings' && warnings.length === 0 && !warningsLoading) fetchWarnings();
    if (m === 'pod' && pods.length === 0 && !podsLoading) fetchPods();
  }

  $: containers = pods.find(p => p.name === selectedPod)?.containers ?? [];
  $: if (containers.length > 0 && !containers.includes(selectedContainer)) {
    selectedContainer = containers[0];
  }

  onMount(fetchWarnings);
</script>

<div class="space-y-4">
  <!-- Mode toggle -->
  <div class="flex gap-2">
    <button
      on:click={() => switchMode('warnings')}
      class="px-3 py-1.5 text-xs rounded font-medium transition-colors
        {mode === 'warnings' ? 'bg-orange-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">
      ⚠ Warnings (alle Namespaces)
    </button>
    <button
      on:click={() => switchMode('pod')}
      class="px-3 py-1.5 text-xs rounded font-medium transition-colors
        {mode === 'pod' ? 'bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">
      Pod Logs
    </button>
  </div>

  <!-- Warnings view -->
  {#if mode === 'warnings'}
    <div class="flex justify-between items-center">
      <span class="text-xs text-gray-400">{warnings.length} Warning-Events (letzte 100 pro Namespace)</span>
      <button on:click={fetchWarnings} disabled={warningsLoading}
        class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
        {warningsLoading ? 'Lädt…' : '↻ Aktualisieren'}
      </button>
    </div>

    {#if warningsError}
      <div class="text-sm text-red-400">{warningsError}</div>
    {/if}

    <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div class="grid grid-cols-[80px_150px_200px_1fr_60px_40px] gap-0 px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
        <span>Namespace</span><span>Objekt</span><span>Grund</span><span>Nachricht</span><span>Alter</span><span>#</span>
      </div>
      {#if warningsLoading && warnings.length === 0}
        <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
      {:else if warnings.length === 0}
        <div class="px-3 py-4 text-sm text-green-400 text-center">✓ Keine Warning-Events gefunden</div>
      {:else}
        {#each warnings as w}
          <div class="grid grid-cols-[80px_150px_200px_1fr_60px_40px] gap-0 px-3 py-2 border-b border-gray-700/40 text-xs items-start last:border-0 hover:bg-gray-700/20">
            <span class="font-mono text-gray-400 truncate">{w.namespace.replace('workspace-', '')}</span>
            <span class="font-mono text-orange-300 truncate" title={w.object}>{w.object}</span>
            <span class="text-yellow-400 truncate">{w.reason}</span>
            <span class="text-gray-300 break-words">{w.message}</span>
            <span class="text-gray-500 text-right">{formatAge(w.ts)}</span>
            <span class="text-gray-500 text-right">{w.count}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Pod logs view -->
  {#if mode === 'pod'}
    <!-- Controls -->
    <div class="flex flex-wrap items-end gap-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
      <label class="flex flex-col gap-1 text-xs text-gray-400">
        Namespace
        <select bind:value={namespace} on:change={fetchPods}
          class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-gray-500 min-w-[220px]">
          {#each NAMESPACES as ns}
            <option value={ns.id}>{ns.label}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1 text-xs text-gray-400 flex-1 min-w-[240px]">
        Pod
        <select bind:value={selectedPod} disabled={podsLoading || pods.length === 0}
          class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-xs font-mono focus:outline-none focus:border-gray-500 disabled:opacity-50">
          {#if pods.length === 0}
            <option value="">{podsLoading ? 'Lädt…' : 'Keine Pods'}</option>
          {/if}
          {#each pods as p}
            <option value={p.name}>{p.name} {p.ready ? '' : '(not ready)'}</option>
          {/each}
        </select>
      </label>

      {#if containers.length > 1}
        <label class="flex flex-col gap-1 text-xs text-gray-400">
          Container
          <select bind:value={selectedContainer}
            class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-xs font-mono focus:outline-none focus:border-gray-500">
            {#each containers as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </label>
      {/if}

      <label class="flex flex-col gap-1 text-xs text-gray-400">
        Zeilen
        <select bind:value={tailLines}
          class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-gray-500">
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
      </label>

      <button on:click={fetchLogs} disabled={!selectedPod || logsLoading}
        class="px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50">
        {logsLoading ? 'Lädt…' : 'Logs anzeigen'}
      </button>
    </div>

    {#if podsError}
      <div class="text-sm text-red-400">{podsError}</div>
    {/if}

    <!-- Log viewer -->
    <div class="bg-black border border-gray-700 rounded-lg overflow-hidden">
      <div class="px-3 py-1.5 border-b border-gray-700 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>{selectedPod ? `${namespace}/${selectedPod}${selectedContainer ? '/' + selectedContainer : ''}` : 'Kein Pod gewählt'}</span>
        <span>{logs ? `${logs.split('\n').length} Zeilen` : ''}</span>
      </div>
      <pre class="text-xs text-gray-300 font-mono p-3 overflow-auto max-h-[60vh] whitespace-pre">{logsError ?? logs ?? ''}</pre>
    </div>
  {/if}
</div>
