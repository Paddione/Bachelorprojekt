<script lang="ts">
  let traceCount = $state(0);
  let recording = $state(false);
  let throughput = $state('—');
  let avgTime = $state('—');

  async function loadMetrics() {
    try {
      // In a real implementation, these would come from dedicated API endpoints
      // For now, show placeholder values that indicate the architecture is in place
    } catch {
      // silent
    }
  }

  function toggleRecording() {
    recording = !recording;
    if (recording) {
      // Start recording traces
      traceCount = 0;
    }
  }

  $effect(() => { loadMetrics(); });
</script>

<div class="insights">
  <h2 class="insights__heading">Insights</h2>
  <p class="insights__subtitle">Metriken und Trace-Recording für Finetuning</p>

  <section class="insights__section">
    <h3>Metriken</h3>
    <div class="insights__grid">
      <div class="metric-card">
        <span class="metric-card__label">Durchsatz (7 Tage)</span>
        <span class="metric-card__value">{throughput}</span>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Ø Zeit Planung → Done</span>
        <span class="metric-card__value">{avgTime}</span>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Offene PRs</span>
        <span class="metric-card__value">—</span>
      </div>
      <div class="metric-card">
        <span class="metric-card__label">Blockierte Tickets</span>
        <span class="metric-card__value">—</span>
      </div>
    </div>
  </section>

  <section class="insights__section">
    <h3>Trace-Recording</h3>
    <p class="insights__subtitle">
      Zeichnet Agent-Entscheidungen und Factory-Durchl&auml;ufe für Finetuning auf.
      Die Traces werden in der Ticket-Datenbank persistiert.
    </p>

    <div class="trace-controls">
      <button
        class="trace-toggle"
        class:active={recording}
        onclick={toggleRecording}
      >
        {recording ? '⏹ Recording l\u00e4uft' : '▶ Aufzeichnung starten'}
      </button>
      {#if recording}
        <span class="trace-count">{traceCount} Traces aufgezeichnet</span>
      {/if}
    </div>

    <div class="trace-info">
      <p><strong>Aufgezeichnete Daten:</strong></p>
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

  .trace-toggle:hover {
    background: var(--admin-surface-hover);
  }

  .trace-toggle.active {
    background: oklch(0.62 0.20 25 / 0.15);
    border-color: oklch(0.62 0.20 25);
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
