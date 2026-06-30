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

  interface PhaseBudgetRow {
    id: string;
    phase: string;
    provider: string;
    modelId: string;
    tokensInEst: number | null;
    tokensOutEst: number | null;
    costUsdEst: number | null;
    tokensInAct: number | null;
    tokensOutAct: number | null;
    costUsdAct: number | null;
  }

  let loading = $state(true);
  let error = $state('');
  let summary = $state<BudgetSummary | null>(null);
  let recentRuns = $state<RecentRun[]>([]);
  let limitInput = $state('');
  let saveSuccess = $state(false);
  let saveError = $state('');
  let saving = $state(false);
  let ticketSearchId = $state('');
  let searchingTicket = $state(false);
  let ticketRows = $state<PhaseBudgetRow[]>([]);
  let ticketSearchError = $state('');

  async function loadData() {
    try {
      loading = true; error = '';
      const [sRes, rRes] = await Promise.all([fetch('/api/factory-budget'), fetch('/api/factory-budget?recent=true')]);
      if (!sRes.ok || !rRes.ok) throw new Error('Fehler beim Laden');
      summary = await sRes.json();
      recentRuns = await rRes.json();
      if (summary) limitInput = summary.limit !== null ? summary.limit.toString() : '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  async function saveLimit(e: Event) {
    e.preventDefault();
    try {
      saving = true; saveSuccess = false; saveError = '';
      const parsed = parseFloat(limitInput);
      if (isNaN(parsed) || parsed < 0) throw new Error('Ungültiges Limit');
      const res = await fetch('/api/factory-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: parsed })
      });
      if (!res.ok) throw new Error('Fehler beim Speichern');
      saveSuccess = true;
      if (summary) summary.limit = parsed;
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Fehler beim Speichern';
    } finally {
      saving = false;
    }
  }

  async function searchTicket(e: Event) {
    e.preventDefault();
    if (!ticketSearchId.trim()) return;
    try {
      searchingTicket = true; ticketSearchError = ''; ticketRows = [];
      const res = await fetch(`/api/factory-budget?ticketId=${encodeURIComponent(ticketSearchId.trim())}`);
      if (!res.ok) throw new Error('Ticket nicht gefunden');
      ticketRows = await res.json();
      if (ticketRows.length === 0) ticketSearchError = 'Keine Budgetdaten gefunden.';
    } catch (err) {
      ticketSearchError = err instanceof Error ? err.message : 'Fehler bei der Suche';
    } finally {
      searchingTicket = false;
    }
  }

  onMount(() => { loadData(); });
  const percent = $derived(summary && summary.limit ? Math.min(100, (summary.used / summary.limit) * 100) : 0);
</script>

