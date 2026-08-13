<script lang="ts">
  // T002653 — LLM-Zusammenfassung einer Coaching-Session (Admin, Session-Seite).
  // POST /api/admin/coaching/sessions/:id/summary — idempotent: eine vorhandene
  // Zusammenfassung wird ohne force=true nicht neu generiert.
  let {
    sessionId,
    initialSummary = null,
    initialGeneratedAt = null,
  }: {
    sessionId: string;
    initialSummary: string | null;
    initialGeneratedAt: string | null;
  } = $props();

  let loading = $state(false);
  let error = $state('');
  let summary = $state(initialSummary);
  let generatedAt = $state(initialGeneratedAt);
  let cached = $state(false);

  async function generate(force: boolean) {
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error ?? 'Zusammenfassung fehlgeschlagen';
        return;
      }
      summary = data.summary ?? summary;
      generatedAt = data.generatedAt ?? generatedAt;
      cached = data.cached === true;
    } catch {
      error = 'Zusammenfassung fehlgeschlagen — Backend nicht erreichbar';
    } finally {
      loading = false;
    }
  }
</script>

<section class="summary-box">
  <div class="summary-header">
    <h2 class="summary-title">Session-Zusammenfassung</h2>
    <div class="summary-actions">
      <button
        class="btn-ghost-summary"
        type="button"
        onclick={() => generate(true)}
        disabled={loading || !summary}
      >
        Neu generieren
      </button>
      <button class="btn-summary" type="button" onclick={() => generate(false)} disabled={loading}>
        {loading ? 'Generierung läuft…' : summary ? 'Aktualisieren' : 'Zusammenfassung erstellen'}
      </button>
    </div>
  </div>

  {#if error}
    <p class="summary-error">{error}</p>
  {:else if summary}
    <p class="summary-meta">
      {#if cached}
        <span class="summary-cached">aus Cache</span> ·
      {/if}
      {generatedAt ? new Date(generatedAt).toLocaleString('de-DE') : ''}
    </p>
    <div class="summary-body">{summary}</div>
  {:else}
    <p class="summary-empty">Verdichtet KI-Antworten und Coaching-Notizen aller Schritte zu einer Zusammenfassung.</p>
  {/if}
</section>

<style>
  .summary-box { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 12px; padding: 1.25rem 1.5rem; margin-top: 2rem; }
  .summary-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .summary-title { font-size: 0.85rem; font-weight: 600; color: var(--text-light,#f0f0f0); margin: 0; flex: 1; }
  .summary-actions { display: flex; gap: 0.5rem; }
  .btn-summary { padding: 0.5rem 1.25rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
  .btn-summary:disabled { opacity: 0.5; cursor: wait; }
  .btn-ghost-summary { padding: 0.5rem 0.9rem; border: 1px solid var(--line,#444); border-radius: 6px; color: var(--text-muted,#888); background: none; font-size: 0.85rem; cursor: pointer; }
  .btn-ghost-summary:disabled { opacity: 0.5; cursor: wait; }
  .summary-meta { font-size: 0.78rem; color: var(--text-muted,#888); margin: 0 0 0.7rem; }
  .summary-cached { color: var(--gold,#c9a55c); }
  .summary-body { font-size: 0.88rem; line-height: 1.55; color: var(--text-light,#f0f0f0); white-space: pre-wrap; }
  .summary-empty { font-size: 0.85rem; color: var(--text-muted,#888); }
  .summary-error { font-size: 0.85rem; color: #f87171; }
</style>
