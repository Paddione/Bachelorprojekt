<script lang="ts">
  interface DoraMetrics {
    window: string;
    deploymentFrequency: { merges: number; perWeek: number };
    leadTimeHours: { median: number | null; mean: number | null };
    changeFailureRate: { rate: number | null; reverts: number; bugs: number; merges: number; isProxy: boolean };
    mttrHours: { median: number | null; closedBugs: number };
    driverBreakdown: { factory: number; devflow: number };
  }

  let windowSel = $state<'7d' | '30d' | '90d' | 'all'>('7d');
  let metrics = $state<DoraMetrics | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function fmtH(v: number | null): string {
    return v == null ? 'n/a' : `${Math.round(v * 10) / 10} h`;
  }
  function fmtPct(v: number | null): string {
    return v == null ? 'n/a' : `${Math.round(v * 100)} %`;
  }

  async function load() {
    loading = true;
    try {
      const res = await fetch(`/api/admin/dora-metrics?window=${windowSel}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      metrics = body.metrics ?? null;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  $effect(() => { void windowSel; load(); });
</script>

<div class="dora">
  <header>
    <h2>DORA — Delivery-Pipeline</h2>
    <label>
      Zeitfenster
      <select bind:value={windowSel}>
        <option value="7d">7 Tage</option>
        <option value="30d">30 Tage</option>
        <option value="90d">90 Tage</option>
        <option value="all">Gesamt</option>
      </select>
    </label>
  </header>

  {#if loading && !metrics}
    <p class="muted">Lädt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else if metrics}
    <div class="cards">
      <article class="card">
        <h3>Deployment Frequency</h3>
        <p class="big">{metrics.deploymentFrequency.perWeek}/Woche</p>
        <p class="sub">{metrics.deploymentFrequency.merges} Merges nach main</p>
      </article>
      <article class="card">
        <h3>Lead Time for Changes</h3>
        <p class="big">{fmtH(metrics.leadTimeHours.median)}</p>
        <p class="sub">Median · Ø {fmtH(metrics.leadTimeHours.mean)}</p>
      </article>
      <article class="card">
        <h3>Change Failure Rate</h3>
        <p class="big">{fmtPct(metrics.changeFailureRate.rate)}</p>
        <p class="sub">(Proxy) {metrics.changeFailureRate.reverts} Reverts + {metrics.changeFailureRate.bugs} Bugs / {metrics.changeFailureRate.merges} Merges</p>
      </article>
      <article class="card">
        <h3>MTTR</h3>
        <p class="big">{fmtH(metrics.mttrHours.median)}</p>
        <p class="sub">Median Bug-Recovery · {metrics.mttrHours.closedBugs} Bugs</p>
      </article>
    </div>
    <p class="breakdown">
      Treiber: Factory {metrics.driverBreakdown.factory} · dev-flow {metrics.driverBreakdown.devflow}
    </p>
  {/if}
</div>

<style>
  .dora { color: #cdd6e4; display: flex; flex-direction: column; gap: 1rem; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.8rem; }
  .card { background: #111a29; border: 1px solid #243349; border-radius: 10px; padding: 0.9rem 1rem; }
  .card h3 { margin: 0 0 0.4rem; font-size: 0.9rem; color: #8aa0bd; font-weight: 600; }
  .big { margin: 0; font-size: 1.6rem; font-weight: 700; }
  .sub { margin: 0.3rem 0 0; font-size: 0.8rem; color: #7c8aa0; }
  .breakdown { font-size: 0.85rem; color: #8aa0bd; }
  .muted { color: #7c8aa0; }
  select { background: #0b111c; color: inherit; border: 1px solid #2a3a52; border-radius: 6px; padding: 0.2rem 0.5rem; }
</style>
