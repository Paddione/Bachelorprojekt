<script lang="ts">
  import { onMount } from 'svelte';
  import { getSharedMetrics } from '../../../lib/stores/factory-floor-store';
  import { deriveMetrics, formatCycleTime } from '../../../lib/sdlc/factory-metrics-derive';
  import type { DerivedMetrics } from '../../../lib/sdlc/factory-metrics-derive';

  const WINDOW_DAYS = 7;

  let derived = $state<DerivedMetrics | null>(null);
  let loadError = $state<string | null>(null);
  let loading = $state(true);

  // Kein stiller catch: schlaegt der Abruf fehl, wird das ANGEZEIGT statt als
  // '—' getarnt. Genau diese Tarnung liess den 404 auf /api/factory-metrics
  // wie "keine Daten vorhanden" aussehen [T003459].
  async function loadMetrics() {
    loading = true;
    loadError = null;
    try {
      const payload = await getSharedMetrics(true);
      derived = deriveMetrics(payload.metrics ?? [], WINDOW_DAYS);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      derived = null;
    } finally {
      loading = false;
    }
  }

  onMount(loadMetrics);
</script>

<div class="insights">
  <h2 class="insights__heading">Insights</h2>
  <p class="insights__subtitle">Metriken und Trace-Recording für Finetuning</p>

  <section class="insights__section">
    <h3>Metriken</h3>
    {#if loadError}
      <p class="insights__error" role="alert" data-testid="metrics-error">
        Metriken nicht abrufbar: {loadError}
        <button class="insights__retry" onclick={loadMetrics}>Erneut versuchen</button>
      </p>
    {:else}
      <div class="insights__grid" data-testid="metrics-grid" aria-busy={loading}>
        <div class="metric-card">
          <span class="metric-card__label">Ausgeliefert ({WINDOW_DAYS} Tage)</span>
          <span class="metric-card__value">{derived ? derived.shipped : '—'}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Ø Zeit Planung → Done</span>
          <span class="metric-card__value">{formatCycleTime(derived?.avgCycleTimeH ?? null)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Eskalationen ({WINDOW_DAYS} Tage)</span>
          <span class="metric-card__value">{derived ? derived.escalations : '—'}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Tage mit Daten</span>
          <span class="metric-card__value">{derived ? `${derived.daysCovered}/${WINDOW_DAYS}` : '—'}</span>
        </div>
      </div>
    {/if}
  </section>

  <section class="insights__section">
    <h3>Trace-Recording</h3>
    <p class="insights__subtitle">
      Soll Agent-Entscheidungen und Factory-Durchl&auml;ufe für Finetuning
      aufzeichnen und in der Ticket-Datenbank persistieren.
    </p>

    <!--
      [T003459] Der Schalter ist deaktiviert, nicht entfernt. Er schaltete
      bisher nur eine lokale Variable um und zeigte dann "Recording laeuft" an,
      ohne dass irgendetwas aufgezeichnet oder persistiert wurde — eine
      Zusicherung, die die Oberflaeche nicht einloesen konnte. Ein sichtbar
      deaktivierter Schalter mit Begruendung ist ehrlicher als ein Knopf, der
      Aufzeichnung vortaeuscht. Die geplante Datenform bleibt als Zielbild.
    -->
    <div class="trace-controls">
      <button class="trace-toggle" disabled data-testid="trace-toggle">
        ▶ Aufzeichnung starten
      </button>
      <span class="trace-count" data-testid="trace-status">
        Noch nicht implementiert — es gibt keinen Endpunkt, der Traces entgegennimmt.
      </span>
    </div>

    <div class="trace-info">
      <p><strong>Geplante Datenform:</strong></p>
      <ul>
        <li>Ticket-ID &amp; Agent-Modell</li>
        <li>Phase (scout, design, plan, implement, verify, deploy)</li>
        <li>Dauer (ms) &amp; Ergebnis (success/failure/blocked)</li>
        <li>Fehlermeldung (wenn fehlgeschlagen)</li>
      </ul>
    </div>
  </section>

  <section class="insights__section">
    <h3>Kosten</h3>
    <p class="insights__subtitle">
      Kosten-Tracking wurde als Metrik in Insights integriert (von KostenTab &uuml;bernommen).
    </p>
  </section>
</div>

<style>
  .insights {
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
  }

  .insights__heading {
    font-size: var(--admin-text-xl, 1.25rem);
    color: var(--admin-text, #ccd6f6);
    margin: 0 0 0.25rem;
    font-family: var(--admin-font-mono, monospace);
  }

  .insights__subtitle {
    color: var(--admin-text-mute, #555);
    font-size: var(--admin-text-sm, 0.85rem);
    margin: 0 0 1.5rem;
  }

  .insights__section {
    margin-bottom: 2rem;
  }

  .insights__section h3 {
    font-size: var(--admin-text-md, 0.95rem);
    color: var(--admin-text-secondary, #8892b0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem;
    font-family: var(--admin-font-mono, monospace);
  }

  .insights__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .metric-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 1rem;
    background: var(--admin-surface, rgba(255,255,255,0.03));
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-radius: var(--admin-radius-md, 8px);
  }

  .metric-card__label {
    font-size: var(--admin-text-xs, 0.7rem);
    color: var(--admin-text-mute, #555);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--admin-font-mono, monospace);
  }

  .metric-card__value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--admin-text, #ccd6f6);
    font-family: var(--admin-font-mono, monospace);
  }

  .trace-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .trace-toggle {
    padding: 0.5rem 1.25rem;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius-sm, 4px);
    color: var(--admin-text);
    cursor: pointer;
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-sm);
    transition: background 0.15s;
  }

  .trace-toggle:hover:not(:disabled) {
    background: var(--admin-surface-hover);
  }

  /* Bewusst deaktiviert [T003459] — sichtbar ausgegraut, damit niemand eine
     Funktion erwartet, die es noch nicht gibt. */
  .trace-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .insights__error {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border: 1px solid var(--admin-error, #d77a6e);
    border-radius: var(--admin-radius-sm, 4px);
    background: oklch(0.62 0.20 25 / 0.08);
    color: var(--admin-error, #d77a6e);
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-sm);
  }

  .insights__retry {
    padding: 0.25rem 0.75rem;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: var(--admin-radius-sm, 4px);
    color: inherit;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }

  .trace-count {
    font-family: var(--admin-font-mono, monospace);
    color: var(--admin-text-secondary);
    font-size: var(--admin-text-sm);
  }

  .trace-info {
    padding: 1rem;
    background: var(--admin-surface, rgba(255,255,255,0.03));
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-radius: var(--admin-radius-md, 8px);
  }

  .trace-info p {
    margin: 0 0 0.5rem;
    color: var(--admin-text);
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-sm);
  }

  .trace-info ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--admin-text-secondary);
    font-size: var(--admin-text-xs);
  }

  .trace-info li {
    margin-bottom: 0.25rem;
  }
</style>
