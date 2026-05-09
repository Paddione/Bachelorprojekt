<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type ServiceCheck = { name: string; url: string; status: 'ok' | 'slow' | 'error'; latencyMs: number | null; error?: string };
  type HealthData = { results: Record<string, ServiceCheck[]>; checkedAt: string };

  let data: HealthData | null = null;
  let loading = true;
  let error: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function check() {
    try {
      loading = data === null;
      const res = await fetch('/api/admin/ops/health');
      if (res.ok) { data = await res.json(); error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  onMount(() => { check(); interval = setInterval(check, 30_000); });
  onDestroy(() => clearInterval(interval));

  function ampel(status: string) {
    if (status === 'ok') return { dot: '🟢', cls: 'bg-green-900/30 border-green-800', text: 'text-green-300' };
    if (status === 'slow') return { dot: '🟡', cls: 'bg-yellow-900/30 border-yellow-800', text: 'text-yellow-300' };
    return { dot: '🔴', cls: 'bg-red-900/30 border-red-800', text: 'text-red-300' };
  }

  const CLUSTER_LABELS: Record<string, string> = {
    mentolder: 'mentolder.de',
    korczewski: 'korczewski.de',
  };
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <span class="text-xs text-gray-500">
      {#if data?.checkedAt}Geprüft um {new Date(data.checkedAt).toLocaleTimeString('de-DE')}{/if}
    </span>
    <button on:click={check} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Prüfe…' : '↻ Jetzt prüfen'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  {#if data}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each Object.entries(data.results) as [cluster, services]}
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-gray-200 mb-3">{CLUSTER_LABELS[cluster] ?? cluster}</h3>
          <div class="space-y-2">
            {#each services as svc}
              {@const a = ampel(svc.status)}
              <div class="flex items-center justify-between px-3 py-2 rounded border {a.cls}">
                <span class="text-sm {a.text}">{a.dot} {svc.name}</span>
                <span class="text-xs text-gray-400">
                  {#if svc.latencyMs !== null}{svc.latencyMs} ms{:else}—{/if}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
