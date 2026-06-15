<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureTickets, TicketRow } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, selectFeature, setActiveTicket, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
  import CockpitSidebar from './CockpitSidebar.svelte';
  import CockpitTable from './CockpitTable.svelte';
  import TicketCreateModal from './TicketCreateModal.svelte';
  import TicketDrawer from './TicketDrawer.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';

  export let portfolioInitial: PortfolioPayload | null = null;
  export let brand: string;

  let portfolio: PortfolioPayload | null = portfolioInitial;
  let featureData: FeatureTickets | null = null;
  let drawerTicket: TicketRow | null = null;
  let drawerOpen = false;
  let createOpen = false;

  $: allFeatures = portfolio?.products.flatMap((p) => p.features) ?? [];
  $: currentFeatureNode = allFeatures.find((f) => f.extId === $cockpitStore.selectedFeature) ?? null;

  onMount(async () => {
    if (typeof window !== 'undefined') initStoreFromUrl(new URL(window.location.href).searchParams);
    if (!portfolio) await loadPortfolio();
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
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

  async function loadFeature(extId: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/cockpit/feature?id=${encodeURIComponent(extId)}`);
      if (!res.ok) throw new Error(`feature ${res.status}`);
      featureData = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }

  async function pickFeature(extId: string) {
    selectFeature(extId);
    await loadFeature(extId);
  }

  async function refetch() {
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
    await loadPortfolio();
  }

  function openDrawer(detail: { ticket: TicketRow }) {
    drawerTicket = detail.ticket; drawerOpen = true; setActiveTicket(detail.ticket.id);
  }
  function closeDrawer() { drawerOpen = false; setActiveTicket(null); }

  async function featureAction(featureId: string, action: string, value?: boolean | string) {
    try {
      const res = await fetch('/api/admin/cockpit/feature-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, action, value }),
      });
      if (!res.ok) throw new Error(`feature-action ${res.status}`);
      await loadPortfolio();
    } catch (e) { setError(String((e as Error).message)); }
  }
</script>

<div class="cockpit-shell" data-brand={brand}>
  {#if $cockpitStore.error}<div class="toast error">{$cockpitStore.error}</div>{/if}

  {#if portfolio && portfolio.products.length === 0}
    <EmptyStateCockpit />
  {:else if portfolio}
    <div class="layout">
      <CockpitSidebar {portfolio} selectedFeature={$cockpitStore.selectedFeature}
        onSelectFeature={pickFeature} onFeatureAction={featureAction}
        onMutated={refetch} />
      <main class="main">
        {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}
        <CockpitTable
          feature={currentFeatureNode}
          tickets={featureData?.tickets ?? []}
          features={allFeatures}
          onMutated={refetch}
          onOpenDrawer={openDrawer}
          onOpenCreate={() => (createOpen = true)} />
      </main>
    </div>
  {/if}

  <TicketCreateModal open={createOpen} features={allFeatures}
    defaultFeatureId={currentFeatureNode?.id ?? null}
    onClose={() => (createOpen = false)}
    onCreated={refetch} />

  <TicketDrawer ticket={drawerTicket} open={drawerOpen}
    onClose={closeDrawer} onMutated={refetch} />
</div>

<style>
  .cockpit-shell { display: flex; flex-direction: column; gap: 0.75rem; }
  .layout { display: flex; gap: 1rem; align-items: flex-start; min-height: 60vh; }
  .main { flex: 1 1 auto; min-width: 0; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
  .loading { opacity: 0.7; font-size: 0.85rem; margin-bottom: 0.5rem; }

  @media (max-width: 767px) {
    .layout { flex-direction: column; gap: 0.5rem; }
  }
</style>
