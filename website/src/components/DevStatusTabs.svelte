<script lang="ts">
  import { onMount } from 'svelte';
  import FactoryFloor from './FactoryFloor.svelte';
  import PlanningOffice from './PlanningOffice.svelte';
  import ControlPanel from './factory/ControlPanel.svelte';
  import FactoryModelSlots from './factory/FactoryModelSlots.svelte';
  import KiRoutingPanel from './factory/KiRoutingPanel.svelte';
  import FactoryKpiGrid from './factory/FactoryKpiGrid.svelte';
  import FactoryThroughputChart from './factory/FactoryThroughputChart.svelte';
  import FactoryPhaseHeatmap from './factory/FactoryPhaseHeatmap.svelte';
  import FactoryShippedBar from './factory/FactoryShippedBar.svelte';
  import DependencyGraph from './DependencyGraph.svelte';
  import DeliveryHistory from './DeliveryHistory.svelte';
  import AdminTabs from './admin/ui/AdminTabs.svelte';
  import KostenTab from './factory/KostenTab.svelte';
  import AnalyticsWindowFilter from './factory/AnalyticsWindowFilter.svelte';
  import type { FloorPayload } from '../lib/factory-floor-types';

  type Tab = 'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten';
  const TAB_KEYS: Tab[] = ['factory', 'planung', 'analytics', 'kosten', 'control', 'abhaengigkeiten'];

  let { initial, initialTab, brand }: {
    initial: FloorPayload | null;
    initialTab: Tab;
    brand: string;
  } = $props();

  let activeTab = $state<Tab>(initialTab);
  let analyticsWindow = $state<'7d' | '30d' | 'all'>('7d');

  function switchTab(tab: Tab) {
    activeTab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.pushState({}, '', url.toString());
    try { localStorage.setItem('dev-status-tab', tab); } catch {}
  }

  onMount(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (!urlTab) {
      const saved = localStorage.getItem('dev-status-tab') as Tab | null;
      if (saved && TAB_KEYS.includes(saved)) activeTab = saved;
    }
    window.addEventListener('popstate', () => {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && TAB_KEYS.includes(t)) activeTab = t;
    });
  });
</script>

<div class="dev-status-tabs">
  <AdminTabs
    tabs={[
      { id: 'factory', label: 'Floor' },
      { id: 'planung', label: 'Planung' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'kosten', label: 'Kosten' },
      { id: 'control', label: 'Steuerung' },
      { id: 'abhaengigkeiten', label: 'Abhängigkeiten' },
    ]}
    active={activeTab}
    onselect={(id) => switchTab(id as Tab)}
  />
</div>

{#if activeTab === 'factory'}
  <FactoryFloor {initial} />
{:else if activeTab === 'planung'}
  <div class="planning-tab-wrap">
    <PlanningOffice {brand} />
  </div>
{:else if activeTab === 'control'}
  <ControlPanel />
  <div class="control-extras"><FactoryModelSlots /><KiRoutingPanel /></div>
{:else if activeTab === 'analytics'}
  <div class="analytics-tab-wrap">
    <AnalyticsWindowFilter value={analyticsWindow} onchange={(w) => (analyticsWindow = w)} />
    <DeliveryHistory window={analyticsWindow} />
    <FactoryKpiGrid window={analyticsWindow} />
    <FactoryThroughputChart window={analyticsWindow} />
    <FactoryPhaseHeatmap window={analyticsWindow} />
    <FactoryShippedBar window={analyticsWindow} />
  </div>
{:else if activeTab === 'kosten'}
  <KostenTab />
{:else if activeTab === 'abhaengigkeiten'}
  <div class="dag-tab-wrap">
    <DependencyGraph />
  </div>
{/if}

<style>
  .dev-status-tabs { border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07)); }

  .planning-tab-wrap { padding: 1.5rem; }

  .analytics-tab-wrap {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: var(--admin-spacing-lg, 1.5rem);
  }

  .dag-tab-wrap {
    padding: 1.5rem;
  }

  .control-extras {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
</style>
