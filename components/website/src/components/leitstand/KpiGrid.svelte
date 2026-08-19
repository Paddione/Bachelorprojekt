<script lang="ts">
  // KpiGrid.svelte — Leerlauf-Modul der Z4 (T008016/E4): DORA-Kacheln aus
  // /sdlc/api/delivery-metrics plus Factory-KPIs, im Leitstand-DS.
  // Antwort-Handling mit fetchedAt + explizitem error-Feld (D12/D13):
  // Fehlerzustand pro Kachel (Leerzustand statt Platzhalterzahlen).
  import { onMount } from 'svelte';
  import { aggregateDora, formatKpiTile } from '../../lib/sdlc/leitstand-kpi.ts';
  import type { DoraKpis } from '../../lib/sdlc/leitstand-kpi.ts';
  import type { DeliveryMetric, DeliverySummary } from '../../lib/delivery-metrics.ts';

  interface DeliveryResponse {
    metrics?: DeliveryMetric[];
    summary?: DeliverySummary;
  }

  const WINDOW_DAYS = 30;

  const emptyKpis = (): DoraKpis => ({
    deploymentFrequencyPerWeek: 0,
    leadTimeHoursAvg: null,
    changeFailureRate: null,
    deliveries: 0,
    weeks: 0,
    mishapCount: 0,
  });

  let loading = $state(true);
  let error = $state<string | null>(null);
  let fetchedAt = $state<string | null>(null);
  let dora = $state<DoraKpis>(emptyKpis());
  let summary = $state<DeliverySummary | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/sdlc/api/delivery-metrics?window=30d', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeliveryResponse = await res.json();
      if (data.summary) summary = data.summary;
      dora = aggregateDora(data.metrics ?? [], {
        windowDays: WINDOW_DAYS,
        bugCount: data.summary?.mishapCount ?? 0,
      });
      fetchedAt = new Date().toISOString();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Laden fehlgeschlagen';
      dora = emptyKpis();
      summary = null;
    } finally {
      loading = false;
    }
  }

  onMount(() => { void load(); });

  // Signal-Ampel fuer die Change-Failure-Rate (klassische DORA-Schwellen).
  const cfrTone = $derived.by(() => {
    const cfr = dora.changeFailureRate;
    if (cfr == null) return '';
    if (cfr <= 0.15) return 'ls-kpi-tile--good';
    if (cfr <= 0.5) return 'ls-kpi-tile--warn';
    return 'ls-kpi-tile--bad';
  });
</script>

<section class="ls-kpi-grid" data-purpose-id="kpi-grid" data-testid="leitstand-kpi-grid" aria-label="DORA- und Factory-KPIs">
  <h2 class="ls-kpi-grid__heading">Delivery-KPIs</h2>

  {#if error}
    <p class="ls-kpi-grid__error">Fehler: {error} — KPI-Quelle nicht erreichbar.</p>
  {/if}

  <div class="ls-kpi-grid__tiles">
    <div class="ls-kpi-tile">
      <span class="ls-kpi-tile__label">Deployment-Frequenz</span>
      <span class="ls-kpi-tile__value">{loading && !fetchedAt ? '…' : formatKpiTile(dora.deploymentFrequencyPerWeek, { suffix: '/W' })}</span>
      <span class="ls-kpi-tile__detail">{dora.deliveries} Delivery{ dora.deliveries === 1 ? '' : 's' } · {formatKpiTile(dora.weeks, { decimals: 1, suffix: ' Wo' })}</span>
    </div>

    <div class="ls-kpi-tile">
      <span class="ls-kpi-tile__label">Lead Time (ø)</span>
      <span class="ls-kpi-tile__value">{loading && !fetchedAt ? '…' : formatKpiTile(dora.leadTimeHoursAvg, { suffix: ' h' })}</span>
      <span class="ls-kpi-tile__detail">Ticket → Live</span>
    </div>

    <div class="ls-kpi-tile {cfrTone}">
      <span class="ls-kpi-tile__label">Change Failure Rate</span>
      <span class="ls-kpi-tile__value">{loading && !fetchedAt ? '…' : formatKpiTile(dora.changeFailureRate != null ? dora.changeFailureRate * 100 : null, { suffix: ' %' })}</span>
      <span class="ls-kpi-tile__detail">{dora.mishapCount} Bug{ dora.mishapCount === 1 ? '' : 's' } im Fenster</span>
    </div>
  </div>

  <h2 class="ls-kpi-grid__heading">Factory</h2>
  <div class="ls-kpi-grid__tiles">
    <div class="ls-kpi-tile">
      <span class="ls-kpi-tile__label">Durchsatz</span>
      <span class="ls-kpi-tile__value">{loading && !fetchedAt ? '…' : formatKpiTile(dora.deliveries, { decimals: 0, suffix: '' })}</span>
      <span class="ls-kpi-tile__detail">Fertige Features (30d)</span>
    </div>
    <div class="ls-kpi-tile">
      <span class="ls-kpi-tile__label">Modell-Mix</span>
      <span class="ls-kpi-tile__value">{loading && !fetchedAt ? '…' : `${summary?.claudePct ?? 0}% C / ${summary?.deepseekPct ?? 0}% D`}</span>
      <span class="ls-kpi-tile__detail">Claude / DeepSeek / Sonstige</span>
    </div>
  </div>

  {#if fetchedAt}
    <p class="ls-kpi-grid__meta">Datenstand: {new Date(fetchedAt).toLocaleString('de-DE')}</p>
  {/if}
</section>

<style>
  .ls-kpi-grid {
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-4, 8px);
  }

  .ls-kpi-grid__heading {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
    margin: 0 0 var(--ls-space-2, 4px);
  }

  .ls-kpi-grid__error {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ls-signal-red, #ff5c5c);
    background: var(--ls-signal-red-dim, rgba(255, 92, 92, 0.12));
    border: 1px solid var(--ls-signal-red-dim, rgba(255, 92, 92, 0.3));
    border-radius: var(--ls-radius-sm, 4px);
    padding: var(--ls-space-3, 6px) var(--ls-space-4, 8px);
  }

  .ls-kpi-grid__tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--ls-space-4, 8px);
  }

  .ls-kpi-tile {
    background: var(--ls-surface-raised, #12161d);
    border: 1px solid var(--ls-line, #1d232c);
    border-radius: var(--ls-radius-md, 6px);
    padding: var(--ls-space-4, 8px);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-2, 4px);
  }

  .ls-kpi-tile--good { border-color: var(--ls-signal-green, #3fb950); }
  .ls-kpi-tile--warn { border-color: var(--ls-signal-amber, #d29922); }
  .ls-kpi-tile--bad  { border-color: var(--ls-signal-red, #ff5c5c); }

  .ls-kpi-tile__label {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-secondary, #9aa4b2);
  }

  .ls-kpi-tile__value {
    font-family: var(--ls-font-mono, monospace);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
    color: var(--ls-text-primary, #e6edf3);
  }

  .ls-kpi-tile__detail {
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-text-muted, #707b8a);
  }

  .ls-kpi-grid__meta {
    margin: 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.65rem;
    color: var(--ls-text-muted, #707b8a);
    border-top: 1px solid var(--ls-line, #1d232c);
    padding-top: var(--ls-space-3, 6px);
  }
</style>
