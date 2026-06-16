<!-- website/src/components/assistant/TicketSidekickView.svelte -->
<script lang="ts">
  import MarkdownEditor from '../admin/MarkdownEditor.svelte';
  import { STATUS_LABELS, defaultResolutionFor } from '../../lib/tickets/cockpit-labels';
  import type { TicketStatus } from '../../lib/tickets/transition';
  type TicketType = 'feature' | 'task' | 'project';
  type TicketPriority = 'hoch' | 'mittel' | 'niedrig';

  interface TicketRow {
    id: string;
    externalId: string | null;
    type: TicketType;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    component: string | null;
  }

  let { onClose }: { onClose: () => void } = $props();

  // ── Create form ──────────────────────────────────────────
  let createOpen = $state(true);
  let cType = $state<TicketType>('task');
  let cTitle = $state('');
  let cDescription = $state('');
  let cPriority = $state<TicketPriority>('mittel');
  let cComponent = $state('');
  let creating = $state(false);
  let createError = $state('');

  const canCreate = $derived(cTitle.trim().length > 0 && !creating);

  // ── List ────────────────────────────────────────────────
  let tickets = $state<TicketRow[]>([]);
  let loading = $state(true);
  let listError = $state('');

  // ── Toast ───────────────────────────────────────────────
  let toast = $state<{ msg: string; ok: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  function showToast(msg: string, ok: boolean) {
    clearTimeout(toastTimer);
    toast = { msg, ok };
    toastTimer = setTimeout(() => { toast = null; }, 3000);
  }

  async function loadTickets() {
    loading = true;
    listError = '';
    try {
      const r = await fetch('/api/admin/tickets?limit=7&status=open', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { items: TicketRow[] };
      tickets = j.items ?? [];
    } catch {
      listError = 'Tickets konnten nicht geladen werden.';
    } finally {
      loading = false;
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!canCreate) return;
    creating = true;
    createError = '';
    try {
      const r = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: cType,
          title: cTitle.trim(),
          description: cDescription.trim() || undefined,
          priority: cPriority,
          component: cComponent.trim() || undefined,
        }),
      });
      if (!r.ok) { const j = await r.json() as { error?: string }; throw new Error(j.error ?? 'Fehler'); }
      cTitle = ''; cDescription = ''; cComponent = '';
      showToast('Ticket angelegt.', true);
      await loadTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      createError = msg;
    } finally {
      creating = false;
    }
  }

  async function changeStatus(ticketId: string, status: TicketStatus, type: string) {
    const body: Record<string, unknown> = { status };
    if (status === 'done' || status === 'archived') {
      body.resolution = defaultResolutionFor(type);
    }
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // optimistic update
      tickets = tickets.map(t => t.id === ticketId ? { ...t, status } : t);
      showToast('Status geändert.', true);
    } catch {
      showToast('Status-Änderung fehlgeschlagen.', false);
    }
  }

  // Load on mount
  $effect(() => { loadTickets(); });
  const TYPE_LABELS: Record<TicketType, string> = {
    feature: 'Feature', task: 'Aufgabe', project: 'Projekt',
  };
  const PRIORITY_LABELS: Record<TicketPriority, string> = {
    hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
  };
</script>

