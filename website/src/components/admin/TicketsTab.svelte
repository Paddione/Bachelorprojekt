<script lang="ts">
  import TicketQuickEdit from './TicketQuickEdit.svelte';
  import type { ListedTicket } from '../../lib/tickets/admin';

  // ── State ────────────────────────────────────────────────
  let tickets = $state<ListedTicket[]>([]);
  let loadingList = $state(true);
  let listError = $state('');
  let inFlight = $state<Record<string, boolean>>({});

  let createFormOpen = $state(true);
  let creating = $state(false);
  let createError = $state('');

  // Create form fields
  let cType = $state<'feature' | 'task' | 'project'>('task');
  let cTitle = $state('');
  let cDescription = $state('');
  let cPriority = $state<'hoch' | 'mittel' | 'niedrig'>('mittel');
  let cComponent = $state('');

  // Edit modal
  let editTicket = $state<ListedTicket | null>(null);

  // Toast
  let toast = $state<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  // ── Derived ──────────────────────────────────────────────
  const canCreate = $derived(cTitle.trim().length > 0 && !creating);

  // ── Helpers ──────────────────────────────────────────────
  function showToast(msg: string, kind: 'ok' | 'err') {
    clearTimeout(toastTimer);
    toast = { msg, kind };
    toastTimer = setTimeout(() => { toast = null; }, 3500);
  }

  async function loadTickets() {
    loadingList = true;
    listError = '';
    try {
      const r = await fetch('/api/admin/tickets?limit=20&status=open', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      tickets = j.items ?? [];
    } catch (e) {
      listError = 'Tickets konnten nicht geladen werden.';
    } finally {
      loadingList = false;
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
          type: cType, title: cTitle.trim(),
          description: cDescription.trim() || undefined,
          priority: cPriority,
          component: cComponent.trim() || undefined,
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Fehler'); }
      cTitle = ''; cDescription = ''; cComponent = '';
      showToast('Ticket erstellt.', 'ok');
      await loadTickets();
    } catch (e: any) {
      createError = e.message;
    } finally {
      creating = false;
    }
  }

  async function handleTransition(ticket: ListedTicket, status: 'done' | 'archived') {
    if (inFlight[ticket.id]) return;
    inFlight = { ...inFlight, [ticket.id]: true };
    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status, resolution: status === 'done' ? 'fixed' : undefined }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Fehler'); }
      showToast(status === 'done' ? 'Ticket geschlossen.' : 'Ticket archiviert.', 'ok');
      await loadTickets();
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      inFlight = { ...inFlight, [ticket.id]: false };
    }
  }

  async function handleClassify(ticket: ListedTicket) {
    if (inFlight[ticket.id]) return;
    inFlight = { ...inFlight, [ticket.id]: true };
    try {
      const r = await fetch(`/api/admin/tickets/${ticket.id}/classify`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (r.status === 503) { showToast('KI nicht erreichbar.', 'err'); return; }
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'KI-Fehler'); }
      showToast('KI-Klassifikation gespeichert.', 'ok');
      await loadTickets();
    } catch (e: any) {
      showToast(e.message, 'err');
    } finally {
      inFlight = { ...inFlight, [ticket.id]: false };
    }
  }

  function priorityColor(p: string) {
    if (p === 'hoch') return 'color: #f87171;';
    if (p === 'mittel') return 'color: #fbbf24;';
    return 'color: #6b7280;';
  }

  function typeLabel(t: string) {
    return { bug: 'Bug', feature: 'Feature', task: 'Aufgabe', project: 'Projekt' }[t] ?? t;
  }

  // Load on mount
  $effect(() => { loadTickets(); });
</script>

