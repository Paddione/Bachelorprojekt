<script lang="ts">
  import { onMount } from 'svelte';
  import FactoryFloor from './FactoryFloor.svelte';
  import PlanningOffice from './PlanningOffice.svelte';
  import ControlPanel from './factory/ControlPanel.svelte';
  import FactoryKpiGrid from './factory/FactoryKpiGrid.svelte';
  import FactoryThroughputChart from './factory/FactoryThroughputChart.svelte';
  import FactoryPhaseHeatmap from './factory/FactoryPhaseHeatmap.svelte';
  import FactoryShippedBar from './factory/FactoryShippedBar.svelte';
  import DependencyGraph from './DependencyGraph.svelte';
  import DeliveryHistory from './DeliveryHistory.svelte';
  import type { FloorPayload } from '../lib/factory-floor-types';

  type Tab = 'factory' | 'planung' | 'control' | 'analytics' | 'abhaengigkeiten';

  let { initial, initialTab, brand }: {
    initial: FloorPayload | null;
    initialTab: Tab;
    brand: string;
  } = $props();

  let activeTab = $state<Tab>(initialTab);
  let planningCount = $state(initial?.planningCount ?? { total: 0, ready: 0 });
  let hallActive   = $state(initial?.hall.length ?? 0);

  function switchTab(tab: Tab) {
    activeTab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.pushState({}, '', url.toString());
    try { localStorage.setItem('dev-status-tab', tab); } catch {}
  }

  onMount(() => {
    const saved = localStorage.getItem('dev-status-tab') as Tab | null;
    if (saved && ['factory', 'planung', 'control', 'analytics', 'abhaengigkeiten'].includes(saved)) {
      activeTab = saved;
    }

    window.addEventListener('factory-floor-refreshed', (e: Event) => {
      const detail = (e as CustomEvent<{ planningCount?: typeof planningCount; hallActive?: number }>).detail;
      if (detail.planningCount) planningCount = detail.planningCount;
      if (detail.hallActive != null) hallActive = detail.hallActive;
    });

    window.addEventListener('popstate', () => {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t === 'factory' || t === 'planung' || t === 'control' || t === 'analytics' || t === 'abhaengigkeiten') activeTab = t;
    });
  });

  function planningBadge() {
    return planningCount.ready > 0 ? planningCount.ready : planningCount.total;
  }
</script>

<div class="dev-status-tabs">
  <div class="tab-bar-wrap">
    <button
      class="ds-tab"
      class:active={activeTab === 'factory'}
      onclick={() => switchTab('factory')}
    >
      <span class="tab-label-full">Factory Floor</span>
      <span class="tab-label-short">Factory</span>
      {#if hallActive > 0}
        <span class="tab-badge live">{hallActive} aktiv</span>
      {/if}
    </button>
    <button
      class="ds-tab"
      class:active={activeTab === 'planung'}
      onclick={() => switchTab('planung')}
    >
      <span class="tab-label-full">Planungsbüro</span>
      <span class="tab-label-short">Planung</span>
      {#if planningBadge() > 0}
        <span class="tab-badge">{planningBadge()} {planningCount.ready > 0 ? 'bereit' : 'in Planung'}</span>
      {/if}
    </button>
    <button
      class="ds-tab"
      class:active={activeTab === 'control'}
      onclick={() => switchTab('control')}
    >
      <span class="tab-label-full">Control Panel</span>
      <span class="tab-label-short">Control</span>
    </button>
    <button
      class="ds-tab"
      class:active={activeTab === 'analytics'}
      onclick={() => switchTab('analytics')}
    >
      <span class="tab-label-full">Analytics</span>
      <span class="tab-label-short">Analytics</span>
    </button>
    <button
      class="ds-tab"
      class:active={activeTab === 'abhaengigkeiten'}
      onclick={() => switchTab('abhaengigkeiten')}
    >
      <span class="tab-label-full">Abhängigkeiten</span>
      <span class="tab-label-short">Deps</span>
    </button>
  </div>
</div>

{#if activeTab === 'factory'}
  <FactoryFloor {initial} />
{:else if activeTab === 'planung'}
  <div class="planning-tab-wrap">
    <PlanningOffice {brand} />
  </div>
{:else if activeTab === 'control'}
  <ControlPanel />
{:else if activeTab === 'analytics'}
  <div class="analytics-tab-wrap">
    <DeliveryHistory />
    <FactoryKpiGrid />
    <FactoryThroughputChart />
    <FactoryPhaseHeatmap />
    <FactoryShippedBar />
  </div>
{:else if activeTab === 'abhaengigkeiten'}
  <div class="dag-tab-wrap">
    <DependencyGraph />
  </div>
{/if}

<style>
  .dev-status-tabs { border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07)); }
  .tab-bar-wrap { display: flex; gap: 0; padding: 0 1.5rem; }

  .ds-tab {
    padding: 10px 18px; font-size: 13px; font-weight: 500;
    color: var(--admin-text-mute, #8c96a3);
    border: none; background: transparent; cursor: pointer;
    border-bottom: 2px solid transparent;
    display: flex; align-items: center; gap: 7px;
    transition: color 0.15s;
    font-family: var(--font-sans, inherit);
  }
  .ds-tab:hover { color: var(--admin-text, #eef1f3); }
  .ds-tab.active {
    color: var(--admin-primary, oklch(0.80 0.09 75));
    border-bottom-color: var(--admin-primary, oklch(0.80 0.09 75));
  }

  .tab-badge {
    background: oklch(0.80 0.09 75 / 0.14);
    color: oklch(0.80 0.09 75);
    font-size: 10px; font-family: var(--font-mono, monospace);
    padding: 1px 6px; border-radius: 3px; font-weight: 600;
  }
  .tab-badge.live {
    background: oklch(0.80 0.06 160 / 0.12);
    color: oklch(0.80 0.06 160);
    animation: badge-pulse 2s infinite;
  }
  @keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }

  .tab-label-short { display: none; }
  .tab-label-full  { display: inline; }

  @media (max-width: 767px) {
    .tab-bar-wrap {
      padding: 0 0.5rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .tab-bar-wrap::-webkit-scrollbar { display: none; }

    .ds-tab {
      padding: 8px 12px;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .tab-label-full  { display: none; }
    .tab-label-short { display: inline; }
  }

  .planning-tab-wrap { padding: 1.5rem; }

  .analytics-tab-wrap {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-lg, 1.5rem);
  }

  .dag-tab-wrap {
    padding: 1.5rem;
  }
</style>
