<script lang="ts">
  import { onMount } from 'svelte';
  import AssetModal from './AssetModal.svelte';
  import AssetTicketDrawer from './AssetTicketDrawer.svelte';
  import type { SoftwareAsset } from '../../../lib/platform-db';

  export let cluster: string;

  // Enriched server-side with live k8s status — see GET /api/admin/platform/software.
  type EnrichedAsset = SoftwareAsset & {
    live_status: string;
    replicas: { ready: number; total: number };
    serviceUrl: string | null;
  };

  type EditableAsset = Partial<EnrichedAsset> & { clusters: string[] };

  let assets: EnrichedAsset[] = [];
  let loading = true;
  let error: string | null = null;
  let showModal = false;
  let selectedAsset: EditableAsset | null = null;
  let showTickets = false;
  let ticketSlug = '';

  async function loadAssets() {
    loading = true;
    try {
      const res = await fetch('/api/admin/platform/software');
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      assets = data.assets;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to fetch assets';
    } finally {
      loading = false;
    }
  }

  function openEdit(asset: EnrichedAsset) {
    selectedAsset = { ...asset };
    showModal = true;
  }

  function openCreate() {
    selectedAsset = {
      slug: '',
      name: '',
      description: '',
      category: 'other',
      emoji: '📦',
      clusters: [cluster],
      namespace: 'workspace',
      deployment_name: '',
      image_tag: ':latest',
      url: '',
      base_status: 'live',
      sort_order: 0
    };
    showModal = true;
  }

  function viewTickets(slug: string) {
    ticketSlug = slug;
    showTickets = true;
  }

  onMount(loadAssets);
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <div>
      <h3 class="text-xl font-bold text-white">Software Assets</h3>
      <p class="text-sm text-admin-text-mute">Verwaltung und Status der deployten Komponenten.</p>
    </div>
    <button 
      on:click={openCreate}
      class="px-4 py-2 bg-admin-primary text-admin-bg rounded-xl font-bold text-sm hover:scale-105 transition-all"
    >
      + Asset hinzufügen
    </button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {#each Array(6) as _}
        <div class="h-32 bg-admin-surface rounded-2xl border border-admin-border"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
      {error}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each assets as asset}
        <div class="admin-card group relative hover:border-admin-primary/50 transition-all">
          <div class="flex items-start gap-4">
            <div class="text-3xl bg-admin-bg/50 p-3 rounded-2xl border border-admin-border">
              {asset.emoji}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h4 class="font-bold text-white truncate">{asset.name}</h4>
                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider {
                  asset.live_status === 'ready'         ? 'bg-green-500/10 text-green-500'  :
                  asset.live_status === 'degraded'      ? 'bg-yellow-500/10 text-yellow-500':
                  asset.live_status === 'other-cluster' ? 'bg-blue-500/10 text-blue-400'   :
                  asset.live_status === 'optional'      ? 'bg-gray-500/10 text-gray-400'   :
                  asset.live_status === 'unknown'       ? 'bg-gray-500/10 text-gray-500'   :
                  asset.live_status === 'no-access'     ? 'bg-purple-500/10 text-purple-400':
                  asset.live_status === 'failing'       ? 'bg-red-500/10 text-red-400'     :
                                                          'bg-orange-500/10 text-orange-400'}">
                  {asset.live_status === 'other-cluster' ? '↗ remote' : asset.live_status === 'no-access' ? '⊘ no-access' : asset.live_status}
                </span>
              </div>
              <p class="text-xs text-admin-text-mute line-clamp-2 mb-3">{asset.description || 'Keine Beschreibung.'}</p>
              
              <div class="flex items-center gap-3">
                <div class="flex -space-x-1">
                  {#each asset.clusters as c}
                    <div class="w-4 h-4 rounded-full border border-admin-bg text-[6px] flex items-center justify-center font-bold {c === 'mentolder' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}" title={c}>
                      {c[0].toUpperCase()}
                    </div>
                  {/each}
                </div>
                {#if asset.replicas}
                  <span class="text-[10px] text-admin-text-mute font-mono">
                    {asset.replicas.ready}/{asset.replicas.total} pods
                  </span>
                {/if}
                {#if asset.serviceUrl}
                  <a
                    href={asset.serviceUrl}
                    target="_blank"
                    rel="noopener"
                    class="text-[10px] font-bold text-admin-primary hover:underline"
                    on:click|stopPropagation
                  >
                    Öffnen ↗
                  </a>
                {/if}
              </div>
            </div>
          </div>

          <div class="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button on:click={() => viewTickets(asset.slug)} class="p-1.5 rounded-lg bg-admin-bg border border-admin-border text-admin-text-mute hover:text-white hover:border-admin-primary/30" title="Tickets">
              🎫
            </button>
            <button on:click={() => openEdit(asset)} class="p-1.5 rounded-lg bg-admin-bg border border-admin-border text-admin-text-mute hover:text-white hover:border-admin-primary/30" title="Bearbeiten">
              ✏️
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <AssetModal 
    asset={selectedAsset} 
    on:close={() => showModal = false} 
    on:save={() => { showModal = false; loadAssets(); }}
  />
{/if}

{#if showTickets}
  <AssetTicketDrawer 
    slug={ticketSlug} 
    on:close={() => showTickets = false} 
  />
{/if}
