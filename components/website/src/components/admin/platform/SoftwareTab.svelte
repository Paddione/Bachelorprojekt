<script lang="ts">
  import { onMount } from 'svelte';
  import AssetModal from './AssetModal.svelte';
  import AssetTicketDrawer from './AssetTicketDrawer.svelte';
  import type { SoftwareAsset } from '../../../lib/platform-db';

  export let cluster: string;

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
      const res = await fetch('/sdlc/api/platform/software');
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

<div class="software-rack">
  <!-- Mechatronic Rack Header -->
  <div class="rack-header">
    <div class="rack-title-block">
      <div class="rack-tag-row">
        <span class="rack-tag">PANEL 01 // WORKLOAD REGISTRY</span>
        <span class="rack-title">Software Asset Modul-Schrank</span>
      </div>
      <span class="rack-sub">ORCHESTRIERTE ANWENDUNGEN · DEVMESH POD-CONTROLLERS · K8S WORKLOAD CASSETTES</span>
    </div>

    <button on:click={openCreate} class="rack-btn-add">
      <span class="btn-pin"></span>
      <span>+ MODUL EINSCHIEBEN</span>
    </button>
  </div>

  {#if loading}
    <div class="rack-skeleton">
      {#each Array(6) as _}
        <div class="skeleton-cassette"></div>
      {/each}
    </div>
  {:else if error}
    <div class="rack-fault">
      <span class="fault-badge">FAULT</span>
      <span class="fault-text">{error}</span>
    </div>
  {:else}
    <div class="cassette-grid">
      {#each assets as asset}
        <!-- Modular Pod Cassette Card -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="cassette-module" on:click={() => openEdit(asset)}>
          <!-- Cassette Faceplate Top -->
          <div class="cassette-faceplate">
            <div class="cassette-id-group">
              <span class="cassette-slot-tag">{asset.namespace || 'workspace'}</span>
              <h4 class="cassette-name">{asset.name}</h4>
            </div>

            <div class="cassette-led-block">
              <span class="cassette-status-led {
                asset.live_status === 'ready' ? 'led-ready' :
                asset.live_status === 'degraded' ? 'led-degraded' :
                asset.live_status === 'failing' ? 'led-failing' :
                'led-neutral'
              }"></span>
              <span class="cassette-status-text">{asset.live_status}</span>
            </div>
          </div>

          <!-- Cassette Body Description -->
          <p class="cassette-desc">{asset.description || 'Keine Funktionsbeschreibung hinterlegt.'}</p>

          <!-- Cassette Mechanical Rail Footer -->
          <div class="cassette-rail">
            <div class="replica-bank">
              {#if asset.replicas}
                <div class="replica-pins">
                  {#each Array(asset.replicas.total || 1) as _, i}
                    <span class="replica-pin {i < asset.replicas.ready ? 'pin-active' : 'pin-stale'}"></span>
                  {/each}
                </div>
                <span class="replica-label">{asset.replicas.ready}/{asset.replicas.total} PODS</span>
              {:else}
                <span class="replica-label">1/1 RUNNING</span>
              {/if}
            </div>

            <div class="cassette-actions" on:click|stopPropagation>
              {#if asset.serviceUrl}
                <a
                  href={asset.serviceUrl}
                  target="_blank"
                  rel="noopener"
                  class="action-link"
                  title="Service Ingress aufrufen"
                >
                  INGRESS ↗
                </a>
              {/if}
              <button 
                on:click={() => viewTickets(asset.slug)} 
                class="action-btn"
                title="Wartungs-Tickets"
              >
                TICKETS
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal && selectedAsset}
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

<style>
  .software-rack {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    color: #E6EDF3;
  }

  .rack-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
  }

  .rack-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rack-tag-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .rack-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .rack-title {
    font-size: 16px;
    font-weight: 700;
    color: #FFF;
    letter-spacing: 0.05em;
  }

  .rack-sub {
    font-size: 9.5px;
    color: #8B949E;
    letter-spacing: 0.08em;
  }

  .rack-btn-add {
    background: #161F2E;
    border: 1px solid #2D3A4F;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 11px;
    font-weight: 700;
    color: #58A6FF;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .rack-btn-add:hover {
    border-color: #58A6FF;
    background: #1C273A;
    transform: translateY(-1px);
  }

  .btn-pin {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .cassette-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .cassette-module {
    background: #111722;
    border: 1px solid #1F293D;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: all 0.15s ease;
    position: relative;
  }

  .cassette-module:hover {
    border-color: #58A6FF;
    background: #151D2A;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .cassette-faceplate {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .cassette-id-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cassette-slot-tag {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.06em;
  }

  .cassette-name {
    font-size: 13px;
    font-weight: 700;
    color: #F0F6FC;
  }

  .cassette-led-block {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0B0E14;
    border: 1px solid #232D3F;
    border-radius: 4px;
    padding: 3px 6px;
  }

  .cassette-status-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .led-ready {
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .led-degraded {
    background: #E3B341;
    box-shadow: 0 0 6px #E3B341;
  }

  .led-failing {
    background: #F85149;
    box-shadow: 0 0 6px #F85149;
  }

  .led-neutral {
    background: #8B949E;
  }

  .cassette-status-text {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: #8B949E;
  }

  .cassette-desc {
    font-size: 11px;
    color: #8B949E;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
  }

  .cassette-rail {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 10px;
  }

  .replica-bank {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .replica-pins {
    display: flex;
    gap: 3px;
  }

  .replica-pin {
    width: 4px;
    height: 10px;
    border-radius: 1px;
  }

  .pin-active {
    background: #3FB950;
    box-shadow: 0 0 4px rgba(63, 185, 80, 0.6);
  }

  .pin-stale {
    background: #334155;
  }

  .replica-label {
    font-size: 9.5px;
    color: #8B949E;
    font-weight: 600;
  }

  .cassette-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-link {
    font-size: 9.5px;
    font-weight: 700;
    color: #58A6FF;
    text-decoration: none;
    border: 1px solid rgba(88, 166, 255, 0.3);
    border-radius: 4px;
    padding: 3px 6px;
    transition: all 0.15s ease;
  }

  .action-link:hover {
    background: rgba(88, 166, 255, 0.15);
    border-color: #58A6FF;
  }

  .action-btn {
    font-size: 9.5px;
    font-weight: 600;
    color: #8B949E;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 3px 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    color: #FFF;
    border-color: #475569;
  }

  .rack-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .skeleton-cassette {
    height: 110px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    animation: pulse 1.5s infinite ease-in-out;
  }

  .rack-fault {
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fault-badge {
    background: #F85149;
    color: #FFF;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
  }

  .fault-text {
    font-size: 11px;
    color: #FF7B72;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