<!-- ── Layout ─────────────────────────────────────────── -->
<div class="tickets-tab">

  <!-- Two-column on desktop, stacked on mobile -->
  <div class="tickets-layout">

    <!-- CREATE FORM -->
    <div class="tickets-create-panel">
      <button
        class="create-toggle"
        onclick={() => createFormOpen = !createFormOpen}
        aria-expanded={createFormOpen}
      >
        Neues Ticket {createFormOpen ? '▲' : '▼'}
      </button>

      {#if createFormOpen}
        <form onsubmit={handleCreate} class="create-form">
          <label class="field-label">
            Typ
            <select bind:value={cType} class="field-input">
              <option value="task">Aufgabe</option>
              <option value="feature">Feature</option>
              <option value="project">Projekt</option>
            </select>
          </label>

          <label class="field-label">
            Titel <span style="color: var(--admin-primary);">*</span>
            <input
              type="text"
              bind:value={cTitle}
              placeholder="Kurzer Titel..."
              class="field-input"
              required
            />
          </label>

          <label class="field-label">
            Beschreibung
            <textarea
              bind:value={cDescription}
              placeholder="Details, Reproduktionsschritte..."
              class="field-input"
              rows="3"
            ></textarea>
          </label>

          <div class="field-row">
            <label class="field-label" style="flex:1;">
              Priorität
              <select bind:value={cPriority} class="field-input">
                <option value="hoch">Hoch</option>
                <option value="mittel">Mittel</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </label>
            <label class="field-label" style="flex:2;">
              Komponente
              <input
                type="text"
                bind:value={cComponent}
                placeholder="z.B. website, auth..."
                class="field-input"
              />
            </label>
          </div>

          {#if createError}
            <p class="msg-error">{createError}</p>
          {/if}

          <button type="submit" class="btn-primary" disabled={!canCreate}>
            {creating ? 'Wird erstellt…' : '+ Ticket erstellen'}
          </button>
        </form>
      {/if}
    </div>

    <!-- TICKET LIST -->
    <div class="tickets-list-panel">
      <div class="list-header">
        <span class="list-title">Letzte Tickets</span>
        <button class="btn-icon" onclick={loadTickets} title="Aktualisieren" aria-label="Liste aktualisieren">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M2 8a6 6 0 1 0 1.5-3.9M2 4v4h4"/></svg>
        </button>
      </div>

      {#if loadingList}
        {#each [1,2,3] as _}
          <div class="ticket-skeleton"></div>
        {/each}
      {:else if listError}
        <p class="msg-error">{listError} <button class="btn-text" onclick={loadTickets}>Erneut versuchen</button></p>
      {:else if tickets.length === 0}
        <p class="empty-state">Keine offenen Tickets.</p>
      {:else}
        {#each tickets as ticket (ticket.id)}
          <div class="ticket-row">
            <div class="ticket-meta">
              <span class="ticket-id">{ticket.externalId ?? '—'}</span>
              <span class="ticket-type">{typeLabel(ticket.type)}</span>
              <span class="ticket-priority" style={priorityColor(ticket.priority)}>{ticket.priority}</span>
            </div>
            <p class="ticket-title">{ticket.title}</p>
            <div class="ticket-actions">
              <button
                class="btn-action"
                title="Bearbeiten"
                aria-label="Ticket bearbeiten"
                onclick={() => editTicket = ticket}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M11.5 1.8l2.7 2.7L5 13.7l-3.2.5.5-3.2z"/><path d="M10 3.3l2.7 2.7"/></svg>
                <span class="btn-action-label">Bearbeiten</span>
              </button>
              <button
                class="btn-action"
                title="Schließen"
                aria-label="Ticket schließen"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleTransition(ticket, 'done')}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M2.5 8l3.5 3.5 7.5-7"/></svg>
                <span class="btn-action-label">Schließen</span>
              </button>
              <button
                class="btn-action"
                title="Archivieren"
                aria-label="Ticket archivieren"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleTransition(ticket, 'archived')}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><rect x="2" y="6" width="12" height="8" rx="1"/><path d="M1 3.5h14v2.5H1zM6 10h4"/></svg>
                <span class="btn-action-label">Archiv</span>
              </button>
              <button
                class="btn-action btn-action-ai"
                title="KI klassifizieren"
                aria-label="KI-Klassifikation anwenden"
                disabled={!!inFlight[ticket.id]}
                onclick={() => handleClassify(ticket)}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/></svg>
                <span class="btn-action-label">→ KI</span>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Edit Modal -->
  {#if editTicket}
    <TicketQuickEdit
      ticket={editTicket}
      onSave={() => { editTicket = null; loadTickets(); }}
      onClose={() => editTicket = null}
    />
  {/if}

  <!-- Toast -->
  {#if toast}
    <div class="toast toast-{toast.kind}" role="status">
      {toast.msg}
    </div>
  {/if}
</div>

<style>
  .tickets-tab {
    position: relative;
    min-height: 200px;
  }

  .tickets-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
    align-items: start;
  }

  @media (max-width: 768px) {
    .tickets-layout {
      grid-template-columns: 1fr;
    }
  }

  .tickets-create-panel {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    padding: 16px;
  }

  .create-toggle {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--admin-text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 0 0 8px;
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field-input {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 13px;
    color: var(--admin-text);
    font-family: var(--font-sans);
    min-height: 36px;
    transition: border-color 0.15s;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--admin-primary);
  }

  .field-row {
    display: flex;
    gap: 10px;
  }

  .btn-primary {
    background: var(--admin-primary);
    color: var(--admin-bg);
    border: none;
    border-radius: 10px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 44px;
    width: 100%;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tickets-list-panel {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: 4px;
  }

  .list-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--admin-text-mute);
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--admin-text-mute);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    transition: color 0.15s;
  }

  .btn-icon:hover { color: var(--admin-text); }

  .ticket-skeleton {
    height: 72px;
    background: linear-gradient(90deg, var(--admin-border) 25%, var(--admin-surface-hover) 50%, var(--admin-border) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 10px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .ticket-row {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s;
  }

  .ticket-row:hover {
    border-color: var(--admin-border-bright);
  }

  .ticket-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .ticket-id {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--admin-text-disabled);
    background: var(--admin-surface);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .ticket-type {
    font-size: 10px;
    font-weight: 700;
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ticket-priority {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ticket-title {
    font-size: 13px;
    color: var(--admin-text);
    margin: 0;
    line-height: 1.4;
  }

  .ticket-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--admin-text-mute);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    min-height: 30px;
  }

  .btn-action:hover {
    background: var(--admin-surface-hover);
    color: var(--admin-text);
    border-color: var(--admin-border-bright);
  }

  .btn-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-action-ai {
    color: var(--admin-primary);
    border-color: color-mix(in srgb, var(--admin-primary) 30%, transparent);
  }

  .btn-action-ai:hover {
    background: var(--admin-primary-muted);
    color: var(--admin-primary);
  }

  @media (max-width: 480px) {
    .btn-action-label { display: none; }
    .btn-action { padding: 5px 8px; }
  }

  .empty-state {
    color: var(--admin-text-disabled);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  .msg-error {
    color: #f87171;
    font-size: 12px;
    margin: 0;
  }

  .btn-text {
    background: none;
    border: none;
    color: var(--admin-primary);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    z-index: 9999;
    white-space: nowrap;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    animation: toastIn 0.2s ease;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .toast-ok { background: #15803d; color: #fff; }
  .toast-err { background: #991b1b; color: #fff; }
</style>
