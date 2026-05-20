<script lang="ts">
  import { onMount } from 'svelte';
  
  export let cluster: string;
  
  let data: any = null;
  let loading = true;
  let error: string | null = null;
  let syncing: string | null = null;
  
  async function fetchFlux() {
    try {
      const r = await fetch('/api/admin/platform/status');
      if (!r.ok) throw new Error('Status fetch failed');
      data = await r.json();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
  
  async function triggerSync(name: string, namespace: string) {
    syncing = name;
    try {
      const r = await fetch('/api/admin/platform/sync', {
        method: 'POST',
        body: JSON.stringify({ name, namespace })
      });
      if (!r.ok) throw new Error('Sync failed');
      setTimeout(fetchFlux, 2000); // Wait a bit for reconciliation to start
    } catch (e: any) {
      alert(e.message);
    } finally {
      syncing = null;
    }
  }
  
  onMount(fetchFlux);
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-white">GitOps Pipeline (FluxCD)</h3>
    <button on:click={fetchFlux} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
  </div>

  {#if loading}
    <div class="animate-pulse space-y-4">
      <div class="h-24 bg-admin-surface rounded-xl"></div>
      <div class="h-24 bg-admin-surface rounded-xl"></div>
    </div>
  {:else if cluster !== 'mentolder'}
    <div class="p-8 text-center bg-admin-surface rounded-2xl border border-dashed border-admin-border">
      <p class="text-admin-text-mute italic">FluxCD Management läuft primär auf dem Mentolder Cluster.</p>
    </div>
  {:else if error || (data && data.flux.error)}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
      {error || data.flux.error}
    </div>
  {:else if data}
    <div class="grid grid-cols-1 gap-4">
      {#each data.flux.kustomizations as ks}
        <div class="admin-card flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="p-3 rounded-xl bg-admin-surface border border-admin-border">
              <svg class="w-6 h-6 {ks.status === 'ready' ? 'text-green-500' : 'text-red-500'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div>
              <h4 class="font-bold text-white">{ks.name}</h4>
              <p class="text-xs text-admin-text-mute">{ks.namespace} · {ks.lastAttempt || 'Never'}</p>
              {#if ks.message}
                <p class="text-[10px] text-red-400 mt-1 truncate max-w-md">{ks.message}</p>
              {/if}
            </div>
          </div>
          
          <button 
            on:click={() => triggerSync(ks.name, ks.namespace)}
            disabled={syncing === ks.name}
            class="px-4 py-2 rounded-lg bg-admin-primary/10 border border-admin-primary/20 text-admin-primary text-xs font-bold hover:bg-admin-primary/20 disabled:opacity-50 transition-all"
          >
            {syncing === ks.name ? 'Syncing...' : 'Reconcile'}
          </button>
        </div>
      {/each}
    </div>

    {#if data.flux.imagePolicies.length > 0}
      <h4 class="text-sm font-bold text-admin-text-disabled uppercase tracking-widest mt-8">Image Updates</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each data.flux.imagePolicies as ip}
          <div class="p-4 rounded-xl bg-admin-surface border border-admin-border">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-white">{ip.name}</span>
              <div class="w-2 h-2 rounded-full {ip.status === 'ready' ? 'bg-green-500' : 'bg-red-500'}"></div>
            </div>
            <p class="text-[10px] font-mono text-admin-text-mute truncate">{ip.latestImage || 'No image found'}</p>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
