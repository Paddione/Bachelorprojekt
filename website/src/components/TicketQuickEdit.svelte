<script lang="ts">
  type Context = 'admin' | 'portal';
  type TicketStatus = 'triage' | 'backlog' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'archived';
  type Priority = 'hoch' | 'mittel' | 'niedrig';

  interface TicketSummary {
    id: string;
    externalId: string | null;
    type: string;
    title: string;
    status: TicketStatus;
    priority: Priority;
    component: string | null;
  }

  interface TicketFull extends TicketSummary {
    notes: string | null;
  }

  let { context = 'portal' }: { context?: Context } = $props();

  let open = $state(false);
  let panelEl = $state<HTMLDivElement | null>(null);
  let btnEl = $state<HTMLButtonElement | null>(null);
  let btnHovered = $state(false);

  // Admin — list/search view
  let query = $state('');
  let recentTickets = $state<TicketSummary[]>([]);
  let searchResults = $state<TicketSummary[]>([]);
  let loadingList = $state(false);

  // Admin — edit view
  let selectedTicket = $state<TicketFull | null>(null);
  let editStatus = $state<TicketStatus>('triage');
  let editPriority = $state<Priority>('mittel');
  let editComponent = $state('');
  let editNotes = $state('');
  let savingField = $state<string | null>(null);
  let savedField = $state<string | null>(null);
  let fieldError = $state<string | null>(null);

  // Portal — comment form
  let portalTicketId = $state('');
  let portalComment = $state('');
  let portalSubmitting = $state(false);
  let portalResult = $state<{ success: boolean; message: string } | null>(null);

  const QUICK_STATUSES: { value: TicketStatus; label: string }[] = [
    { value: 'triage',      label: 'Triage' },
    { value: 'backlog',     label: 'Backlog' },
    { value: 'in_progress', label: 'In Arbeit' },
    { value: 'in_review',   label: 'In Review' },
    { value: 'blocked',     label: 'Blockiert' },
  ];

  const TYPE_BADGE: Record<string, string> = {
    bug: 'bg-red-900/40 text-red-300',
    feature: 'bg-blue-900/40 text-blue-300',
    task: 'bg-yellow-900/40 text-yellow-300',
    project: 'bg-purple-900/40 text-purple-300',
  };

  function openPanel() {
    open = true;
    if (context === 'admin') loadRecent();
  }

  function closePanel() {
    if (panelEl) {
      const focused = panelEl.querySelector<HTMLElement>(':focus');
      if (focused) {
        focused.blur();
        setTimeout(() => { open = false; selectedTicket = null; query = ''; }, 80);
        return;
      }
    }
    open = false;
    selectedTicket = null;
    query = '';
  }

  async function loadRecent() {
    loadingList = true;
    try {
      const res = await fetch('/api/admin/tickets?status=open&limit=5');
      if (res.ok) {
        const data = await res.json();
        recentTickets = data.items ?? [];
      }
    } finally { loadingList = false; }
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function onQueryInput() {
    clearTimeout(searchTimer);
    if (query.length < 2) { searchResults = []; return; }
    searchTimer = setTimeout(async () => {
      const res = await fetch(`/api/admin/tickets?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        searchResults = data.items ?? [];
      }
    }, 300);
  }

  async function selectTicket(t: TicketSummary) {
    const res = await fetch(`/api/admin/tickets/${t.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const ticket = data.ticket;
    selectedTicket = {
      id: ticket.id,
      externalId: ticket.externalId,
      type: ticket.type,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      component: ticket.component ?? null,
      notes: ticket.notes ?? null,
    };
    editStatus = ticket.status;
    editPriority = ticket.priority;
    editComponent = ticket.component ?? '';
    editNotes = ticket.notes ?? '';
    savedField = null;
    fieldError = null;
  }

  async function saveStatus() {
    if (!selectedTicket || editStatus === selectedTicket.status) return;
    savingField = 'status'; fieldError = null;
    const prev = selectedTicket.status;
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus }),
      });
      if (res.ok) {
        selectedTicket = { ...selectedTicket, status: editStatus };
        savedField = 'status';
        setTimeout(() => { savedField = null; }, 2000);
      } else {
        const d = await res.json();
        fieldError = d.error ?? 'Fehler beim Speichern.';
        editStatus = prev;
      }
    } catch {
      fieldError = 'Verbindungsfehler.';
      editStatus = prev;
    } finally { savingField = null; }
  }

  async function saveField(field: 'priority' | 'component' | 'notes', value: string | Priority) {
    if (!selectedTicket) return;
    savingField = field; fieldError = null;
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (res.ok) {
        selectedTicket = { ...selectedTicket, [field]: value || null } as TicketFull;
        savedField = field;
        setTimeout(() => { savedField = null; }, 2000);
      } else {
        const d = await res.json();
        fieldError = d.error ?? 'Fehler beim Speichern.';
      }
    } catch { fieldError = 'Verbindungsfehler.'; }
    finally { savingField = null; }
  }

  async function submitPortalComment(e: Event) {
    e.preventDefault();
    if (!portalComment.trim()) return;
    portalSubmitting = true; portalResult = null;
    try {
      const res = await fetch('/api/tickets/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: portalComment.trim(),
          ticketId: portalTicketId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        portalResult = { success: true, message: 'Feedback übermittelt. Danke!' };
        portalComment = ''; portalTicketId = '';
        setTimeout(() => { portalResult = null; }, 2500);
      } else {
        portalResult = { success: false, message: data.error ?? 'Fehler beim Senden.' };
      }
    } catch {
      portalResult = { success: false, message: 'Verbindungsfehler.' };
    } finally { portalSubmitting = false; }
  }

  function onWindowKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closePanel(); }

  const displayedList = $derived(query.length >= 2 ? searchResults : recentTickets);
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- Trigger button (positioned by TicketWidgetBar) -->
<button
  bind:this={btnEl}
  type="button"
  onclick={openPanel}
  aria-label={open ? 'Ticket-Panel schließen' : 'Ticket bearbeiten'}
  style="
    width: 40px; height: 40px; border-radius: 50%;
    background: {btnHovered ? '#4338ca' : '#4f46e5'};
    color: #fff; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(79,70,229,.45);
    font-size: 16px; transition: background 0.15s ease;
  "
  onmouseenter={() => { btnHovered = true; }}
  onmouseleave={() => { btnHovered = false; }}
