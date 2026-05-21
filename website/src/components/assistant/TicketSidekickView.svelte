<!-- website/src/components/assistant/TicketSidekickView.svelte -->
<script lang="ts">
  type TicketType = 'feature' | 'task' | 'project';
  type TicketStatus = 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
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

  async function changeStatus(ticketId: string, status: TicketStatus) {
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status }),
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

  const STATUS_LABELS: Record<TicketStatus, string> = {
    triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
    in_review: 'Review', blocked: 'Blockiert', done: 'Erledigt', archived: 'Archiviert',
  };
  const TYPE_LABELS: Record<TicketType, string> = {
    feature: 'Feature', task: 'Aufgabe', project: 'Projekt',
  };
  const PRIORITY_LABELS: Record<TicketPriority, string> = {
    hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
  };
</script>

<div class="view">
  <!-- Create accordion -->
  <section class="section">
    <button
      class="section-header"
      onclick={() => { createOpen = !createOpen; }}
      aria-expanded={createOpen}
    >
      <span class="section-title">+ Neues Ticket</span>
      <span class="chevron" class:rotated={createOpen}>›</span>
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
          <textarea id="sk-desc" bind:value={cDescription} maxlength="2000" rows="2" placeholder="Details, Kontext…"></textarea>
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
                onchange={(e) => changeStatus(t.id, (e.target as HTMLSelectElement).value as TicketStatus)}
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

  .section {
    border-bottom: 1px solid rgba(232, 200, 112, 0.1);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #e8e8f0;
  }
  .section-header:hover { background: rgba(255,255,255,0.03); }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    font-family: 'Geist Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e8c870;
  }

  .chevron {
    font-size: 16px;
    color: #5566aa;
    transition: transform 0.15s;
    display: inline-block;
  }
  .chevron.rotated { transform: rotate(90deg); }

  .list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 8px;
  }

  .count-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(232,200,112,0.15);
    color: #e8c870;
    font-family: monospace;
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 16px 16px;
  }

  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field label {
    font-size: 11px;
    font-weight: 500;
    color: #8899aa;
  }

  .req { color: #e8c870; }

  .field input,
  .field select,
  .field textarea {
    background: #0f1623;
    border: 1px solid #243049;
    border-radius: 6px;
    color: #e8e8f0;
    font-size: 12px;
    padding: 7px 9px;
    font-family: inherit;
    resize: vertical;
    appearance: none;
    -webkit-appearance: none;
  }
  .field select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238899aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 26px;
  }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: rgba(232,200,112,0.5);
  }

  .btn-primary {
    background: #e8c870;
    color: #0f1623;
    border: none;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s;
    align-self: flex-end;
  }
  .btn-primary:disabled { background: #2a3a52; color: #5566aa; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { background: #f0d480; }

  .ticket-list {
    list-style: none;
    margin: 0;
    padding: 0 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ticket-row {
    background: #0f1623;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ticket-row:hover { border-color: rgba(232,200,112,0.2); }

  .ticket-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ext-id {
    font-family: 'Geist Mono', monospace;
    font-size: 9px;
    color: #e8c870;
    font-weight: 600;
  }

  .type-pill {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255,255,255,0.06);
    color: #8899aa;
  }

  .prio-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: auto;
  }
  .prio-dot.prio-hoch { background: #ef4444; }
  .prio-dot.prio-mittel { background: #f59e0b; }
  .prio-dot.prio-niedrig { background: #6b7280; }

  .ticket-title {
    font-size: 12px;
    color: #c8d0e0;
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ticket-actions select {
    background: #0f1623;
    border: 1px solid #243049;
    border-radius: 5px;
    color: #8899aa;
    font-size: 11px;
    padding: 4px 22px 4px 6px;
    cursor: pointer;
    font-family: inherit;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%235566aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }
  .ticket-actions select:focus { outline: none; border-color: rgba(232,200,112,0.4); }

  .skeleton {
    height: 72px;
    background: linear-gradient(90deg, #1a2235 25%, #1e2a3f 50%, #1a2235 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
    margin: 0 16px 8px;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .empty { color: #5566aa; font-size: 12px; padding: 8px 16px 16px; margin: 0; }
  .err { color: #f87171; font-size: 11px; margin: 0; }

  .footer-link {
    display: block;
    position: sticky;
    bottom: 0;
    padding: 12px 16px;
    background: #0f1623;
    border-top: 1px solid #1e2d42;
    font-size: 12px;
    font-weight: 600;
    color: #e8c870;
    text-decoration: none;
    text-align: right;
  }
  .footer-link:hover { text-decoration: underline; }

  .toast {
    position: fixed;
    bottom: 80px;
    right: 16px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 100;
    pointer-events: none;
  }
  .toast-ok { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
  .toast-err { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
</style>
