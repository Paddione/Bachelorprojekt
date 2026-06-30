<script lang="ts">
  import { onMount } from 'svelte';
  import { PHASE_LABELS, DAY_LABELS, heatmapColor } from './factory-chart-colors';

  interface HallItem {
    extId: string;
    phase: string | null;
    phaseSince: string | null;
  }

  interface FloorPayload {
    hall: HallItem[];
    shipped: { extId: string; title: string; doneAt: string | null }[];
  }

  let loading = $state(true);
  let error = $state(false);
  let grid = $state<number[][]>([]);
  let maxVal = $state(1);

  onMount(async () => {
    try {
      const res = await fetch('/api/factory-floor', { credentials: 'same-origin' });
      if (!res.ok) { error = true; return; }
      const data = (await res.json()) as FloorPayload;

      const counts: number[][] = Array.from({ length: 6 }, () => Array(7).fill(0));
      const now = new Date();
      const dayOfWeek = (now.getDay() + 6) % 7;

      for (const item of data.hall) {
        if (!item.phase || !item.phaseSince) continue;
        const phaseIdx = PHASE_LABELS.indexOf(item.phase);
        if (phaseIdx < 0) continue;
        const itemDate = new Date(item.phaseSince);
        const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / 86400000);
        for (let d = 0; d < 7; d++) {
          const dayOffset = dayOfWeek - d;
          if (dayOffset >= 0 && diffDays >= dayOffset) {
            counts[phaseIdx][d]++;
          }
        }
      }

      for (const item of data.shipped) {
        if (!item.doneAt) continue;
        const doneDate = new Date(item.doneAt);
        const diffDays = Math.floor((now.getTime() - doneDate.getTime()) / 86400000);
        if (diffDays < 7) {
          const dayIdx = (doneDate.getDay() + 6) % 7;
          const deployIdx = PHASE_LABELS.indexOf('deploy');
          if (deployIdx >= 0) counts[deployIdx][dayIdx]++;
        }
      }

      grid = counts;
      maxVal = Math.max(1, ...counts.flat());
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  const CELL_W = 48;
  const CELL_H = 32;
  const GAP = 3;
  const LABEL_W = 70;
  const HEADER_H = 22;
  const svgWidth = LABEL_W + 7 * (CELL_W + GAP);
  const svgHeight = HEADER_H + 6 * (CELL_H + GAP);
</script>

<div class="heatmap-section">
  <h3 class="chart-title">Phase-Heatmap (7 Tage)</h3>
  {#if loading}
    <div class="chart-skeleton"></div>
  {:else if error}
    <div class="chart-error">Heatmap-Daten nicht verfügbar.</div>
  {:else}
    <div class="heatmap-scroll">
      <svg width={svgWidth} height={svgHeight} viewBox="0 0 {svgWidth} {svgHeight}">
        {#each DAY_LABELS as day, di}
          <text
            x={LABEL_W + di * (CELL_W + GAP) + CELL_W / 2}
            y={14}
            text-anchor="middle"
            class="hm-day-label"
          >{day}</text>
        {/each}
        {#each PHASE_LABELS as phase, pi}
          <text
            x={LABEL_W - 6}
            y={HEADER_H + pi * (CELL_H + GAP) + CELL_H / 2 + 4}
            text-anchor="end"
            class="hm-phase-label"
          >{phase}</text>
          {#each Array(7) as _, di}
            <rect
              x={LABEL_W + di * (CELL_W + GAP)}
              y={HEADER_H + pi * (CELL_H + GAP)}
              width={CELL_W}
              height={CELL_H}
              rx={4}
              fill={heatmapColor(grid[pi]?.[di] ?? 0, maxVal)}
            >
              <title>{phase} / {DAY_LABELS[di]}: {grid[pi]?.[di] ?? 0} Tickets</title>
            </rect>
            {#if (grid[pi]?.[di] ?? 0) > 0}
              <text
                x={LABEL_W + di * (CELL_W + GAP) + CELL_W / 2}
                y={HEADER_H + pi * (CELL_H + GAP) + CELL_H / 2 + 4}
                text-anchor="middle"
                class="hm-cell-value"
              >{grid[pi][di]}</text>
            {/if}
          {/each}
        {/each}
      </svg>
    </div>
  {/if}
</div>

<style>
  .heatmap-section {
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
  .heatmap-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .hm-day-label {
    font-family: var(--factory-font-mono);
    font-size: 11px;
    fill: var(--factory-text-muted, #737373);
  }
  .hm-phase-label {
    font-family: var(--factory-font-mono);
    font-size: 11px;
    fill: var(--factory-text-secondary, #a3a3a3);
  }
  .hm-cell-value {
    font-family: var(--factory-font-mono);
    font-size: 12px;
    font-weight: 600;
    fill: #ffffff;
    pointer-events: none;
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
