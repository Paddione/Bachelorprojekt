<script lang="ts">
  import { buildProtocol } from '../../../lib/coaching-report';
  import { STEP_DEFINITIONS } from '../../../lib/coaching-session-prompts';
  import type { Session } from '../../../lib/coaching-session-db';
  import type { ProtocolStep } from '../../../lib/coaching-report';

  let { session, clientName, providerName }: {
    session: Session;
    clientName: string;
    providerName: string;
  } = $props();

  const PHASE_COLOR: Record<string, string> = {
    problem_ziel: '#3b82f6',
    analyse: '#f97316',
    loesung: '#22c55e',
    umsetzung: '#a855f7',
  };

  const PHASE_BG: Record<string, string> = {
    problem_ziel: '#1e3a5f',
    analyse: '#4a2c14',
    loesung: '#143d24',
    umsetzung: '#2d1b4e',
  };

  const summary = $derived<string>(
    session.steps.find((s) => s.stepNumber === 0)?.beats?.[0]?.aiResponse ?? '—'
  );

  const protocol = $derived<ProtocolStep[]>(
    buildProtocol(session.steps, STEP_DEFINITIONS)
  );

  const dateStr = $derived(
    session.completedAt
      ? new Date(session.completedAt).toLocaleDateString('de-DE', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
      : '—'
  );

  function triggerPrint() {
    window.print();
  }

  function downloadHtml() {
    const html = document.getElementById('report-content')?.outerHTML ?? '';
    const styled = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Coaching-Bericht</title>
<style>
body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.6; }
h1 { font-size: 1.6rem; border-bottom: 2px solid #c9a55c; padding-bottom: 0.5rem; }
h2 { font-size: 1.2rem; margin-top: 1.5rem; color: #333; }
.phase-tag { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; color: #fff; font-weight: 600; }
.quote { background: #f5f5f5; border-left: 3px solid #3b82f6; padding: 0.6rem 1rem; margin: 0.5rem 0; border-radius: 0 6px 6px 0; }
.quote-label { font-size: 0.72rem; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.ki-box { background: #f0f4ff; border-left: 3px solid #3b82f6; padding: 0.6rem 1rem; margin: 0.5rem 0; border-radius: 0 6px 6px 0; }
.ki-label { font-size: 0.72rem; color: #3b82f6; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.summary { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
.meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
</style></head><body>${html}</body></html>`;
    const blob = new Blob([styled], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coaching-bericht-${session.title.replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function phaseColor(phase: string): string {
    return PHASE_COLOR[phase] ?? '#666';
  }

  function phaseBg(phase: string): string {
    return PHASE_BG[phase] ?? '#222';
  }
</script>

<div class="report-container">
  <!-- Download-Action-Bar -->
  <div class="action-bar">
    <h2 class="action-title">Coaching-Bericht</h2>
    <div class="action-buttons">
      <button class="btn" onclick={downloadHtml}>HTML herunterladen</button>
      <button class="btn btn-primary" onclick={triggerPrint}>PDF drucken</button>
    </div>
  </div>

  <!-- Report Content -->
  <div id="report-content" class="report-content">
    <header class="report-header">
      <h1>Coaching-Bericht: {session.title}</h1>
      <div class="report-meta">
        <span>Klient: {clientName}</span>
        <span>Datum: {dateStr}</span>
        <span>KI-Provider: {providerName}</span>
      </div>
    </header>

    {#if summary && summary !== '—'}
      <section class="summary-section">
        <h2>Executive Summary</h2>
        <div class="summary-body">{summary}</div>
      </section>
    {/if}

    <section class="protocol-section">
      <h2>Vollständiges Protokoll</h2>
      {#each protocol as step}
        <div
          class="step-card"
          style="border-left-color: {phaseColor(step.phase)}; background: {phaseBg(step.phase)}"
        >
          <div class="step-header">
            <span
              class="phase-tag"
              style="background: {phaseColor(step.phase)}"
            >
              {step.phaseLabel}
            </span>
            <span class="step-title">
              Schritt {step.stepNumber}: {step.stepName}
            </span>
          </div>
          <div class="step-entries">
            {#each step.entries as entry}
              {#if entry.kind === 'quote'}
                <div class="quote-block">
                  <div class="entry-label">{entry.label}</div>
                  <div class="entry-text">{entry.text}</div>
                </div>
              {:else if entry.kind === 'ki'}
                <div class="ki-block">
                  <div class="entry-label ki-label">{entry.label}</div>
                  <div class="entry-text">{entry.text}</div>
                </div>
              {/if}
            {/each}
            {#if step.entries.length === 0}
              <div class="empty-step">(keine protokollierten Beats)</div>
            {/if}
          </div>
        </div>
      {/each}
    </section>
  </div>
</div>

<style>
  .report-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-2, #1a1a1a);
    border: 1px solid var(--line, #333);
    border-radius: 8px;
    margin-bottom: 1.5rem;
    position: sticky;
    top: 0.5rem;
    z-index: 10;
  }

  .action-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-light, #f0f0f0);
    margin: 0;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.4rem 0.9rem;
    border: 1px solid var(--line, #444);
    border-radius: 6px;
    color: var(--text-muted, #888);
    background: transparent;
    cursor: pointer;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .btn-primary {
    border-color: var(--gold, #c9a55c);
    color: var(--gold, #c9a55c);
  }

  .report-content {
    padding: 0 0 2rem;
  }

  .report-header {
    margin-bottom: 1.5rem;
  }

  .report-header h1 {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-light, #f0f0f0);
    margin: 0 0 0.5rem;
  }

  .report-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.82rem;
    color: var(--text-muted, #888);
  }

  .summary-section {
    background: var(--bg-2, #1a1a1a);
    border: 1px solid var(--gold, #c9a55c33);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .summary-section h2 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--gold, #c9a55c);
    margin: 0 0 0.5rem;
  }

  .summary-body {
    font-size: 0.9rem;
    color: var(--text-light, #f0f0f0);
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .protocol-section h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-light, #f0f0f0);
    margin: 0 0 1rem;
  }

  .step-card {
    border-left: 4px solid #666;
    border-radius: 0 8px 8px 0;
    padding: 0.9rem 1.1rem;
    margin-bottom: 1rem;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
  }

  .phase-tag {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    color: #fff;
    font-weight: 600;
    white-space: nowrap;
  }

  .step-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-light, #f0f0f0);
  }

  .step-entries {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .quote-block {
    background: rgba(255,255,255,0.04);
    border-left: 3px solid var(--gold, #c9a55c);
    padding: 0.5rem 0.75rem;
    border-radius: 0 4px 4px 0;
  }

  .ki-block {
    background: rgba(59,130,246,0.08);
    border-left: 3px solid #3b82f6;
    padding: 0.5rem 0.75rem;
    border-radius: 0 4px 4px 0;
  }

  .entry-label {
    font-size: 0.7rem;
    color: var(--text-muted, #888);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 0.2rem;
  }

  .ki-label {
    color: #3b82f6;
  }

  .entry-text {
    font-size: 0.85rem;
    color: var(--text-light, #f0f0f0);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .empty-step {
    font-size: 0.8rem;
    color: var(--text-muted, #555);
    font-style: italic;
  }

  @media print {
    .action-bar {
      display: none !important;
    }
    .report-container {
      max-width: none;
    }
    .report-content {
      padding: 0;
    }
    .step-card {
      break-inside: avoid;
    }
    body {
      background: #fff;
      color: #000;
    }
  }
</style>
