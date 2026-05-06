<script lang="ts">
  import { onMount } from 'svelte';

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; containers: string[] };

  const NAMESPACES: { id: string; label: string }[] = [
    { id: 'workspace',            label: 'mentolder (workspace)' },
    { id: 'workspace-korczewski', label: 'korczewski (workspace-korczewski)' },
    { id: 'argocd',               label: 'argocd' },
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

  $: containers = pods.find(p => p.name === selectedPod)?.containers ?? [];
  $: if (containers.length > 0 && !containers.includes(selectedContainer)) {
    selectedContainer = containers[0];
  }

  onMount(fetchPods);
</script>

<div class="space-y-4">
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
</div>
