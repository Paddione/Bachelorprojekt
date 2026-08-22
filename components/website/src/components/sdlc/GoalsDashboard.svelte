<script lang="ts">
  import { GOALS, ACTIVE_GOALS, GREEN_GATES, CATEGORIES, healthPercent } from '../../lib/sdlc/goals-data';
  import type { HealthGoal } from '../../lib/sdlc/goals-data';
  import type { ScanResult } from '../../lib/sdlc/health-scan';
  import type { TicketOutcome } from '../../lib/sdlc/health-goal-tickets';

  let selectedCategory = 'Alle';
  let expandedId: string | null = null;

  // T013306 — Auswahl & Aktionen
  const MAX_IDS_PER_REQUEST = 25; // Spiegel der Obergrenze aus api/health-goals/*
  let selected = new Set<string>();
  let scanning = false;
  let creatingTickets = false;
  let actionError = '';
  let scanResults: Record<string, ScanResult> = {};
  let scannedAt: string | null = null;
  let ticketOutcomes: TicketOutcome[] = [];

  $: categoryList = ['Alle', ...CATEGORIES];

  $: filtered = selectedCategory === 'Alle'
    ? ACTIVE_GOALS
    : ACTIVE_GOALS.filter(g => g.category === selectedCategory);

  // Gesamtzahl zählt übergreifend zum Filter — sonst verschickt der Button
  // mehr Ziele, als der Nutzer sieht.
  $: selectedCount = selected.size;
  $: overLimit = selectedCount > MAX_IDS_PER_REQUEST;
  $: busy = scanning || creatingTickets;

  function toggleSelected(id: string) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    selected = new Set(selected); // Svelte 4 erkennt Set-Mutationen nicht
  }

  function clearSelection() {
    selected = new Set<string>();
    actionError = '';
  }

  async function rescanSelected() {
    if (selectedCount === 0 || busy || overLimit) return;
    scanning = true;
    actionError = '';
    scanResults = {};
    scannedAt = null;
    try {
      const res = await fetch('/sdlc/api/health-goals/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        actionError = `Rescan fehlgeschlagen (${res.status}): ${body.error ?? 'unbekannter Fehler'}`;
      } else {
        const map: Record<string, ScanResult> = {};
        for (const r of body.results as ScanResult[]) map[r.id] = r;
        scanResults = map;
        scannedAt = body.scannedAt ?? null;
      }
    } catch (err) {
      actionError = `Rescan fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      scanning = false;
    }
  }

  async function createTicketsForSelection() {
    if (selectedCount === 0 || busy || overLimit) return;
    creatingTickets = true;
    actionError = '';
    ticketOutcomes = [];
    try {
      const res = await fetch('/sdlc/api/health-goals/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        actionError = `Tickets erzeugen fehlgeschlagen (${res.status}): ${body.error ?? 'unbekannter Fehler'}`;
      } else {
        ticketOutcomes = body.outcomes as TicketOutcome[];
      }
    } catch (err) {
      actionError = `Tickets erzeugen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      creatingTickets = false;
    }
  }

  function outcomeLabel(o: TicketOutcome): string {
    if (o.status === 'created') return `${o.id}: Ticket ${o.ticketId} angelegt`;
    if (o.status === 'skipped') return `${o.id}: übersprungen — bereits offen: „${o.existingTitle}”`;
    return `${o.id}: FEHLER — ${o.error ?? 'unbekannt'}`;
  }

  function driftLabel(r: ScanResult, goal: HealthGoal): string {
    if (!r.measurable) return '';
    if (goal.current !== null && r.actual !== undefined && r.actual !== goal.current) {
      return '⚠ abweichend vom dokumentierten Wert';
    }
    return '✓ entspricht dokumentiertem Wert';
  }

  function toggle(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function statusColor(g: HealthGoal): string {
    switch (g.status) {
      case 'achieved': return '#22c55e';
      case 'on_track': return '#86efac';
      case 'at_risk':  return '#f59e0b';
      case 'critical': return '#ef4444';
      default:         return '#94a3b8';
    }
  }

  function statusLabel(g: HealthGoal): string {
    switch (g.status) {
      case 'achieved': return '✅ Erreicht';
      case 'on_track': return '🟢 Im Plan';
      case 'at_risk':  return '🟡 Gefährdet';
      case 'critical': return '🔴 Kritisch';
      default:         return '⬜ Unbekannt';
    }
  }

  function barColor(pct: number | null): string {
    if (pct === null) return '#64748b';
    if (pct >= 100) return '#22c55e';
    if (pct >= 60)  return '#86efac';
    if (pct >= 30)  return '#f59e0b';
    return '#ef4444';
  }

  function formatValue(g: HealthGoal): string {
    if (g.current === null) return 'N/A';
    return `${g.current}${g.unit !== 'Exit' && g.unit !== '%' ? ' ' + g.unit : g.unit === '%' ? '%' : ''}`;
  }

  function formatTarget(g: HealthGoal): string {
    if (g.target === null) return '—';
    const prefix = g.direction === 'lower' ? '≤' : '≥';
    return `${prefix}${g.target}${g.unit !== 'Exit' && g.unit !== '%' ? ' ' + g.unit : g.unit === '%' ? '%' : ''}`;
  }
</script>

<section class="goals-dashboard">
  <header class="dashboard-header">
    <h2 class="dashboard-title">Repo Health Dashboard</h2>
    <p class="dashboard-subtitle">
      Mess-Stichtag: <strong>{GOALS[0]?.measured_at ?? '2026-07-01'}</strong> ·
      {ACTIVE_GOALS.filter(g => g.status === 'critical').length} kritisch ·
      {ACTIVE_GOALS.filter(g => g.status === 'at_risk').length} gefährdet ·
      {GREEN_GATES.length} Gates grün
      {#if scannedAt}
        · <span class="scan-stamp">↻ Rescan: {new Date(scannedAt).toLocaleString('de-DE')}</span>
      {/if}
    </p>
  </header>

  <nav class="category-filter" aria-label="Kategorie-Filter">
    {#each categoryList as cat}
      <button
        class="filter-btn"
        class:active={selectedCategory === cat}
        on:click={() => selectedCategory = cat}
      >
        {cat}
      </button>
    {/each}
  </nav>

  <!-- Aktionsleiste: sticky, sobald etwas markiert ist -->
  {#if selectedCount > 0}
    <div class="action-bar" role="toolbar" aria-label="Aktionen für markierte Ziele">
      <div class="action-row">
        <span class="selection-count">{selectedCount} markiert</span>
        <button class="action-btn" on:click={clearSelection}>Auswahl aufheben</button>
        <button
          class="action-btn primary"
          disabled={busy || overLimit}
          on:click={rescanSelected}
        >
          {scanning ? '⏳ Scanne…' : '⟳ Neu scannen'}
        </button>
        <button
          class="action-btn primary"
          disabled={busy || overLimit}
          on:click={createTicketsForSelection}
        >
          {creatingTickets ? '⏳ Lege Tickets an…' : '🎫 Tickets erzeugen'}
        </button>
      </div>
      {#if overLimit}
        <p class="action-warn">Maximal {MAX_IDS_PER_REQUEST} Ziele je Anfrage — Auswahl reduzieren.</p>
      {/if}
      {#if actionError}
        <p class="action-error">⚠ {actionError}</p>
      {/if}
      {#if scanning}
        <p class="action-hint">Rescan läuft — ein Lauf mehrerer Ziele kann Minuten dauern.</p>
      {/if}
      {#if ticketOutcomes.length > 0}
        <ul class="ticket-outcomes">
          {#each ticketOutcomes as o (o.id)}
            <li class:class-ok={o.status === 'created'} class:class-skip={o.status === 'skipped'} class:class-fail={o.status === 'failed'}>
              {outcomeLabel(o)}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div class="goals-grid" role="list">
    {#each filtered as goal (goal.id)}
      {@const pct = healthPercent(goal)}
      {@const scan = scanResults[goal.id]}
      <article
        class="goal-card"
        class:expanded={expandedId === goal.id}
        data-priority={goal.priority}
        role="listitem"
      >
        <div class="goal-select">
          <input
            type="checkbox"
            checked={selected.has(goal.id)}
            on:change={() => toggleSelected(goal.id)}
            aria-label="{goal.id} {goal.title} markieren"
          />
        </div>
        <button class="goal-header" on:click={() => toggle(goal.id)} aria-expanded={expandedId === goal.id}>
          <div class="goal-meta">
            <span class="goal-id">{goal.id}</span>
            <span class="priority-badge" data-p={goal.priority}>P{goal.priority}</span>
          </div>
          <h3 class="goal-name">{goal.title}</h3>
          <div class="goal-values">
            <span class="val-current" style="color:{statusColor(goal)}">{formatValue(goal)}</span>
            <span class="val-arrow">→</span>
            <span class="val-target">{formatTarget(goal)}</span>
          </div>
        </button>

        <!-- Health bar -->
        <div class="bar-wrap" title="{pct !== null ? pct + '% Fortschritt' : 'Nicht messbar'}">
          <div
            class="bar-fill"
            style="width:{pct !== null ? Math.min(pct, 100) : 0}%; background:{barColor(pct)}"
          ></div>
          {#if pct !== null}
            <span class="bar-label">{pct}%</span>
          {/if}
        </div>

        <div class="goal-status-row">
          <span class="status-pill">{statusLabel(goal)}</span>
          <span class="goal-category">{goal.category}</span>
        </div>

        <!-- Rescan-Overlay: frischer Wert NEBEN dem dokumentierten (REQ-HEALTH-GOALS-011),
             "nicht messbar" im Klartext statt Wert (REQ-HEALTH-GOALS-012) -->
        {#if scan}
          <div class="scan-overlay" data-measurable={scan.measurable}>
            {#if scan.measurable}
              <span class="scan-fresh">↻ frisch: <strong>{scan.actual}{goal.unit === '%' ? '%' : goal.unit !== 'Exit' ? ' ' + goal.unit : ''}</strong></span>
              <span class="scan-drift" data-drift={driftLabel(scan, goal).startsWith('⚠') ? 'warn' : 'ok'}>{driftLabel(scan, goal)}</span>
            {:else}
              <span class="scan-unmeasurable">nicht messbar</span>
              <span class="scan-drift">Messung lieferte keinen Wert</span>
            {/if}
          </div>
        {/if}

        <!-- Expanded calibration info -->
        {#if expandedId === goal.id}
          <div class="calibration-block" role="region" aria-label="Kalibrierungs-Details">
            <p class="cal-heading">Kalibrierung</p>
            {#if goal.note}
              <p class="cal-note">⚠️ {goal.note}</p>
            {/if}
            <dl class="cal-grid">
              <dt>Quelle</dt>
              <dd>{goal.source}</dd>
              <dt>Gemessen</dt>
              <dd>{goal.measured_at}</dd>
              {#if goal.baseline !== null}
                <dt>Baseline</dt>
                <dd>{goal.baseline} {goal.unit !== 'Exit' ? goal.unit : ''}</dd>
              {/if}
            </dl>
            <p class="cal-cmd-label">Mess-Befehl:</p>
            <pre class="cal-cmd"><code>{goal.measurement}</code></pre>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <!-- Green Gates -->
  {#if GREEN_GATES.length > 0}
    <details class="green-gates">
      <summary class="gates-summary">
        ✅ {GREEN_GATES.length} Green Gates — Policy-Ziele auf Target (klicken zum Ausklappen)
      </summary>
      <ul class="gates-list">
        {#each GREEN_GATES as g}
          <li class="gate-item">
            <input
              type="checkbox"
              checked={selected.has(g.id)}
              on:change={() => toggleSelected(g.id)}
              aria-label="{g.id} {g.title} markieren"
            />
            <span class="gate-id">{g.id}</span>
            <span class="gate-title">{g.title}</span>
            {#if g.current !== null}
              <span class="gate-val">{formatValue(g)} ✓</span>
            {:else}
              <span class="gate-val">grün ✓</span>
            {/if}
            <button class="gate-src-btn" title="Mess-Befehl anzeigen"
              on:click={() => toggle(g.id)}
              aria-expanded={expandedId === g.id}
            >ℹ</button>
            {#if expandedId === g.id}
              <div class="gate-detail">
                <span class="gate-source">{g.source} · {g.measured_at}</span>
                <pre class="gate-cmd"><code>{g.measurement}</code></pre>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .goals-dashboard {
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    color: #e2e8f0;
    padding: 2rem 0;
    max-width: 900px;
    margin: 0 auto;
  }

  .dashboard-header { margin-bottom: 1.5rem; }
  .dashboard-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 0.25rem;
    letter-spacing: -0.02em;
  }
  .dashboard-subtitle { color: #94a3b8; font-size: 0.8rem; margin: 0; }

  .category-filter {
    display: flex; flex-wrap: wrap; gap: 0.4rem;
    margin-bottom: 1.25rem;
  }
  .filter-btn {
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #94a3b8;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .filter-btn:hover { border-color: #64748b; color: #e2e8f0; }
  .filter-btn.active { background: #334155; color: #f8fafc; border-color: #64748b; }

  .goals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .goal-card {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s;
    position: relative;
  }
  .goal-card:hover { border-color: #334155; }
  .goal-card[data-priority="A"] { border-left: 3px solid #ef4444; }
  .goal-card[data-priority="B"] { border-left: 3px solid #f59e0b; }
  .goal-card[data-priority="C"] { border-left: 3px solid #22c55e; }

  /* T013306 — Auswahl-Checkbox: bewusst AUSSERHALB des goal-header-buttons
     (input in button wäre ungültiges Markup und würde das Ausklappen triggern) */
  .goal-select {
    position: absolute;
    top: 0.7rem;
    right: 0.6rem;
    z-index: 2;
  }
  .goal-select input {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
    accent-color: #38bdf8;
  }

  .scan-overlay {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.35rem 0.75rem;
    font-size: 0.68rem;
    border-top: 1px dashed #334155;
    background: #0c1424;
  }
  .scan-fresh { color: #38bdf8; }
  .scan-fresh strong { color: #7dd3fc; }
  .scan-drift { color: #94a3b8; }
  .scan-drift[data-drift="warn"] { color: #f59e0b; }
  .scan-unmeasurable {
    color: #f87171;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .scan-stamp { color: #38bdf8; }

  /* Aktionsleiste */
  .action-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #020617;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    margin-bottom: 1rem;
  }
  .action-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .selection-count { color: #f8fafc; font-weight: 700; margin-right: 0.25rem; }
  .action-btn {
    background: #1e293b;
    color: #94a3b8;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    font-size: 0.72rem;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .action-btn:hover:not(:disabled) { color: #e2e8f0; border-color: #64748b; }
  .action-btn.primary { border-color: #0369a1; color: #38bdf8; }
  .action-btn.primary:hover:not(:disabled) { background: #0c4a6e; color: #bae6fd; }
  .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .action-warn { color: #f59e0b; font-size: 0.7rem; margin: 0.4rem 0 0; }
  .action-error { color: #ef4444; font-size: 0.7rem; margin: 0.4rem 0 0; word-break: break-word; }
  .action-hint { color: #64748b; font-size: 0.68rem; margin: 0.4rem 0 0; }
  .ticket-outcomes {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0.4rem 0 0;
    border-top: 1px solid #1e293b;
    font-size: 0.68rem;
  }
  .ticket-outcomes li { padding: 0.15rem 0; word-break: break-word; }
  .ticket-outcomes li.class-ok { color: #22c55e; }
  .ticket-outcomes li.class-skip { color: #f59e0b; }
  .ticket-outcomes li.class-fail { color: #ef4444; }

  .goal-header {
    width: 100%; background: none; border: none; cursor: pointer;
    padding: 0.75rem; text-align: left; color: inherit;
    font-family: inherit;
  }
  .goal-meta {
    display: flex; align-items: center; gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .goal-id { font-size: 0.7rem; color: #64748b; font-weight: 600; }
  .priority-badge {
    font-size: 0.6rem; padding: 0.1rem 0.4rem;
    border-radius: 3px; font-weight: 700;
  }
  [data-p="A"] { background: #450a0a; color: #ef4444; }
  [data-p="B"] { background: #451a03; color: #f59e0b; }
  [data-p="C"] { background: #052e16; color: #22c55e; }

  .goal-name {
    font-size: 0.82rem; color: #f1f5f9; margin: 0 0 0.5rem;
    font-weight: 600; line-height: 1.3;
  }
  .goal-values {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.75rem;
  }
  .val-current { font-weight: 700; }
  .val-arrow { color: #475569; }
  .val-target { color: #64748b; }

  .bar-wrap {
    position: relative; height: 6px;
    background: #1e293b;
    margin: 0 0.75rem;
  }
  .bar-fill {
    height: 100%; border-radius: 3px;
    transition: width 0.4s ease;
  }
  .bar-label {
    position: absolute; right: 0; top: -1rem;
    font-size: 0.6rem; color: #64748b;
  }

  .goal-status-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.5rem 0.75rem;
    font-size: 0.68rem;
  }
  .status-pill { font-weight: 600; }
  .goal-category { color: #475569; }

  .calibration-block {
    background: #020617;
    border-top: 1px solid #1e293b;
    padding: 0.75rem;
    font-size: 0.7rem;
  }
  .cal-heading { color: #64748b; font-weight: 700; margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .cal-note { color: #f59e0b; margin: 0 0 0.5rem; }
  .cal-grid {
    display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.75rem;
    margin: 0 0 0.5rem;
  }
  .cal-grid dt { color: #64748b; }
  .cal-grid dd { color: #94a3b8; margin: 0; word-break: break-word; }
  .cal-cmd-label { color: #64748b; margin: 0.4rem 0 0.2rem; }
  .cal-cmd {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 0.5rem;
    white-space: pre-wrap; word-break: break-all;
    font-size: 0.65rem; color: #86efac; margin: 0;
    line-height: 1.5;
  }

  /* Green Gates */
  .green-gates {
    background: #020617;
    border: 1px solid #14532d;
    border-radius: 8px;
    overflow: hidden;
  }
  .gates-summary {
    padding: 0.75rem 1rem;
    cursor: pointer; font-size: 0.78rem; color: #22c55e;
    font-weight: 600; list-style: none;
  }
  .gates-summary::-webkit-details-marker { display: none; }
  .gates-list { margin: 0; padding: 0 1rem 0.75rem; list-style: none; }
  .gate-item {
    display: flex; align-items: flex-start; flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    padding: 0.3rem 0;
    border-top: 1px solid #1e293b;
    font-size: 0.72rem;
  }
  .gate-id { color: #64748b; font-weight: 700; min-width: 5rem; }
  .gate-title { color: #94a3b8; flex: 1; min-width: 160px; }
  .gate-val { color: #22c55e; font-weight: 600; }
  .gate-src-btn {
    background: none; border: 1px solid #1e293b; border-radius: 3px;
    color: #64748b; cursor: pointer; font-size: 0.65rem; padding: 0 0.3rem;
    font-family: inherit;
  }
  .gate-src-btn:hover { color: #94a3b8; border-color: #334155; }
  .gate-detail {
    width: 100%; flex-basis: 100%;
    background: #020617; border-radius: 4px; padding: 0.4rem; margin-top: 0.25rem;
  }
  .gate-source { color: #64748b; font-size: 0.65rem; display: block; margin-bottom: 0.3rem; }
  .gate-cmd {
    font-size: 0.65rem; color: #86efac; white-space: pre-wrap; word-break: break-all;
    margin: 0; background: #0f172a; border-radius: 3px; padding: 0.4rem;
  }
</style>
