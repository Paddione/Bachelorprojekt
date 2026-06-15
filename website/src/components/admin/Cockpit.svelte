<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureTickets, TicketRow } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, setLens, setMode, selectFeature, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
  import PortfolioGrid from './PortfolioGrid.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';
  import FeatureWorkbench from './FeatureWorkbench.svelte';
  import TicketDrawer from './TicketDrawer.svelte';
  import TicketsTab from './TicketsTab.svelte';

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
      <TicketsTab />
    {:else if $cockpitStore.lens === 'werkbank' && $cockpitStore.currentFeature && featureData}
      <FeatureWorkbench feature={featureData.feature} tickets={featureData.tickets}
        features={allFeatures}
        onBack={() => { selectFeature(null); setLens('ueberblick'); }}
        onMutated={refetchFeature}
        onOpenDrawer={(d) => { drawerTicket = d.ticket; drawerOpen = true; }} />
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
  .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .seg { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid #2a2e37; }
  .seg button { padding: 0.4rem 0.9rem; background: transparent; border: none; color: #9ca3af; cursor: pointer;
    font-size: 0.82rem; transition: all 0.15s ease; position: relative; }
  .seg button:hover:not(.active) { color: #e5e7eb; background: #1e2129; }
  .seg button.active { background: #6ea8fe; color: #0b0d12; font-weight: 600; }
  .seg button:focus-visible { outline: 2px solid #6ea8fe; outline-offset: -2px; z-index: 1; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
  .loading { opacity: 0.7; font-size: 0.85rem; }
</style>
