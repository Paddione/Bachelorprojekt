<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { SURFACE, BORDER, TEXT_MUTED, SUCCESS } from './factory-chart-colors';
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
  }

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    Chart.register(...registerables);
    try {
      const json = await getSharedMetrics() as unknown as MetricsPayload;
      const rows = json.metrics.slice(0, 7).reverse();
      const labels = rows.map((r) => {
        const d = new Date(r.day);
        return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      });
      const data = rows.map((r) => r.features_shipped);

      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Throughput',
            data,
            borderColor: SUCCESS,
            backgroundColor: SUCCESS + '20',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: SUCCESS,
            pointBorderColor: SURFACE,
            pointBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: typeof window !== 'undefined' && window.innerWidth < 640 ? 16 / 9 : 16 / 6,
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
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: TEXT_MUTED, font: { family: 'JetBrains Mono, monospace', size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: TEXT_MUTED,
                font: { family: 'JetBrains Mono, monospace', size: 11 },
                stepSize: 1,
              },
            },
          },
        },
      });
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });
</script>

<div class="chart-section">
  <h3 class="chart-title">Throughput (7 Tage)</h3>
  {#if loading}
    <div class="chart-skeleton"></div>
  {:else if error}
    <div class="chart-error">Daten konnten nicht geladen werden.</div>
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
  @media (max-width: 640px) {
    .chart-wrap canvas {
      aspect-ratio: 16 / 9;
    }
  }
</style>
