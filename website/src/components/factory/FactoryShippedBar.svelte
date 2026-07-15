<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { SURFACE, BORDER, TEXT_MUTED, PHASE_COLORS, PHASE_LABELS } from './factory-chart-colors';
  import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store';

  interface HallItem {
    extId: string;
    phase: string | null;
  }

  interface ShippedItem {
    extId: string;
    title: string;
    doneAt: string | null;
  }

  interface FloorPayload {
    hall: HallItem[];
    shipped: ShippedItem[];
  }

  let {
    window: _window = '7d',
  }: {
    window?: '7d' | '30d' | 'all';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let loading = $state(true);
  let error = $state(false);

  function renderChart(data: FloorPayload) {
    Chart.register(...registerables);
    const phaseCounts = PHASE_LABELS.map((p) =>
      data.hall.filter((h) => h.phase === p).length
    );
    const shippedCount = data.shipped.length;
    const deployIdx = PHASE_LABELS.indexOf('deploy');
    if (deployIdx >= 0) phaseCounts[deployIdx] += shippedCount;

    const colors = PHASE_LABELS.map((_, i) => PHASE_COLORS[i % PHASE_COLORS.length]);

    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: PHASE_LABELS,
        datasets: [{
          label: 'Tickets',
          data: phaseCounts,
          backgroundColor: colors.map((c) => c + 'cc'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: typeof window !== 'undefined' && window.innerWidth < 640 ? 1 : 2,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: SURFACE,
            borderColor: BORDER,
            borderWidth: 1,
            titleFont: { family: 'JetBrains Mono, monospace' },
            bodyFont: { family: 'JetBrains Mono, monospace' },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: TEXT_MUTED,
              font: { family: 'JetBrains Mono, monospace', size: 11 },
              stepSize: 1,
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: TEXT_MUTED,
              font: { family: 'JetBrains Mono, monospace', size: 11 },
            },
          },
        },
      },
    });
    loading = false;
  }

  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => {
      if (s.payload) { renderChart(s.payload); error = false; }
      else if (!loading) error = true;
    });
    return () => { unsub(); release(); };
  });

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="chart-section">
  <h3 class="chart-title">Shipped pro Phase</h3>
  {#if loading}
    <div class="chart-skeleton"></div>
  {:else if error}
    <div class="chart-error">Shipped-Daten nicht verfügbar.</div>
  {:else}
    <div class="chart-wrap">
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>

<style>
  .chart-section {
    background: var(--factory-surface, #141414);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius-lg, 0.5rem);
    padding: var(--factory-spacing-lg, 1.5rem);
  }
  .chart-title {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--factory-text-muted, #737373);
    margin: 0 0 var(--factory-spacing-md, 1rem) 0;
  }
  .chart-wrap {
    width: 100%;
  }
  .chart-wrap canvas {
    width: 100% !important;
  }
  .chart-skeleton {
    background: var(--factory-surface-elevated, #1a1a1a);
    border-radius: var(--factory-radius-md);
    height: 200px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  .chart-error {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    color: var(--factory-error, #ef4444);
    padding: var(--factory-spacing-xl, 2rem);
    text-align: center;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
