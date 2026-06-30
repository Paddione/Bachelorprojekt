<script lang="ts">
  import { onMount } from 'svelte';

  interface ProviderBudget {
    provider: string;
    tokensInAct: number;
    tokensOutAct: number;
    costUsdAct: number;
    tokensInEst: number;
    tokensOutEst: number;
    costUsdEst: number;
  }

  interface BudgetSummary {
    used: number;
    limit: number | null;
    byProvider: ProviderBudget[];
  }

  interface RecentRun {
    ticketId: string;
    externalId: string;
    title: string;
    runDate: string;
    totalCostAct: number;
    totalCostEst: number;
  }

  let loading = $state(true);
  let error = $state('');
  let summary = $state<BudgetSummary | null>(null);
  let recentRuns = $state<RecentRun[]>([]);

  async function loadData() {
    try {
      loading = true;
      error = '';
      
      const [summaryRes, recentRes] = await Promise.all([
        fetch('/api/factory-budget'),
        fetch('/api/factory-budget?recent=true')
      ]);

      if (!summaryRes.ok || !recentRes.ok) {
        throw new Error('Fehler beim Laden der Budget-Daten');
      }

      summary = await summaryRes.json();
      recentRuns = await recentRes.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  const percent = $derived.by(() => {
    if (!summary || !summary.limit) return 0;
    return Math.min(100, (summary.used / summary.limit) * 100);
  });
</script>

<div class="budget-panel card">
  <div class="card-header">
    <h3>Token Budget (Heute)</h3>
    <button class="btn-refresh" onclick={loadData} title="Aktualisieren">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
    </button>
  </div>

  {#if loading}
    <div class="state-msg">Lade Budget...</div>
  {:else if error}
    <div class="state-msg error">{error}</div>
  {:else if summary}
    <div class="summary-section">
      <div class="progress-wrap">
        <div class="progress-labels">
          <span class="used-val">{summary.used.toFixed(4)} USD</span>
          <span class="limit-val">
            Limit: {summary.limit !== null ? `${summary.limit.toFixed(2)} USD` : 'Kein Limit'}
          </span>
        </div>
        {#if summary.limit !== null}
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: {percent}%" class:danger={percent >= 90} class:warning={percent >= 75 && percent < 90}></div>
          </div>
        {/if}
      </div>

      {#if summary.byProvider.length > 0}
        <div class="provider-breakdown">
          <h4>Provider-Aufteilung</h4>
          <table class="provider-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th class="num">Tokens (In/Out)</th>
                <th class="num">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {#each summary.byProvider as prov}
                <tr>
                  <td><span class="provider-badge {prov.provider}">{prov.provider}</span></td>
                  <td class="num font-mono">{(prov.tokensInAct + prov.tokensOutAct).toLocaleString()}</td>
                  <td class="num font-mono">{prov.costUsdAct.toFixed(4)} USD</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="recent-runs">
        <div class="section-title-wrap">
          <h4>Letzte 5 Ticket-Runs</h4>
          <a class="admin-link" href="/admin/factory-budget">Details</a>
        </div>
        {#if recentRuns.length === 0}
          <p class="no-runs">Keine Runs erfasst.</p>
        {:else}
          <ul class="runs-list">
            {#each recentRuns as run}
              <li class="run-item">
                <div class="run-info">
                  <span class="run-ticket font-mono">{run.externalId}</span>
                  <span class="run-title">{run.title}</span>
                </div>
                <div class="run-cost font-mono" title="Ist / Soll-Schätzung">
                  {run.totalCostAct.toFixed(4)} USD
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .budget-panel {
    background: var(--admin-bg-light, #1b2330);
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-radius: 6px;
    padding: 1.25rem;
    color: var(--admin-text, #eef1f3);
    font-family: var(--font-sans, inherit);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    padding-bottom: 0.5rem;
  }

  .card-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .btn-refresh {
    background: transparent;
    border: none;
    color: var(--admin-text-mute, #8c96a3);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: background 0.15s, color 0.15s;
  }
  .btn-refresh:hover {
    background: rgba(255,255,255,0.05);
    color: var(--admin-text, #eef1f3);
  }

  .state-msg {
    text-align: center;
    padding: 1.5rem 0;
    color: var(--admin-text-mute, #8c96a3);
    font-size: 13px;
  }
  .state-msg.error {
    color: var(--red, #ef4444);
  }

  .progress-wrap {
    margin-bottom: 1.25rem;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 0.5rem;
  }

  .used-val {
    font-weight: 600;
    font-size: 15px;
    color: var(--admin-primary, #818cf8);
  }

  .limit-val {
    color: var(--admin-text-mute, #8c96a3);
  }

  .progress-bar-bg {
    background: rgba(255,255,255,0.08);
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    background: var(--admin-primary, #818cf8);
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-bar-fill.warning {
    background: var(--yellow, #f59e0b);
  }

  .progress-bar-fill.danger {
    background: var(--red, #ef4444);
  }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--admin-text-mute, #8c96a3);
  }

  .provider-breakdown {
    margin-bottom: 1.25rem;
  }

  .provider-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .provider-table th {
    text-align: left;
    color: var(--admin-text-mute, #8c96a3);
    font-weight: 500;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  .provider-table td {
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }

  .provider-table th.num, .provider-table td.num {
    text-align: right;
  }

  .font-mono {
    font-family: var(--font-mono, monospace);
  }

  .provider-badge {
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(255,255,255,0.08);
  }
  .provider-badge.anthropic {
    background: rgba(217, 119, 6, 0.15);
    color: #f59e0b;
  }
  .provider-badge.deepseek {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }
  .provider-badge.gpu {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .section-title-wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .admin-link {
    font-size: 12px;
    color: var(--admin-primary, #818cf8);
    text-decoration: none;
  }
  .admin-link:hover {
    text-decoration: underline;
  }

  .no-runs {
    font-size: 12px;
    color: var(--admin-text-mute, #8c96a3);
    margin: 0;
  }

  .runs-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .run-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 12px;
  }

  .run-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .run-ticket {
    font-weight: 600;
    color: var(--admin-text, #eef1f3);
  }

  .run-title {
    color: var(--admin-text-mute, #8c96a3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  .run-cost {
    font-weight: 600;
  }
</style>
