<script lang="ts">
  interface RecentRun {
    ticketId: string;
    externalId: string;
    title: string;
    runDate: string;
    totalCostAct: number;
    totalCostEst: number;
  }

  let { recentRuns, onSelectTicket } = $props<{
    recentRuns: RecentRun[];
    onSelectTicket: (extId: string) => void;
  }>();
</script>

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
            <td>
              <button class="btn-view" onclick={() => onSelectTicket(run.externalId)}>Ansehen</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .card {
    background: var(--admin-bg-light, #1b2330);
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-radius: 6px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .card h2 {
    font-size: 16px;
    margin-top: 0;
    margin-bottom: 1rem;
    font-weight: 600;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    padding-bottom: 0.5rem;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .data-table th {
    text-align: left;
    color: var(--admin-text-mute, #8c96a3);
    font-weight: 500;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .data-table td {
    padding: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }

  .data-table th.num, .data-table td.num {
    text-align: right;
  }

  .no-runs {
    color: var(--admin-text-mute, #8c96a3);
    margin: 0;
    font-size: 13px;
  }

  .font-bold {
    font-weight: 600;
  }

  .font-mono {
    font-family: var(--font-mono, monospace);
  }

  .run-title-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-view {
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    color: var(--admin-text, #eef1f3);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
  }
  .btn-view:hover {
    background: rgba(255,255,255,0.1);
  }
</style>