<div class="view">
  <!-- Intro block -->
  <div class="tv-intro">
    <span class="tv-eyebrow">
      <span class="tv-eyebrow-bar" aria-hidden="true"></span>
      Anfragen
    </span>
    <p class="tv-desc">Tickets erfassen, priorisieren und durch den Workflow bewegen.</p>
  </div>

  <!-- Create accordion -->
  <section class="section">
    <button
      class="section-header"
      onclick={() => { createOpen = !createOpen; }}
      aria-expanded={createOpen}
    >
      <span class="section-title">Neues Ticket</span>
      <span class="chevron" class:rotated={createOpen} aria-hidden="true">＋</span>
    </button>

    {#if createOpen}
      <form class="create-form" onsubmit={handleCreate}>
        <div class="row2">
          <div class="field">
            <label for="sk-type">Typ</label>
            <select id="sk-type" bind:value={cType}>
              {#each Object.entries(TYPE_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="sk-prio">Priorität</label>
            <select id="sk-prio" bind:value={cPriority}>
              {#each Object.entries(PRIORITY_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="sk-title">Titel <span class="req">*</span></label>
          <input id="sk-title" type="text" bind:value={cTitle} maxlength="200" placeholder="Kurze Zusammenfassung" required />
        </div>
        <div class="field">
          <label for="sk-desc">Beschreibung</label>
          <MarkdownEditor id="sk-desc" bind:value={cDescription} maxlength={2000} rows={2} placeholder="Details, Kontext…" />
        </div>
        <div class="field">
          <label for="sk-comp">Komponente</label>
          <input id="sk-comp" type="text" bind:value={cComponent} maxlength="100" placeholder="z.B. Chat, Auth" />
        </div>
        {#if createError}
          <p class="err">{createError}</p>
        {/if}
        <button type="submit" class="btn-primary" disabled={!canCreate}>
          {creating ? 'Wird angelegt…' : 'Anlegen'}
        </button>
      </form>
    {/if}
  </section>

  <!-- Ticket list -->
  <section class="section">
    <div class="list-header">
      <span class="section-title">Offene Anfragen</span>
      {#if !loading}
        <span class="count-badge">{tickets.length}</span>
      {/if}
    </div>

    {#if loading}
      {#each Array(3) as _}
        <div class="skeleton"></div>
      {/each}
    {:else if listError}
      <p class="err">{listError}</p>
    {:else if tickets.length === 0}
      <p class="empty">Keine offenen Tickets.</p>
    {:else}
      <ul class="ticket-list">
        {#each tickets as t (t.id)}
          <li class="ticket-row">
            <div class="ticket-meta">
              <span class="ext-id">{t.externalId ?? '–'}</span>
              <span class="type-pill">{TYPE_LABELS[t.type]}</span>
              <span class="prio-dot prio-{t.priority}" title={PRIORITY_LABELS[t.priority]}></span>
            </div>
            <p class="ticket-title">{t.title}</p>
            <div class="ticket-actions">
              <select
                value={t.status}
                onchange={(e) => changeStatus(t.id, (e.target as HTMLSelectElement).value as TicketStatus, t.type)}
              >
                {#each Object.entries(STATUS_LABELS) as [val, label]}
                  <option value={val}>{label}</option>
                {/each}
              </select>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Footer -->
  <a href="/admin/tickets" class="footer-link">Alle Anfragen →</a>

  <!-- Toast -->
  {#if toast}
    <div class="toast" class:toast-ok={toast.ok} class:toast-err={!toast.ok}>{toast.msg}</div>
  {/if}
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 60px;
  }

  /* ── Intro ──────────────────────────────────────────────── */
  .tv-intro {
    padding: 24px 22px 16px;
    border-bottom: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tv-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .tv-eyebrow-bar {
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }
  .tv-desc {
    margin: 0;
    font-size: 13px;
    color: var(--fg-soft);
    line-height: 1.55;
    max-width: 38ch;
  }

  /* ── Section accordion / list header ───────────────────── */
  .section {
    border-bottom: 1px solid var(--line);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 48px;
    padding: 14px 22px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--fg);
    transition: background 180ms ease;
  }
  .section-header:hover { background: rgba(255,255,255,0.025); }
  .section-header:focus-visible {
    outline: 2px solid var(--brass);
    outline-offset: -2px;
  }

  .section-title {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .chevron {
    font-size: 18px;
    font-weight: 300;
    color: var(--brass);
    transition: transform 220ms var(--ease-out, ease);
    display: inline-block;
    line-height: 1;
    width: 18px;
    text-align: center;
  }
  .chevron.rotated { transform: rotate(45deg); }

  .list-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 22px 10px;
  }

  .count-badge {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
    background: var(--brass-d);
    color: var(--brass);
    letter-spacing: 0.04em;
  }

  /* ── Create form ────────────────────────────────────────── */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 22px 20px;
  }

  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
  }

  .req { color: var(--brass); }

  .field input,
  .field select,
  .field textarea {
    background: var(--ink-850);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-md, 12px);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 14px;
    padding: 11px 14px;
    min-height: 44px;
    resize: vertical;
    appearance: none;
    -webkit-appearance: none;
    transition: border-color 180ms ease, background 180ms ease;
  }
  .field select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23cda260' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }
  .field input::placeholder,
  .field textarea::placeholder { color: var(--mute-2); }
  .field input:hover,
  .field select:hover,
  .field textarea:hover { border-color: rgba(255,255,255,0.18); }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--brass);
    background: var(--ink-800);
  }

  .btn-primary {
    background: var(--brass);
    color: var(--ink-900);
    border: none;
    border-radius: var(--radius-pill, 999px);
    font-family: var(--mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 12px 22px;
    min-height: 44px;
    cursor: pointer;
    transition: background 180ms ease, transform 120ms ease;
    align-self: flex-end;
  }
  .btn-primary:disabled {
    background: var(--ink-750);
    color: var(--mute-2);
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    background: var(--brass-2);
    transform: translateY(-1px);
  }

  /* ── Ticket list ────────────────────────────────────────── */
  .ticket-list {
    list-style: none;
    margin: 0;
    padding: 0 22px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ticket-row {
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 12px);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 180ms ease, background 180ms ease;
  }
  .ticket-row:hover {
    border-color: var(--brass-d);
    background: var(--ink-750);
  }

  .ticket-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ext-id {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--brass);
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .type-pill {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
    background: rgba(255,255,255,0.05);
    color: var(--mute);
    border: 1px solid var(--line);
  }

  .prio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: auto;
    box-shadow: 0 0 0 3px var(--ink-800);
  }
  .prio-dot.prio-hoch { background: oklch(0.62 0.18 22); }
  .prio-dot.prio-mittel { background: var(--brass); }
  .prio-dot.prio-niedrig { background: var(--mute-2); }

  .ticket-title {
    font-family: var(--serif);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ticket-actions select {
    background: var(--ink-900);
    border: 1px solid var(--line-2);
    border-radius: var(--radius-pill, 999px);
    color: var(--fg-soft);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 28px 8px 12px;
    min-height: 36px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23cda260' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    transition: border-color 180ms ease, color 180ms ease;
  }
  .ticket-actions select:hover { color: var(--fg); border-color: var(--brass-d); }
  .ticket-actions select:focus { outline: none; border-color: var(--brass); }

  .skeleton {
    height: 88px;
    background: linear-gradient(
      90deg,
      var(--ink-800) 25%,
      var(--ink-750) 50%,
      var(--ink-800) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius-md, 12px);
    margin: 0 22px 10px;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .empty {
    color: var(--mute);
    font-size: 13px;
    padding: 12px 22px 20px;
    margin: 0;
    font-style: italic;
  }
  .err {
    color: oklch(0.62 0.18 22);
    font-size: 12px;
    margin: 0;
  }

  .footer-link {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    position: sticky;
    bottom: 0;
    padding: 14px 22px;
    background: linear-gradient(to top, var(--ink-900), var(--ink-900) 70%, transparent);
    border-top: 1px solid var(--line);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brass);
    text-decoration: none;
    min-height: 44px;
    transition: color 180ms ease;
  }
  .footer-link:hover { color: var(--brass-2); }

  .toast {
    position: fixed;
    bottom: 80px;
    right: 16px;
    padding: 10px 16px;
    border-radius: var(--radius-pill, 999px);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    z-index: 100;
    pointer-events: none;
    backdrop-filter: blur(8px);
  }
  .toast-ok {
    background: oklch(0.80 0.06 160 / 0.18);
    color: var(--sage);
    border: 1px solid oklch(0.80 0.06 160 / 0.4);
  }
  .toast-err {
    background: oklch(0.62 0.18 22 / 0.18);
    color: oklch(0.78 0.14 22);
    border: 1px solid oklch(0.62 0.18 22 / 0.4);
  }

  @media (max-width: 480px) {
    .tv-intro,
    .section-header,
    .list-header,
    .create-form,
    .ticket-list { padding-inline: 18px; }
    .row2 { grid-template-columns: 1fr; }
  }
</style>