>✏️</button>

<!-- Slide-over Panel -->
<div
  bind:this={panelEl}
  role="dialog"
  aria-modal="true"
  aria-labelledby="tqe-panel-title"
  aria-hidden={!open}
  inert={!open}
  style="
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 62;
    width: 320px;
    background: var(--ink-850, #1a1a2e);
    border-left: 1px solid var(--line, #2a2a3e);
    box-shadow: -4px 0 24px rgba(0,0,0,.35);
    display: flex; flex-direction: column;
    transform: translateX({open ? '0' : '100%'});
    transition: transform 0.2s ease-out; overflow: hidden;
  "
>
  <!-- Header -->
  <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 16px 14px; border-bottom:1px solid var(--line,#2a2a3e); flex-shrink:0;">
    <span id="tqe-panel-title" style="font-size:14px; font-weight:600; color:var(--fg,#e2e8f0); font-family:var(--font-sans);">
      {context === 'admin' ? 'Ticket bearbeiten' : 'Feedback senden'}
    </span>
    <button
      onclick={closePanel}
      aria-label="Panel schließen"
      style="background:none; border:none; cursor:pointer; color:var(--mute,#64748b); font-size:18px; line-height:1; padding:2px 4px; border-radius:4px;"
    >✕</button>
  </div>

  <!-- Body -->
  <div style="flex:1; overflow-y:auto; padding:16px;">

    {#if context === 'admin'}
      {#if selectedTicket}
        <!-- Edit view -->
        <button
          onclick={() => { selectedTicket = null; query = ''; }}
          style="font-size:12px; color:#818cf8; background:none; border:none; cursor:pointer; padding:0 0 12px; display:flex; align-items:center; gap:4px;"
        >← Zurück</button>

        <div style="margin-bottom:12px;">
          <span style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); padding:2px 6px; border-radius:4px;" class="{TYPE_BADGE[selectedTicket.type] ?? 'bg-gray-900/40 text-gray-300'}">{selectedTicket.type}</span>
          <p style="font-size:13px; font-weight:600; color:var(--fg,#e2e8f0); margin:6px 0 0; line-height:1.4;">
            {selectedTicket.externalId ?? ''} — {selectedTicket.title}
          </p>
        </div>

        {#if fieldError}
          <p style="font-size:12px; color:#f87171; margin:0 0 8px; padding:6px 8px; background:rgba(239,68,68,.1); border-radius:4px;">{fieldError}</p>
        {/if}

        <!-- Status -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Status</label>
          <select
            bind:value={editStatus}
            onchange={saveStatus}
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:rgba(79,70,229,.08); color:var(--fg,#e2e8f0); font-size:13px; cursor:pointer;"
          >
            {#each QUICK_STATUSES as s}
              <option value={s.value}>{s.label}{savingField === 'status' && editStatus === s.value ? ' …' : ''}{savedField === 'status' && selectedTicket.status === s.value ? ' ✓' : ''}</option>
            {/each}
          </select>
        </div>

        <!-- Priority -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Priorität {savedField === 'priority' ? '✓' : ''}</label>
          <div style="display:flex; gap:4px;">
            {#each (['hoch','mittel','niedrig'] as Priority[]) as p}
              <button
                type="button"
                onclick={() => { editPriority = p; saveField('priority', p); }}
                style="flex:1; padding:5px 0; border-radius:5px; border:1px solid {editPriority === p ? '#4f46e5' : 'var(--line,#2a2a3e)'}; background:{editPriority === p ? 'rgba(79,70,229,.2)' : 'transparent'}; color:{editPriority === p ? '#818cf8' : 'var(--mute,#64748b)'}; font-size:12px; cursor:pointer; transition:all 0.1s ease;"
              >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
            {/each}
          </div>
        </div>

        <!-- Component -->
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Komponente {savedField === 'component' ? '✓' : ''}</label>
          <input
            type="text"
            bind:value={editComponent}
            onblur={() => saveField('component', editComponent)}
            maxlength="100"
            placeholder="z.B. Chat, Auth…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; box-sizing:border-box;"
          />
        </div>

        <!-- Notes -->
        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Notizen (intern) {savedField === 'notes' ? '✓' : ''}</label>
          <textarea
            bind:value={editNotes}
            onblur={() => saveField('notes', editNotes)}
            maxlength="1000"
            rows="4"
            placeholder="Interne Anmerkungen…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; resize:vertical; box-sizing:border-box;"
          ></textarea>
        </div>

        <a
          href="/admin/tickets/{selectedTicket.id}"
          style="display:block; margin-top:12px; font-size:12px; color:#818cf8; text-align:center;"
        >Vollständige Ansicht →</a>

      {:else}
        <!-- List/Search view -->
        <input
          type="search"
          bind:value={query}
          oninput={onQueryInput}
          placeholder="Ticket-ID oder Stichwort…"
          style="width:100%; padding:7px 10px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; margin-bottom:12px; box-sizing:border-box;"
          aria-label="Ticket suchen"
        />

        {#if loadingList}
          <p style="font-size:12px; color:var(--mute,#64748b);">Lade…</p>
        {:else if displayedList.length === 0 && query.length >= 2}
          <p style="font-size:12px; color:var(--mute,#64748b);">Kein Ticket gefunden.</p>
        {:else}
          <p style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); margin:0 0 6px;">
            {query.length >= 2 ? 'Suchergebnisse' : 'Zuletzt aktualisiert'}
          </p>
          <ul style="margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px;">
            {#each displayedList as ticket}
              <li>
                <button
                  type="button"
                  onclick={() => selectTicket(ticket)}
                  style="width:100%; text-align:left; padding:8px 10px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; cursor:pointer; transition:background 0.1s ease;"
                  onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(79,70,229,.08)'; }}
                  onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style="font-size:11px; color:#818cf8; display:block;">{ticket.externalId ?? ticket.id.slice(0,8)}</span>
                  <span style="font-size:13px; color:var(--fg,#e2e8f0); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{ticket.title}</span>
                  <span style="font-size:11px; color:var(--mute,#64748b);">{ticket.status}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}

    {:else}
      <!-- Portal: comment form -->
      <form onsubmit={submitPortalComment} style="display:flex; flex-direction:column; gap:12px;">
        <p style="font-size:13px; color:var(--fg-soft,#94a3b8); margin:0;">Haben Sie Feedback zu einer Meldung?</p>

        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Ticket-ID (optional)</label>
          <input
            type="text"
            bind:value={portalTicketId}
            placeholder="T000301"
            maxlength="10"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; box-sizing:border-box;"
          />
        </div>

        <div>
          <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--mute,#64748b); display:block; margin-bottom:4px;">Kommentar <span style="color:#f59e0b;">*</span></label>
          <textarea
            bind:value={portalComment}
            required
            maxlength="1000"
            rows="5"
            placeholder="Ihre Rückmeldung…"
            style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line,#2a2a3e); background:transparent; color:var(--fg,#e2e8f0); font-size:13px; resize:vertical; box-sizing:border-box;"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={portalSubmitting || !portalComment.trim()}
          style="padding:8px 0; border-radius:6px; background:#4f46e5; color:#fff; border:none; cursor:pointer; font-size:13px; font-weight:600; transition:background 0.15s ease; opacity:{portalSubmitting || !portalComment.trim() ? '0.5' : '1'};"
        >{portalSubmitting ? 'Wird gesendet…' : 'Feedback senden'}</button>

        {#if portalResult}
          <p style="font-size:12px; padding:8px; border-radius:6px; {portalResult.success ? 'background:rgba(34,197,94,.1); color:#86efac;' : 'background:rgba(239,68,68,.1); color:#fca5a5;'}">{portalResult.message}</p>
        {/if}
      </form>
    {/if}
  </div>
</div>

<style>
  @media (max-width: 639px) {
    div[role="dialog"] {
      width: 100vw !important;
    }
  }
</style>