<div class="factory-budget-page">
  <header class="page-header">
    <h1>Software Factory Token-Budget-Leitstand</h1>
    <a href="/dev-status" class="btn-back">Zurück zu Dev Status</a>
  </header>

  {#if loading}
    <div class="page-loading">Lade Budget-Daten...</div>
  {:else if error}
    <div class="error-banner">{error}</div>
  {:else if summary}
    <div class="dashboard-grid">
      <div class="col-left">
        <div class="card limit-card">
          <h2>Tages-Budget-Limit</h2>
          <form onsubmit={saveLimit} class="limit-form">
            <div class="input-group">
              <input type="number" step="0.01" min="0" bind:value={limitInput} placeholder="Unbegrenzt" />
              <span class="currency-label">USD</span>
            </div>
            <button type="submit" class="btn-save" disabled={saving}>{saving ? 'Speichert...' : 'Speichern'}</button>
          </form>
          {#if saveSuccess}<p class="success-msg">Limit gespeichert!</p>{/if}
          {#if saveError}<p class="error-msg">{saveError}</p>{/if}
        </div>

        <div class="card summary-card">
          <h2>Tages-Übersicht</h2>
          <div class="progress-wrap">
            <div class="progress-labels">
              <span class="used-val">{summary.used.toFixed(4)} USD verbraucht</span>
              <span class="limit-val">Limit: {summary.limit !== null ? `${summary.limit.toFixed(2)} USD` : 'Kein Limit'}</span>
            </div>
            {#if summary.limit !== null}
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: {percent}%" class:danger={percent >= 90} class:warning={percent >= 75 && percent < 90}></div>
              </div>
            {/if}
          </div>

          {#if summary.byProvider.length > 0}
            <div class="provider-breakdown">
              <h3>Kosten nach Provider</h3>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th class="num">Est. Tokens</th>
                    <th class="num">Act. Tokens</th>
                    <th class="num">Est. Kosten</th>
                    <th class="num">Act. Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {#each summary.byProvider as prov}
                    <tr>
                      <td><span class="provider-badge {prov.provider}">{prov.provider}</span></td>
                      <td class="num font-mono">{(prov.tokensInEst + prov.tokensOutEst).toLocaleString()}</td>
                      <td class="num font-mono">{(prov.tokensInAct + prov.tokensOutAct).toLocaleString()}</td>
                      <td class="num font-mono">{prov.costUsdEst.toFixed(4)} USD</td>
                      <td class="num font-mono">{prov.costUsdAct.toFixed(4)} USD</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <div class="col-right">
        <div class="card search-card">
          <h2>Ticket-Detailkosten abfragen</h2>
          <form onsubmit={searchTicket} class="search-form">
            <input type="text" bind:value={ticketSearchId} placeholder="Ticket ID (z.B. T000001)" />
            <button type="submit" class="btn-search" disabled={searchingTicket}>{searchingTicket ? 'Sucht...' : 'Suchen'}</button>
          </form>
          {#if ticketSearchError}<p class="error-msg">{ticketSearchError}</p>{/if}

          {#if ticketRows.length > 0}
            <div class="ticket-results">
              <h3>Phasen-Aufschlüsselung</h3>
              <table class="data-table ticket-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Modell</th>
                    <th class="num">Est. Tokens</th>
                    <th class="num">Act. Tokens</th>
                    <th class="num">Est. Kosten</th>
                    <th class="num">Act. Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {#each ticketRows as row}
                    <tr>
                      <td class="phase-name">{row.phase}</td>
                      <td>
                        <span class="provider-badge {row.provider}">{row.provider}</span>
                        <span class="model-id font-mono">{row.modelId}</span>
                      </td>
                      <td class="num font-mono">{row.tokensInEst !== null ? (row.tokensInEst + (row.tokensOutEst ?? 0)).toLocaleString() : '-'}</td>
                      <td class="num font-mono">{row.tokensInAct !== null ? (row.tokensInAct + (row.tokensOutAct ?? 0)).toLocaleString() : '-'}</td>
                      <td class="num font-mono">{row.costUsdEst !== null ? `${row.costUsdEst.toFixed(4)} USD` : '-'}</td>
                      <td class="num font-mono">{row.costUsdAct !== null ? `${row.costUsdAct.toFixed(4)} USD` : '-'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <div class="card recent-card">
          <h2>Letzte Ticket-Runs</h2>
          {#if recentRuns.length === 0}
            <p class="no-runs">Keine Runs erfasst.</p>
          {:else}
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Titel</th>
                  <th class="num">Est. Kosten</th>
                  <th class="num">Act. Kosten</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {#each recentRuns as run}
                  <tr>
                    <td class="font-mono font-bold">{run.externalId}</td>
                    <td class="run-title-cell" title={run.title}>{run.title}</td>
                    <td class="num font-mono">{run.totalCostEst.toFixed(4)} USD</td>
                    <td class="num font-mono">{run.totalCostAct.toFixed(4)} USD</td>
                    <td><button class="btn-view" onclick={() => { ticketSearchId = run.externalId; searchTicket(new CustomEvent('submit')); }}>Ansehen</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .factory-budget-page { padding: 2rem; max-width: 1400px; margin: 0 auto; color: var(--admin-text, #eef1f3); font-family: var(--font-sans, inherit); }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
  .page-header h1 { font-size: 24px; margin: 0; font-weight: 700; }
  .btn-back { background: rgba(255,255,255,0.06); border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); color: var(--admin-text, #eef1f3); text-decoration: none; padding: 8px 16px; border-radius: 4px; font-size: 13px; transition: background 0.15s; }
  .btn-back:hover { background: rgba(255,255,255,0.1); }
  .page-loading { text-align: center; padding: 4rem 0; color: var(--admin-text-mute, #8c96a3); }
  .error-banner { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 1rem; border-radius: 6px; color: #fca5a5; margin-bottom: 2rem; }
  .dashboard-grid { display: grid; grid-template-cols: 1fr; gap: 1.5rem; }
  @media (min-width: 1024px) { .dashboard-grid { grid-template-cols: 1fr 1fr; } }
  .card { background: var(--admin-bg-light, #1b2330); border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); border-radius: 6px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .card h2 { font-size: 16px; margin-top: 0; margin-bottom: 1rem; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem; }
  .card h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--admin-text-mute, #8c96a3); margin-top: 1.5rem; margin-bottom: 0.75rem; }
  .limit-form { display: flex; gap: 1rem; align-items: center; }
  .input-group { display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); border-radius: 4px; padding-right: 12px; flex: 1; }
  .input-group input { background: transparent; border: none; padding: 10px 12px; color: var(--admin-text, #eef1f3); font-size: 14px; width: 100%; outline: none; }
  .currency-label { color: var(--admin-text-mute, #8c96a3); font-weight: 600; font-size: 12px; }
  .btn-save, .btn-search { background: var(--admin-primary, #818cf8); color: #121820; border: none; padding: 10px 20px; border-radius: 4px; font-weight: 600; font-size: 14px; cursor: pointer; transition: opacity 0.15s; }
  .btn-save:hover, .btn-search:hover { opacity: 0.9; }
  .btn-save:disabled, .btn-search:disabled { opacity: 0.5; cursor: not-allowed; }
  .success-msg { color: #10b981; font-size: 13px; margin: 0.75rem 0 0 0; }
  .error-msg { color: #ef4444; font-size: 13px; margin: 0.75rem 0 0 0; }
  .progress-wrap { margin-bottom: 1.5rem; }
  .progress-labels { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 0.5rem; }
  .used-val { font-weight: 700; font-size: 16px; color: var(--admin-primary, #818cf8); }
  .limit-val { color: var(--admin-text-mute, #8c96a3); }
  .progress-bar-bg { background: rgba(255,255,255,0.08); height: 8px; border-radius: 4px; overflow: hidden; }
  .progress-bar-fill { background: var(--admin-primary, #818cf8); height: 100%; border-radius: 4px; transition: width 0.3s ease; }
  .progress-bar-fill.warning { background: #f59e0b; }
  .progress-bar-fill.danger { background: #ef4444; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; color: var(--admin-text-mute, #8c96a3); font-weight: 500; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .data-table td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .data-table th.num, .data-table td.num { text-align: right; }
  .provider-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.08); display: inline-block; }
  .provider-badge.anthropic { background: rgba(217, 119, 6, 0.15); color: #f59e0b; }
  .provider-badge.deepseek { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
  .provider-badge.gpu { background: rgba(16, 185, 129, 0.15); color: #10b981; }
  .search-form { display: flex; gap: 1rem; margin-bottom: 1rem; }
  .search-form input { background: rgba(0,0,0,0.2); border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); border-radius: 4px; padding: 10px 12px; color: var(--admin-text, #eef1f3); font-size: 14px; flex: 1; outline: none; }
  .ticket-results { margin-top: 1.5rem; overflow-x: auto; }
  .ticket-table td { white-space: nowrap; }
  .phase-name { text-transform: capitalize; font-weight: 600; }
  .model-id { color: var(--admin-text-mute, #8c96a3); font-size: 11px; margin-left: 6px; }
  .no-runs { color: var(--admin-text-mute, #8c96a3); margin: 0; font-size: 13px; }
  .font-bold { font-weight: 600; }
  .run-title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-view { background: rgba(255,255,255,0.06); border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); color: var(--admin-text, #eef1f3); padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 500; transition: background 0.15s; }
  .btn-view:hover { background: rgba(255,255,255,0.1); }
</style>
