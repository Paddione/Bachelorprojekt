<script lang="ts">
  import { onMount } from 'svelte';
  import FactoryKpiCard from './FactoryKpiCard.svelte';
  import { getSharedMetrics } from '../../lib/stores/factory-floor-store';

  let {
    window: _window = '7d',
  }: {
    window?: '7d' | '30d' | 'all';
  } = $props();

  interface MetricRow {
    day: string;
    features_shipped: number;
    avg_cycle_time_h: number | null;
    escalations: number;
    total_features: number;
  }

  interface MetricsPayload {
    metrics: MetricRow[];
    activeFeatures: { external_id: string; title: string; priority: string; status: string; pipeline_slot: number | null }[];
    flags: { brand: string; key: string; enabled: boolean; set_by: string | null }[];
    fetchedAt: string;
  }

  const ICON_SHIPPED = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>';
  const ICON_CYCLE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>';
  const ICON_ACTIVE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>';
  const ICON_ESCALATION = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>';
  const ICON_TOTAL = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"/></svg>';

  let loading = $state(true);
  let error = $state(false);
  let latest: MetricRow | null = $state(null);
  let activeCount = $state(0);
  let prevDay: MetricRow | null = null;

  function shippedTrend(): 'up' | 'down' | null {
    if (!latest || !prevDay) return null;
    if (latest.features_shipped > prevDay.features_shipped) return 'up';
    if (latest.features_shipped < prevDay.features_shipped) return 'down';
    return null;
  }

  onMount(async () => {
    try {
      const json = await getSharedMetrics() as unknown as MetricsPayload;
      if (json.metrics.length > 0) {
        latest = json.metrics[0];
        prevDay = json.metrics.length > 1 ? json.metrics[1] : null;
      }
      activeCount = json.activeFeatures?.length ?? 0;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="kpi-grid">
    {#each Array(5) as _}
      <div class="skeleton-card"></div>
    {/each}
  </div>
{:else if error}
  <div class="kpi-grid">
    {#each Array(5) as _}
      <div class="skeleton-card error-card">
        <span class="error-text">Fehler</span>
      </div>
    {/each}
  </div>
{:else}
  <div class="kpi-grid">
    <FactoryKpiCard
      icon={ICON_SHIPPED}
      value={latest?.features_shipped ?? 0}
      label="Shipped heute"
      trend={shippedTrend()}
    />
    <FactoryKpiCard
      icon={ICON_CYCLE}
      value={latest?.avg_cycle_time_h != null ? `${Number(latest.avg_cycle_time_h).toFixed(1)}h` : '–'}
      label="Ø Zyklus"
    />
    <FactoryKpiCard
      icon={ICON_ACTIVE}
      value={activeCount}
      label="Aktive Features"
    />
    <FactoryKpiCard
      icon={ICON_ESCALATION}
      value={latest?.escalations ?? 0}
      label="Eskalationen"
    />
    <FactoryKpiCard
      icon={ICON_TOTAL}
      value={latest?.total_features ?? 0}
      label="Total Features"
    />
  </div>
{/if}

<style>
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--factory-spacing-md, 1rem);
  }
  .skeleton-card {
    background: var(--factory-surface, #141414);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius-lg, 0.5rem);
    height: 120px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  .error-card {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .error-text {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    color: var(--factory-error, #ef4444);
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @media (max-width: 900px) {
    .kpi-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 640px) {
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
