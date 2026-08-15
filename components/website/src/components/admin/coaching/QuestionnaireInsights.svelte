<script lang="ts">
  // T002652 — Semantische Analyse der Questionnaire-Antworten (Admin, Settings).
  // Ruft POST /api/admin/coaching/questionnaire/insights und zeigt die
  // Themen-Cluster mit LLM-Labels. Der 24h-Cache wird beim Anzeigen genutzt;
  // "Neu berechnen" erzwingt mit force=true eine frische Analyse.
  interface InsightCluster {
    label: string | null;
    count: number;
    representativeAnswers: string[];
  }

  interface InsightsResult {
    cached: boolean;
    generatedAt: string;
    embeddingModel: string;
    clusters: InsightCluster[];
  }

  let { initialResult = null }: { initialResult?: InsightsResult | null } = $props();

  let loading = $state(false);
  let error = $state('');
  let result = $state<InsightsResult | null>(initialResult);

  async function analyze(force: boolean) {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/admin/coaching/questionnaire/insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error ?? 'Analyse fehlgeschlagen';
        return;
      }
      result = data as InsightsResult;
    } catch {
      error = 'Analyse fehlgeschlagen — Backend nicht erreichbar';
    } finally {
      loading = false;
    }
  }

  const totalAnswers = $derived(result?.clusters.reduce((n, c) => n + c.count, 0) ?? 0);
</script>

<section class="insights-box">
  <div class="insights-header">
    <h2 class="insights-title">Fragebogen-Insights</h2>
    <div class="insights-actions">
      <button class="btn-ghost-insights" type="button" onclick={() => analyze(true)} disabled={loading}>
        {loading ? 'Analyse läuft…' : 'Neu berechnen'}
      </button>
      <button class="btn-insights" type="button" onclick={() => analyze(false)} disabled={loading}>
        {result ? 'Aktualisieren' : 'Analysieren'}
      </button>
    </div>
  </div>

  {#if error}
    <p class="insights-error">{error}</p>
  {:else if result}
    <p class="insights-meta">
      {result.embeddingModel} · {totalAnswers} Antworten gruppiert
      {#if result.cached}
        · <span class="insights-cached">aus Cache (24h)</span>
      {/if}
      · {new Date(result.generatedAt).toLocaleString('de-DE')}
    </p>
    {#if result.clusters.length === 0}
      <p class="insights-empty">Keine Themen-Cluster gefunden — die Antworten sind zu heterogen oder die Datenmenge ist zu klein.</p>
    {:else}
      <ul class="insights-list">
        {#each result.clusters as cluster}
          <li class="insights-item">
            <div class="insights-item-head">
              <strong>{cluster.label ?? 'Ohne Label (kein lokaler LLM-Provider)'}</strong>
              <span class="insights-count">{cluster.count}</span>
            </div>
            {#if cluster.representativeAnswers.length > 0}
              <ul class="insights-reps">
                {#each cluster.representativeAnswers as answer}
                  <li>{answer}</li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="insights-empty">Antworten semantisch nach Themen gruppieren und mit LLM-Labels versehen.</p>
  {/if}
</section>

<style>
  .insights-box { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 12px; padding: 1.25rem 1.5rem; margin-top: 2rem; }
  .insights-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .insights-title { font-size: 0.85rem; font-weight: 600; color: var(--text-light,#f0f0f0); margin: 0; flex: 1; }
  .insights-actions { display: flex; gap: 0.5rem; }
  .btn-insights { padding: 0.5rem 1.25rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
  .btn-insights:disabled { opacity: 0.5; cursor: wait; }
  .btn-ghost-insights { padding: 0.5rem 0.9rem; border: 1px solid var(--line,#444); border-radius: 6px; color: var(--text-muted,#888); background: none; font-size: 0.85rem; cursor: pointer; }
  .btn-ghost-insights:disabled { opacity: 0.5; cursor: wait; }
  .insights-meta { font-size: 0.78rem; color: var(--text-muted,#888); margin: 0 0 0.9rem; }
  .insights-cached { color: var(--gold,#c9a55c); }
  .insights-empty { font-size: 0.85rem; color: var(--text-muted,#888); }
  .insights-error { font-size: 0.85rem; color: #f87171; }
  .insights-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .insights-item { background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 8px; padding: 0.75rem 1rem; }
  .insights-item-head { display: flex; align-items: center; gap: 0.6rem; justify-content: space-between; }
  .insights-item-head strong { font-size: 0.88rem; color: var(--text-light,#f0f0f0); }
  .insights-count { background: var(--gold,#c9a55c22); color: var(--gold,#c9a55c); border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; }
  .insights-reps { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .insights-reps li { font-size: 0.8rem; color: var(--text-muted,#888); border-left: 2px solid var(--line,#444); padding-left: 0.6rem; }
</style>
