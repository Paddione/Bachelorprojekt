<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureTickets, FeatureNode } from '../../lib/tickets/cockpit-types';
  import { ALL_TICKETS_ID } from '../../lib/tickets/cockpit-ids';
  import { cockpitStore, selectFeature, initStoreFromUrl, setLoading, setError, setFilter }
    from '../../lib/stores/cockpitStore';
  import { parsePresetFromUrl } from '../../lib/cockpit-presets';

  import CockpitTable from './CockpitTable.svelte';
  import TicketCreateModal from './TicketCreateModal.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';
  import MobileToggle from './Cockpit/MobileToggle.svelte';

  export let portfolioInitial: PortfolioPayload | null = null;
  export let brand: string;

  let sidekickOpen = false;

  let portfolio: PortfolioPayload | null = portfolioInitial;
  let featureData: FeatureTickets | null = null;
  let createOpen = false;
  let presetError = '';

  $: allFeatures = portfolio?.products?.flatMap((p) => p.features) ?? [];
  $: currentFeatureNode = allFeatures.find((f) => f.extId === $cockpitStore.selectedFeature) ?? null;

  // Pick a sensible default feature so the cockpit lands on a populated ticket
  // list instead of an empty table. Prefer the flat "Alle Tickets" bucket (the
  // PM's see-everything view); otherwise the first non-discarded feature that
  // actually has tickets, then any feature.
  function pickDefaultFeature(feats: FeatureNode[]): FeatureNode | null {
    const all = feats.find((f) => f.extId === ALL_TICKETS_ID);
    if (all) return all;
    const live = feats.filter((f) => !f.discarded);
    return live.find((f) => (f.rollup?.total ?? 0) > 0) ?? live[0] ?? feats[0] ?? null;
  }

  onMount(async () => {
    if (typeof window !== 'undefined') {
      initStoreFromUrl(new URL(window.location.href).searchParams);
      const urlState = parsePresetFromUrl(window.location.search);
      if (urlState) {
        setFilter(urlState);
      } else if (window.location.search.includes('preset=')) {
        presetError = 'Preset ungültig';
      }
    }
    if (!portfolio) await loadPortfolio();
    // Auto-select a feature when there is none, OR when the persisted/URL
    // selection no longer exists in the portfolio (e.g. a stale localStorage
    // feature, or the old "Ohne Feature" bucket now folded into "Alle Tickets").
    // Without this the table renders empty and never recovers — the user's
    // "I still can't see any tickets" report.
    const feats = portfolio?.products?.flatMap((p) => p.features) ?? [];
    const sel = $cockpitStore.selectedFeature;
    const known = !!sel && feats.some((f) => f.extId === sel);
    if (!known) {
      const def = pickDefaultFeature(feats);
      if (def) selectFeature(def.extId);
    }
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
  });

  onMount(() => {
    const onFeatureSelected = (e: Event) => {
      const extId = (e as CustomEvent<{ extId: string }>).detail?.extId;
      if (extId) loadFeature(extId);
    };
    const onPortfolioMutated = () => loadPortfolio();
    const onToggleSidekick = () => {
      sidekickOpen = !sidekickOpen;
    };
    window.addEventListener('cockpit:feature-selected', onFeatureSelected);
    window.addEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
    window.addEventListener('cockpit:toggle-sidekick', onToggleSidekick);
    return () => {
      window.removeEventListener('cockpit:feature-selected', onFeatureSelected);
      window.removeEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
      window.removeEventListener('cockpit:toggle-sidekick', onToggleSidekick);
    };
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

  async function refetch() {
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
    await loadPortfolio();
  }
</script>

<div class="cockpit-shell" data-brand={brand} data-container="cockpit">
  <MobileToggle open={sidekickOpen} onToggle={() => (sidekickOpen = !sidekickOpen)} />
  {#if $cockpitStore.error}
    <div class="toast error">
      {$cockpitStore.error}
      {#if !portfolio}
        <button class="retry" on:click={loadPortfolio} aria-label="Wiederholen">
          Wiederholen
        </button>
      {/if}
    </div>
  {/if}
  {#if presetError}
    <div class="toast error" data-testid="preset-error">
      {presetError}
    </div>
  {/if}

  {#if portfolio && portfolio.products?.length === 0}
    <EmptyStateCockpit />
  {:else if portfolio}
    <main class="main">
      {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}
      <CockpitTable
        feature={currentFeatureNode}
        tickets={featureData?.tickets ?? []}
        features={allFeatures}
        brand={brand}
        onMutated={refetch}
        onOpenCreate={() => (createOpen = true)} />
    </main>
  {/if}

  <TicketCreateModal open={createOpen} features={allFeatures}
    products={portfolio?.products ?? []}
    defaultFeatureId={currentFeatureNode?.id ?? null}
    onClose={() => (createOpen = false)}
    onCreated={refetch} />
</div>

<style>
  .cockpit-shell { display: flex; flex-direction: column; gap: 0.75rem; }
  .main { flex: 1 1 auto; min-width: 0; width: 100%; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; }
  .retry { margin-left: auto; background: rgba(255,255,255,0.2); border: none;
    color: #fff; border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font-size: 0.8rem; white-space: nowrap; }
  .loading { opacity: 0.7; font-size: 0.85rem; margin-bottom: 0.5rem; }
</style>
