<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeliveryMetric, DeliverySummary } from '../lib/delivery-metrics';

  interface ApiResponse {
    metrics: DeliveryMetric[];
    summary: DeliverySummary;
    ghRepo: string;
  }

  let {
    window = '7d',
  }: {
    window?: '7d' | '30d' | 'all';
  } = $props();

  let data: ApiResponse | null = $state(null);
  let loading = $state(true);
  let error = $state(false);

  function fmtH(v: number | null): string {
    if (v == null) return '–';
    if (v < 24) return `${v.toFixed(1)}h`;
    return `${(v / 24).toFixed(1)}d`;
  }

  function fmtPct(v: number): string {
    return `${v}%`;
  }

  async function fetchData() {
    loading = true;
    error = false;
    try {
      const res = await fetch(`/api/admin/delivery-metrics?window=${window}`, { credentials: 'same-origin' });
      if (!res.ok) { error = true; return; }
      const json = (await res.json()) as ApiResponse;
      data = json;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchData();
  });

  $effect(() => { if (window) void fetchData(); });
</script>

<div class="delivery-section">
  <div class="delivery-header">
    <h3>Lieferhistorie</h3>

  </div>

  {#if loading}
    <div class="delivery-grid">
      {#each Array(5) as _}
        <div class="kpi-skeleton"></div>
      {/each}
    </div>
  {:else if error}
    <div class="delivery-error">
      <span>Fehler beim Laden der Lieferhistorie.</span>
      <button class="retry-btn" onclick={fetchData}>Erneut versuchen</button>
    </div>
  {:else if data}
    <div class="delivery-grid">
      <div class="kpi-card">
        <span class="kpi-value">{data.summary.deliveries}</span>
        <span class="kpi-label">Deliveries</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{data.summary.throughputPerWeek}</span>
        <span class="kpi-label">Ø / Woche</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtH(data.summary.avgHoursTicketToPrOpen)}</span>
        <span class="kpi-label">Ø Ticket → PR</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtH(data.summary.avgHoursPrOpenToMerged)}</span>
        <span class="kpi-label">Ø PR → Merged</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtH(data.summary.avgHoursMergedToLive)}</span>
        <span class="kpi-label">Ø Merged → Live</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtH(data.summary.avgHoursTotal)}</span>
        <span class="kpi-label">Ø Gesamt</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{data.summary.mishapRate != null ? (data.summary.mishapRate * 100).toFixed(0) + '%' : '–'}</span>
        <span class="kpi-label">Mishap-Rate ({data.summary.mishapCount})</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtPct(data.summary.claudePct)}</span>
        <span class="kpi-label">Claude</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-value">{fmtPct(data.summary.deepseekPct)}</span>
        <span class="kpi-label">DeepSeek</span>
      </div>
    </div>

    {#if data.metrics.length === 0}
      <div class="empty-state">Keine Deliveries im Zeitraum.</div>
    {:else}
      <div class="delivery-table-wrap">
        <table class="delivery-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Titel</th>
              <th>PR</th>
              <th>Ticket → PR</th>
              <th>PR → Merged</th>
              <th>Merged → Live</th>
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {#each data.metrics as m}
              <tr>
                <td><a href={m.ticketUrl} class="ticket-link">{m.ticketId}</a></td>
                <td class="title-cell">{m.title}</td>
                <td><a href={m.prUrl} class="pr-link" target="_blank" rel="noopener">#{m.prNumber}</a></td>
                <td class="dur-cell">{fmtH(m.hoursTicketToPrOpen)}</td>
                <td class="dur-cell">{fmtH(m.hoursPrOpenToMerged)}</td>
                <td class="dur-cell">{fmtH(m.hoursMergedToLive)}</td>
                <td class="dur-cell">{fmtH(m.hoursTotal)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<style>
  .delivery-section {
    background: var(--factory-surface, #141414);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius-lg, 0.5rem);
    padding: 1.25rem;
  }

  .delivery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .delivery-header h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: var(--admin-text, #eef1f3);
  }

  .delivery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .kpi-card, .kpi-skeleton {
    background: var(--factory-surface-raised, #1a1a1a);
    border: 1px solid var(--factory-border, #2a2a2a);
    border-radius: var(--factory-radius, 0.375rem);
    padding: 0.75rem;
    text-align: center;
  }

  .kpi-skeleton {
    height: 60px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .kpi-value {
    display: block;
    font-size: 1.25rem;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    color: var(--admin-text, #eef1f3);
  }

  .kpi-label {
    display: block;
    font-size: 10px;
    color: var(--admin-text-mute, #8c96a3);
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .delivery-table-wrap {
    overflow-x: auto;
  }

  .delivery-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .delivery-table th {
    text-align: left;
    padding: 6px 8px;
    font-weight: 600;
    color: var(--admin-text-mute, #8c96a3);
    border-bottom: 1px solid var(--factory-border, #2a2a2a);
    white-space: nowrap;
  }

  .delivery-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--factory-border, #2a2a2a);
    color: var(--admin-text, #eef1f3);
  }

  .title-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dur-cell {
    font-family: var(--font-mono, monospace);
    text-align: right;
    white-space: nowrap;
  }

  .ticket-link {
    color: oklch(0.80 0.09 75);
    text-decoration: none;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
  }
  .ticket-link:hover { text-decoration: underline; }

  .pr-link {
    color: oklch(0.67 0.12 200);
    text-decoration: none;
    font-weight: 500;
  }
  .pr-link:hover { text-decoration: underline; }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--admin-text-mute, #8c96a3);
    font-size: 13px;
  }

  .delivery-error {
    text-align: center;
    padding: 2rem;
    color: var(--factory-error, #ef4444);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .retry-btn {
    padding: 6px 14px;
    font-size: 12px;
    border: 1px solid var(--factory-border, #2a2a2a);
    background: var(--factory-surface-raised, #1a1a1a);
    color: var(--admin-text, #eef1f3);
    border-radius: 4px;
    cursor: pointer;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
