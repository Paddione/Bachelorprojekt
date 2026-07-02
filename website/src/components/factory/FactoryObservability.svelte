<script lang="ts">
  import { onMount } from 'svelte';
  import FactoryKpiCard from './FactoryKpiCard.svelte';
  import { ACCENT, PHASE_COLOR_BY_NAME } from './factory-chart-colors';

  interface PromResult {
    metric: Record<string, string>;
    values: [number, string][];
  }

  interface PromMatrix {
    status: string;
    data: { resultType: string; result: Array<PromResult> };
  }

  interface TimelineRow {
    external_id: string; phase: string; state: string; at: string; brand: string;
  }

  interface ObsData {
    brand: string;
    cost: PromMatrix | null;
    tokens: PromMatrix | null;
    phaseDuration: PromMatrix | null;
    costByModel: PromMatrix | null;
    costByTicket: PromMatrix | null;
    timeline: TimelineRow[];
    fetchedAt: string;
  }

  let loading = $state(true);
  let error = $state('');
  let data = $state<ObsData | null>(null);

  const KPI_COST = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>';
  const KPI_TOKENS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"/></svg>';
  const KPI_PHASES = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"/></svg>';
  const KPI_TICKS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"/></svg>';

  const PHASE_ORDER = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'];

  function sumValues(result: PromResult[]): number {
    let s = 0;
    for (const r of result) {
      for (const [, v] of r.values) s += parseFloat(v) || 0;
    }
    return Math.round(s * 100) / 100;
  }

  function phaseDurationTotals(dur: PromMatrix | null): Record<string, number> {
    const out: Record<string, number> = {};
    if (!dur?.data?.result) return out;
    for (const r of dur.data.result) {
      const ph = r.metric.phase || '';
      let s = 0;
      for (const [, v] of r.values) s += parseFloat(v) || 0;
      out[ph] = Math.round(s * 100) / 100;
    }
    return out;
  }

  function brandBadge(b: string): string {
    return b === 'korczewski' ? 'KOR' : 'MEN';
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/factory-observability', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      data = await res.json();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="obs-loading">
    <div class="skeleton kpi-row"><div/><div/><div/><div/></div>
  </div>
{:else if error}
  <div class="obs-error">{error}</div>
{:else if data}
  <div class="obs-dashboard">
    <!-- KPI Row -->
    <div class="kpi-row">
      <FactoryKpiCard icon={KPI_COST} value={`$${sumValues(data.cost?.data?.result ?? []).toFixed(2)}`} label="Kosten (7d)" />
      <FactoryKpiCard icon={KPI_TOKENS} value={sumValues(data.tokens?.data?.result ?? []).toLocaleString()} label="Tokens (7d)" />
      <FactoryKpiCard icon={KPI_PHASES} value={Object.keys(phaseDurationTotals(data.phaseDuration)).length} label="Phasen aktiv" />
      <FactoryKpiCard icon={KPI_TICKS} value={data.timeline.length} label="Tick-Events" />
    </div>

    <!-- Phase Duration Breakdown -->
    <div class="section">
      <h2 class="section-title">Phasen-Dauer (7d)</h2>
      {#if data.phaseDuration?.data?.result?.length}
        <div class="phase-bars">
          {#each PHASE_ORDER as ph}
            {@const dur = phaseDurationTotals(data.phaseDuration)[ph] || 0}
            {#if dur > 0}
              <div class="phase-bar-row">
                <span class="phase-label" style="color: {PHASE_COLOR_BY_NAME[ph] || ACCENT}">{ph}</span>
                <div class="phase-bar-track">
                  <div class="phase-bar-fill" style="width: {Math.min(100, dur / 10 * 100)}%; background: {PHASE_COLOR_BY_NAME[ph] || ACCENT}"></div>
                </div>
                <span class="phase-val">{dur.toFixed(1)}ms</span>
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="muted">Keine Phasen-Metriken verfügbar (Prometheus/OTel Verbindung prüfen oder noch keine Factory Ticks gelaufen).</p>
      {/if}
    </div>

    <!-- Provider/Model Cost Breakdown -->
    <div class="section">
      <h2 class="section-title">Kosten nach Provider/Model</h2>
      {#if data.costByModel?.data?.result?.length}
        <div class="phase-bars">
          {#each data.costByModel.data.result as row}
            {@const model = row.metric.model || 'unknown'}
            {@const cost = parseFloat(row.values?.[row.values.length - 1]?.[1] || '0') || 0}
            <div class="phase-bar-row">
              <span class="phase-label">{model}</span>
              <div class="phase-bar-track">
                <div class="phase-bar-fill" style="width: {Math.min(100, cost * 100)}%; background: {PHASE_COLOR_BY_NAME[model] || ACCENT}"></div>
              </div>
              <span class="phase-val">${cost.toFixed(4)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted">Keine Provider-Metriken verfügbar.</p>
      {/if}
    </div>

    <!-- Per-Ticket Cost (Top 10) -->
    <div class="section">
      <h2 class="section-title">Kosten pro Ticket (Top 10)</h2>
      {#if data.costByTicket?.data?.result?.length}
        <div class="timeline-table-wrap">
          <table class="timeline-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Kosten (USD)</th>
              </tr>
            </thead>
            <tbody>
              {#each data.costByTicket.data.result.slice(0, 10) as row}
                {@const tid = row.metric.ticket_id || '—'}
                {@const cost = parseFloat(row.values?.[row.values.length - 1]?.[1] || '0') || 0}
                <tr>
                  <td class="mono">{tid}</td>
                  <td class="mono">${cost.toFixed(4)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">Keine Ticket-Kosten verfügbar.</p>
      {/if}
    </div>

    <!-- Timeline (last 20) -->
    <div class="section">
      <h2 class="section-title">Tick-Timeline (letzte Events)</h2>
      {#if data.timeline.length > 0}
        <div class="timeline-table-wrap">
          <table class="timeline-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Brand</th>
                <th>Phase</th>
                <th>State</th>
                <th>Zeit</th>
              </tr>
            </thead>
            <tbody>
              {#each data.timeline.slice(0, 20) as row (row.external_id + row.at)}
                <tr>
                  <td class="mono">{row.external_id}</td>
                  <td><span class="brand-badge badge-{row.brand}">{brandBadge(row.brand)}</span></td>
                  <td><span class="phase-tag" style="background: {PHASE_COLOR_BY_NAME[row.phase] || '#333'}">{row.phase}</span></td>
                  <td><span class="state-tag state-{row.state}">{row.state}</span></td>
                  <td class="muted text-xs">{new Date(row.at).toLocaleString('de-DE')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="muted">Keine Timeline-Daten verfügbar.</p>
      {/if}
    </div>

    <p class="fetched-at muted text-xs">Daten aktualisiert: {new Date(data.fetchedAt).toLocaleString('de-DE')} · Brand: {data.brand}</p>
  </div>
{/if}

<style>
  .obs-dashboard {
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-lg, 1.5rem);
    padding: var(--factory-spacing-md, 1rem);
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--factory-spacing-md, 1rem);
  }
  .section {
    background: var(--factory-surface, #141414);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius-lg, 0.5rem);
    padding: var(--factory-spacing-md, 1rem);
  }
  .section-title {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--factory-text-muted, #737373);
    margin: 0 0 var(--factory-spacing-md, 1rem) 0;
    padding-bottom: var(--factory-spacing-xs, 0.25rem);
    border-bottom: 1px solid var(--factory-border, #2a2a2a);
  }
  .phase-bars { display: flex; flex-direction: column; gap: 0.5rem; }
  .phase-bar-row { display: flex; align-items: center; gap: 0.5rem; }
  .phase-label { font-family: var(--factory-font-mono); font-size: 0.75rem; min-width: 5rem; }
  .phase-bar-track { flex: 1; height: 8px; background: var(--factory-border, #2a2a2a); border-radius: 4px; overflow: hidden; }
  .phase-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .phase-val { font-family: var(--factory-font-mono); font-size: 0.75rem; color: var(--factory-text-muted); min-width: 5rem; text-align: right; }
  .timeline-table-wrap { overflow-x: auto; }
  .timeline-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  .timeline-table th { text-align: left; padding: 0.5rem; font-family: var(--factory-font-mono); color: var(--factory-text-muted); font-weight: 600; border-bottom: 1px solid var(--factory-border); }
  .timeline-table td { padding: 0.5rem; border-bottom: 1px solid var(--factory-border, #2a2a2a); }
  .mono { font-family: var(--factory-font-mono); font-size: 0.75rem; }
  .muted { color: var(--factory-text-muted, #737373); }
  .text-xs { font-size: 0.6875rem; }
  .brand-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 0.625rem; font-weight: 700; }
  .badge-mentolder { background: oklch(0.80 0.09 75 / 0.25); color: oklch(0.85 0.09 75); }
  .badge-korczewski { background: oklch(0.75 0.10 250 / 0.25); color: oklch(0.80 0.10 250); }
  .phase-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 0.625rem; font-weight: 600; color: #fff; }
  .state-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 0.625rem; }
  .state-entered { background: oklch(0.60 0.10 250 / 0.25); color: oklch(0.80 0.10 250); }
  .state-done { background: oklch(0.60 0.06 160 / 0.25); color: oklch(0.80 0.06 160); }
  .state-blocked { background: oklch(0.50 0.20 25 / 0.25); color: oklch(0.80 0.15 25); }
  .fetched-at { padding-top: var(--factory-spacing-sm, 0.5rem); border-top: 1px solid var(--factory-border); }
  .obs-loading, .obs-error {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; font-family: var(--factory-font-mono);
  }
  .obs-error { color: var(--factory-error, #ef4444); }
  .skeleton > div { background: var(--factory-surface); border-radius: 0.5rem; height: 120px; animation: pulse 1.5s ease-in-out infinite; }
  .skeleton.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; width: 100%; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  @media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 500px) { .kpi-row { grid-template-columns: 1fr; } }
</style>
