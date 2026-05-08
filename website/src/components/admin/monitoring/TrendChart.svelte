<script lang="ts">
  import { onMount } from 'svelte';

  interface TrendRow { date: string; pass: number; fail: number; skip: number; p50DurationMs: number; p95DurationMs: number; }

  let trend: TrendRow[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/trend?days=30');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { trend: TrendRow[] };
      trend = data.trend;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  const W = 600;
  const H = 120;
  const PAD = 24;

  function pointsFor(rows: TrendRow[], pick: (r: TrendRow) => number): string {
    if (rows.length === 0) return '';
    const max = Math.max(1, ...rows.map(pick));
    const stepX = (W - PAD * 2) / Math.max(1, rows.length - 1);
    return rows.map((r, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (pick(r) / max) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between">
    <h3 class="text-sm font-semibold text-neutral-100">Pass-Rate Trend (30 Tage)</h3>
    {#if !loading && !error}
      <span class="text-xs text-neutral-400">{trend.length} Tage</span>
    {/if}
  </header>

  {#if loading}
    <p class="text-xs text-neutral-400">Lade Trenddaten…</p>
  {:else if error}
    <p class="text-xs text-red-400">Fehler: {error}</p>
  {:else if trend.length === 0}
    <p class="text-xs text-neutral-400">Noch keine Testläufe in den letzten 30 Tagen.</p>
  {:else}
    <svg viewBox="0 0 {W} {H}" class="h-32 w-full">
      <polyline fill="none" stroke="#10b981" stroke-width="2" points={pointsFor(trend, r => r.pass)} />
      <polyline fill="none" stroke="#ef4444" stroke-width="2" points={pointsFor(trend, r => r.fail)} />
      <polyline fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="3,3" points={pointsFor(trend, r => r.skip)} />
    </svg>
    <footer class="mt-2 flex gap-4 text-xs text-neutral-300">
      <span><span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> pass</span>
      <span><span class="inline-block h-2 w-2 rounded-full bg-red-500"></span> fail</span>
      <span><span class="inline-block h-2 w-2 rounded-full bg-neutral-500"></span> skip</span>
    </footer>
  {/if}
</section>
