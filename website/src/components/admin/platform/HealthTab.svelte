<script lang="ts">
  import { onMount } from 'svelte';
  
  export let cluster: string;
  
  let data: any = null;
  let loading = true;
  let error: string | null = null;
  
  async function fetchHealth() {
    try {
      const r = await fetch('/api/admin/ops/health');
      if (!r.ok) throw new Error('Health fetch failed');
      data = await r.json();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
  
  onMount(fetchHealth);
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-white">System-Integrität</h3>
    <button on:click={fetchHealth} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
  </div>

  {#if loading}
    <div class="animate-pulse space-y-4">
      <div class="h-12 bg-admin-surface rounded-xl"></div>
      <div class="h-12 bg-admin-surface rounded-xl"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
      {error}
    </div>
  {:else if data}
    {#each Object.entries(data.results) as [cName, results]}
      <div class="admin-card">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-2 h-2 rounded-full {cName === cluster ? 'bg-green-500' : 'bg-blue-500'}"></div>
          <h4 class="font-bold uppercase tracking-wider text-xs text-admin-text-mute">{cName} Cluster</h4>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each results as svc}
            <div class="p-3 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between">
              <span class="text-sm font-medium">{svc.name}</span>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-admin-text-disabled">{svc.latencyMs ?? '?'}ms</span>
                <div class="w-2 h-2 rounded-full {svc.status === 'ok' ? 'bg-green-500' : svc.status === 'slow' ? 'bg-yellow-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
