<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Health = 'green' | 'yellow' | 'red';
  interface Data {
    health: Record<string, Health>;
    last24h: { hour: string; calls: number; errors: number; avg_latency_ms: number }[];
    byWorkflow: { workflow: string; calls: number; error_rate: number; avg_latency_ms: number;
                  p95_latency_ms: number; total_tokens: number; est_cost_eur: number }[];
    recentErrors: { ts: string; workflow: string; model: string | null; error: string }[];
  }

  let data = $state<Data | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let histOpen = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const res = await fetch('/api/admin/ai-quality');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  const dotClass = (h: Health) => (h === 'green' ? 'dot-green' : h === 'yellow' ? 'dot-yellow' : 'dot-red');
  const maxCalls = $derived(Math.max(1, ...(data?.last24h.map((b) => b.calls) ?? [1])));
  const barColor = (errors: number, calls: number) => {
    const r = calls ? errors / calls : 0;
    return r < 0.05 ? '#3ba55d' : r < 0.2 ? '#d9a300' : '#d83c3c';
  };

  onMount(() => {
    try { histOpen = localStorage.getItem('ai-quality:24h-open') === '1'; } catch { /* ignore */ }
    void load();
    timer = setInterval(() => void load(), 60_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  function toggleHist() {
    histOpen = !histOpen;
    try { localStorage.setItem('ai-quality:24h-open', histOpen ? '1' : '0'); } catch { /* ignore */ }
  }
</script>

<div class="ai-quality">
  {#if loading}
    <p class="muted">Lade KI-Qualitätsdaten…</p>
  {:else if error}
    <p class="err">Fehler: {error}</p>
  {:else if data}
    <section class="health">
      {#each data.byWorkflow.length ? data.byWorkflow : Object.keys(data.health).map((w) => ({ workflow: w, avg_latency_ms: 0, error_rate: 0, calls: 0, p95_latency_ms: 0, total_tokens: 0, est_cost_eur: 0 })) as wf}
        <div class="health-row" title={`p95 ${wf.p95_latency_ms}ms`}>
          <span class="dot {dotClass(data.health[wf.workflow] ?? 'yellow')}"></span>
          <span class="wf">{wf.workflow}</span>
          <span class="lat">{wf.avg_latency_ms}ms</span>
          <span class="err-rate">{(wf.error_rate * 100).toFixed(1)}% err</span>
        </div>
      {/each}
    </section>

    <section class="hist">
      <button class="hist-toggle" onclick={toggleHist}>
        {histOpen ? '▾' : '▸'} 24h-Verlauf
      </button>
      {#if histOpen}
        <div class="bars">
          {#each data.last24h as b}
            <div class="bar"
                 style={`height:${Math.round((b.calls / maxCalls) * 100)}%;background:${barColor(b.errors, b.calls)}`}
                 title={`${b.calls} Calls, ${b.errors} Fehler, ⌀${b.avg_latency_ms}ms`}></div>
          {/each}
          {#if !data.last24h.length}<span class="muted">keine Daten</span>{/if}
        </div>
      {/if}
    </section>

    <section class="cost">
      <h4>Kosten 7 Tage</h4>
      <table>
        <thead><tr><th>Workflow</th><th>Calls</th><th>Tokens</th><th>EUR</th></tr></thead>
        <tbody>
          {#each data.byWorkflow as wf}
            <tr>
              <td>{wf.workflow}</td>
              <td>{wf.calls}</td>
              <td>{wf.total_tokens.toLocaleString('de-DE')}</td>
              <td>{wf.est_cost_eur > 0 ? wf.est_cost_eur.toFixed(2) : '—'}</td>
            </tr>
          {/each}
          {#if !data.byWorkflow.length}<tr><td colspan="4" class="muted">keine Daten</td></tr>{/if}
        </tbody>
      </table>
    </section>

    {#if data.recentErrors.length}
      <section class="errors">
        <h4>Fehler</h4>
        {#each data.recentErrors as e}
          <div class="err-item">
            <span class="err-meta">{new Date(e.ts).toLocaleTimeString('de-DE')} {e.workflow}</span>
            <span class="err-msg">{e.error}</span>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .ai-quality { display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem; font-size: 0.85rem; }
  .muted { color: #888; }
  .err { color: #d83c3c; }
  .health-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.15rem 0; }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; display: inline-block; }
  .dot-green { background: #3ba55d; }
  .dot-yellow { background: #d9a300; }
  .dot-red { background: #d83c3c; }
  .wf { flex: 1; }
  .lat, .err-rate { font-variant-numeric: tabular-nums; color: #aaa; }
  .hist-toggle { background: none; border: none; color: inherit; cursor: pointer; padding: 0; font: inherit; }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 60px; margin-top: 0.4rem; }
  .bar { flex: 1; min-height: 2px; border-radius: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.2rem 0.3rem; }
  td:nth-child(n+2), th:nth-child(n+2) { text-align: right; font-variant-numeric: tabular-nums; }
  .err-item { display: flex; flex-direction: column; padding: 0.3rem 0; border-top: 1px solid #2a2a2a; }
  .err-meta { color: #d83c3c; font-size: 0.78rem; }
  .err-msg { color: #ccc; word-break: break-word; }
</style>
