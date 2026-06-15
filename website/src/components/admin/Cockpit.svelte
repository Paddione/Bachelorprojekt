<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureTickets, TicketRow } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, setLens, setMode, selectFeature, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
  import PortfolioGrid from './PortfolioGrid.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';
  import FeatureWorkbench from './FeatureWorkbench.svelte';
  import TicketDrawer from './TicketDrawer.svelte';

  export let portfolioInitial: PortfolioPayload | null = null;
  export let brand: string;

  let portfolio: PortfolioPayload | null = portfolioInitial;
  let featureData: FeatureTickets | null = null;
  let drawerTicket: TicketRow | null = null;
  let drawerOpen = false;

  onMount(async () => {
    if (typeof window !== 'undefined') initStoreFromUrl(new URL(window.location.href).searchParams);
    if (!portfolio) await loadPortfolio();
  });

  async function loadPortfolio() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/cockpit/portfolio');
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      portfolio = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }

  async function openFeature(extId: string) {
    selectFeature(extId); setLens('werkbank');
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/cockpit/feature?id=${encodeURIComponent(extId)}`);
      if (!res.ok) throw new Error(`feature ${res.status}`);
      featureData = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }

  async function refetchFeature() {
    if (featureData) await openFeature(featureData.feature.extId);
    await loadPortfolio();
  }

  $: allFeatures = portfolio?.products.flatMap(p => p.features) ?? [];
</script>

<div class="cockpit-shell" data-brand={brand}>
  <div class="toolbar">
    <div class="seg" role="group" aria-label="Linse">
      <button class:active={$cockpitStore.lens === 'ueberblick'} on:click={() => setLens('ueberblick')}>Überblick</button>
      <button class:active={$cockpitStore.lens === 'werkbank'} on:click={() => setLens('werkbank')}>Werkbank</button>
    </div>
    <div class="seg" role="group" aria-label="Modus">
      <button class:active={$cockpitStore.mode === 'karten'} on:click={() => setMode('karten')}>Karten</button>
      <button class:active={$cockpitStore.mode === 'tabelle'} on:click={() => setMode('tabelle')}>Tabelle</button>
    </div>
  </div>

  {#if $cockpitStore.error}<div class="toast error">{$cockpitStore.error}</div>{/if}
  {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}

  {#if portfolio && portfolio.products.length === 0}
    <EmptyStateCockpit />
  {:else if portfolio}
    {#if $cockpitStore.mode === 'tabelle'}
      <!-- Table mode wiring added in Stage F (Task 27). -->
      <div data-testid="table-mode-placeholder"></div>
    {:else if $cockpitStore.lens === 'werkbank' && $cockpitStore.currentFeature && featureData}
      <FeatureWorkbench feature={featureData.feature} tickets={featureData.tickets}
        features={allFeatures}
        on:back={() => { selectFeature(null); setLens('ueberblick'); }}
        on:mutated={refetchFeature}
        on:openDrawer={(e) => { drawerTicket = e.detail.ticket; drawerOpen = true; }} />
    {:else}
      <PortfolioGrid {portfolio} onSelectFeature={openFeature}
        onReparent={async (ticketId, newParentId) => {
          await fetch('/api/admin/cockpit/reparent', { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, newParentId }) });
          await loadPortfolio();
        }} />
    {/if}
  {/if}

  <TicketDrawer ticket={drawerTicket} open={drawerOpen}
    onClose={() => (drawerOpen = false)} onMutated={refetchFeature} />
</div>

<style>
  .cockpit-shell { display: flex; flex-direction: column; gap: 1rem; }
  .toolbar { display: flex; gap: 1rem; }
  .seg button { padding: 0.35rem 0.8rem; background: #2a2e37; border: none; color: inherit; cursor: pointer; }
  .seg button.active { background: #6ea8fe; color: #0b0d12; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; }
  .loading { opacity: 0.7; font-size: 0.85rem; }
</style>
