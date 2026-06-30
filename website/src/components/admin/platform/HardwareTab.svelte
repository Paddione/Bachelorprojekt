<script lang="ts">
  import { onMount } from 'svelte';
  import type { HardwareAsset } from '../../../lib/platform-db';

  export let cluster: string;

  // Enriched server-side with live k8s node status — see GET /api/admin/platform/hardware.
  type EnrichedHardwareAsset = HardwareAsset & { live_status: string; ready_status: string };

  let assets: EnrichedHardwareAsset[] = [];
  let loading = true;
  let error: string | null = null;

  async function loadAssets() {
    loading = true;
    try {
      const res = await fetch('/api/admin/platform/hardware');
      if (!res.ok) throw new Error('Failed to fetch hardware');
      const data = await res.json();
      assets = data.assets;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to fetch hardware';
    } finally {
      loading = false;
    }
  }

  onMount(loadAssets);
</script>

<div class="space-y-6">
  <div>
    <h3 class="text-xl font-bold text-white">Hardware Assets</h3>
    <p class="text-sm text-admin-text-mute">Physische Knoten und Standorte der Infrastruktur.</p>
  </div>

  {#if loading}
    <div class="space-y-3 animate-pulse">
      {#each Array(4) as _}
        <div class="h-16 bg-admin-surface rounded-2xl border border-admin-border"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
      {error}
    </div>
  {:else}
    <div class="bg-admin-surface rounded-2xl border border-admin-border overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-admin-bg/50 border-b border-admin-border">
          <tr>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">Status</th>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">Name</th>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">Rolle</th>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">Standort</th>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">IP / OS</th>
            <th class="px-6 py-4 font-bold text-admin-text-mute uppercase tracking-wider text-[10px]">K8s Node</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-admin-border">
          {#each assets as asset}
            <tr class="hover:bg-admin-primary/5 transition-all">
              <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {asset.live_status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}"></div>
                  <span class="text-[10px] font-bold uppercase {asset.live_status === 'ready' ? 'text-green-500' : 'text-red-500'}">
                    {asset.ready_status}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 font-bold text-white">{asset.name}</td>
              <td class="px-6 py-4">
                <span class="px-2 py-0.5 rounded-lg bg-admin-bg border border-admin-border text-[10px] font-bold text-admin-text-mute">
                  {asset.role}
                </span>
              </td>
              <td class="px-6 py-4 text-admin-text-mute">{asset.location || '—'}</td>
              <td class="px-6 py-4">
                <div class="flex flex-col">
                  <span class="text-xs text-white font-mono">{asset.ip || '—'}</span>
                  <span class="text-[10px] text-admin-text-mute">{asset.os || '—'}</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <code class="text-[10px] bg-admin-bg px-2 py-1 rounded border border-admin-border text-admin-primary">
                  {asset.k8s_node_name}
                </code>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
