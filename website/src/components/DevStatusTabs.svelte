<script lang="ts">
  import { onMount } from 'svelte';
  import FactoryFloor from './FactoryFloor.svelte';
  import PlanningOffice from './PlanningOffice.svelte';
  import ControlPanel from './factory/ControlPanel.svelte';
  import FactoryModelSlots from './factory/FactoryModelSlots.svelte';
  import KiRoutingPanel from './factory/KiRoutingPanel.svelte';
  import LlmProxyPanel from './factory/LlmProxyPanel.svelte';
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
  import { deriveCountdownSec } from '../lib/parallel-status';

  type Tab = 'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten' | 'parallel';
  const TAB_KEYS: Tab[] = ['factory', 'planung', 'analytics', 'kosten', 'control', 'abhaengigkeiten', 'parallel'];

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

  // --- Parallel-Status-Panel (inline, T002079) ---
  interface ParallelStatus {
    gangTickets: number;
    slotsClaimed: number;
    slotsPerBrand: number;
    nextTickAt: string | null;
  }

  let parallel = $state<ParallelStatus | null>(null);
  let parallelError = $state<string | null>(null);
  let parallelLoading = $state(false);
  let forcing = $state(false);
  let nowMs = $state(Date.now());
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  // Keyed on the observed nextTickAt: we auto-refetch once per *distinct* tick
  // target. A boolean guard would be reset by loadParallel() and re-fire every
  // second while a tick stays overdue (factory idle) — a 1 req/s storm.
  let lastRefetchedTickAt: string | null = null;

  async function loadParallel() {
    try {
      parallelLoading = true;
      const res = await fetch('/api/factory/parallel-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parallel = (await res.json()) as ParallelStatus;
      parallelError = null;
    } catch (err) {
      parallelError = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
      parallel = null;
    } finally {
      parallelLoading = false;
    }
  }

  async function forceTick() {
    try {
      forcing = true;
      const res = await fetch('/api/factory/force-tick', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadParallel();
    } catch (err) {
      parallelError = err instanceof Error ? err.message : 'Force-Tick fehlgeschlagen';
    } finally {
      forcing = false;
    }
  }

  // Restsekunden bis nextTickAt (0 → Tick fällig); null wenn kein Tick geplant.
  // Nutzt die getestete pure Funktion (clamped ≥ 0) statt inline-Duplikat.
  const remainingSec = $derived(
    parallel?.nextTickAt
      ? deriveCountdownSec(parallel.nextTickAt, new Date(nowMs).toISOString())
      : null,
  );

  function fmtCountdown(sec: number): string {
    const s = Math.max(0, sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // Beim Aktivieren des Tabs: einmal fetchen + 1-Sekunden-Timer starten.
  // Cleanup (Tab-Wechsel/Unmount) räumt den Timer auf — kein Leak.
  $effect(() => {
    if (activeTab !== 'parallel') return;
    loadParallel();
    tickTimer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };
  });

  // Countdown erreicht 0 → genau einmal pro Tick-Ziel auto-refetchen. Der Guard
  // vergleicht den beobachteten nextTickAt: bleibt ein Tick überfällig (Factory
  // idle, unveränderter nextTickAt), feuert der Refetch NICHT erneut — erst ein
  // echter neuer Tick-Zeitpunkt (frisches last-tick-at) armt wieder.
  $effect(() => {
    if (
      activeTab === 'parallel' &&
      parallel?.nextTickAt &&
      remainingSec !== null &&
      remainingSec <= 0 &&
      parallel.nextTickAt !== lastRefetchedTickAt
    ) {
      lastRefetchedTickAt = parallel.nextTickAt;
      loadParallel();
    }
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
      { id: 'parallel', label: 'Parallel' },
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
  <div class="control-extras"><FactoryModelSlots /><KiRoutingPanel /><LlmProxyPanel /></div>
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
{:else if activeTab === 'parallel'}
  <div class="parallel-tab-wrap">
    {#if parallelError}
      <div class="parallel-panel__error">
        <p>Parallel-Status nicht ladbar: {parallelError}</p>
        <button onclick={loadParallel} disabled={parallelLoading}>Erneut laden</button>
      </div>
    {:else if parallel}
      <div class="parallel-panel__grid">
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.gangTickets}</span>
          <span class="parallel-stat__label">Gang-Tickets</span>
        </div>
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.slotsClaimed}</span>
          <span class="parallel-stat__label">Slots belegt</span>
        </div>
        <div class="parallel-stat">
          <span class="parallel-stat__num">{parallel.slotsPerBrand}</span>
          <span class="parallel-stat__label">Slots / Brand</span>
        </div>
      </div>
      <div class="parallel-panel__tick">
        {#if remainingSec !== null && remainingSec <= 0}
          <span class="parallel-panel__due">Tick fällig</span>
        {:else if remainingSec !== null}
          <span class="parallel-panel__countdown">Nächster Tick in {fmtCountdown(remainingSec)}</span>
        {:else}
          <span class="parallel-panel__countdown">Kein Tick geplant</span>
        {/if}
        <button class="parallel-panel__force" onclick={forceTick} disabled={forcing}>
          {forcing ? 'Wird ausgelöst…' : 'Force next tick'}
        </button>
      </div>
    {:else}
      <div class="parallel-panel__loading">Lade Parallel-Status…</div>
    {/if}
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

  .parallel-tab-wrap {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .parallel-panel__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .parallel-stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--admin-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--admin-border, rgba(255, 255, 255, 0.07));
    border-radius: var(--admin-radius-md, 8px);
  }

  .parallel-stat__num {
    font-size: 1.75rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-primary);
  }

  .parallel-stat__label {
    font-size: var(--admin-text-sm, 0.85rem);
    color: var(--admin-text-secondary);
  }

  .parallel-panel__tick {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-secondary);
  }

  .parallel-panel__due {
    color: var(--admin-error);
    font-weight: 600;
  }

  .parallel-panel__force {
    padding: 0.5rem 1.25rem;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius-md);
    color: var(--admin-text-primary);
    cursor: pointer;
    font-family: var(--admin-font-mono);
  }

  .parallel-panel__force:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .parallel-panel__error p {
    margin: 0 0 1rem;
    color: var(--admin-error);
  }

  .parallel-panel__loading {
    padding: 1.5rem;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-secondary);
  }

  @media (max-width: 768px) {
    .parallel-panel__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
