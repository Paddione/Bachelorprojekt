<script lang="ts">
  import { onMount } from 'svelte';

  type BugTicket = {
    ticket_id: string;
    category: string;
    reporter_email: string;
    description: string;
    url: string | null;
    brand: string;
    status: 'open' | 'resolved' | 'archived';
    created_at: string;
    resolved_at: string | null;
    resolution_note: string | null;
    screenshots: { filename: string; data_url: string }[];
  };

  type Comment = {
    id: number;
    ticketId: string;
    author: string;
    kind: 'comment' | 'status_change' | 'system';
    body: string;
    createdAt: string;
  };

  const CATEGORY_LABELS: Record<string, string> = {
    fehler: 'Fehler',
    verbesserung: 'Verbesserung',
    erweiterungswunsch: 'Erweiterungswunsch',
  };

  let tickets: BugTicket[] = [];
  let loading = true;
  let activeStatus = 'open';
  let activeCategory = '';
  let search = '';
  let expandedId: string | null = null;
  let resolveModalId: string | null = null;
  let resolveNote = '';
  let resolveLoading = false;
  let resolveError = '';
  let actionLoading: string | null = null;

  // Per-ticket comment state. Loaded lazily when a ticket is expanded.
  let commentsByTicket: Record<string, Comment[]> = {};
  let commentsLoadingId: string | null = null;
  let newCommentBody = '';
  let newCommentSubmitting = false;
  let newCommentError = '';

  async function fetchTickets() {
    loading = true;
    const p = new URLSearchParams();
    if (activeStatus) p.set('status', activeStatus);
    if (activeCategory) p.set('category', activeCategory);
    if (search.trim()) p.set('q', search.trim());
    const res = await fetch(`/api/admin/bugs/list?${p}`).catch(() => null);
    if (res?.ok) {
      const raw = await res.json();
      // listBugTickets returns camelCase keys; normalize to snake_case the table expects.
      tickets = (raw as any[]).map(r => ({
        ticket_id:       r.ticketId       ?? r.ticket_id,
        category:        r.category,
        reporter_email:  r.reporterEmail  ?? r.reporter_email,
        description:     r.description,
        url:             r.url,
        brand:           r.brand,
        status:          r.status,
        created_at:      r.createdAt      ?? r.created_at,
        resolved_at:     r.resolvedAt     ?? r.resolved_at,
        resolution_note: r.resolutionNote ?? r.resolution_note,
        screenshots:     r.screenshots ?? [],
      }));
    }
    loading = false;
  }

  async function loadCommentsFor(id: string) {
    if (commentsByTicket[id]) return; // cached
    commentsLoadingId = id;
    const res = await fetch(`/api/admin/bugs/${encodeURIComponent(id)}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      commentsByTicket = { ...commentsByTicket, [id]: data.comments ?? [] };
    }
    commentsLoadingId = null;
  }

  function expand(id: string) {
    expandedId = expandedId === id ? null : id;
    newCommentBody = '';
    newCommentError = '';
    if (expandedId) loadCommentsFor(expandedId);
  }

  async function submitComment(id: string) {
    if (!newCommentBody.trim()) return;
    newCommentSubmitting = true;
    newCommentError = '';
    const res = await fetch(`/api/admin/bugs/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newCommentBody.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      const c = await res.json();
      commentsByTicket = {
        ...commentsByTicket,
        [id]: [...(commentsByTicket[id] ?? []), c],
      };
      newCommentBody = '';
    } else {
      const j = await res?.json().catch(() => ({}));
      newCommentError = j?.error ?? 'Kommentar konnte nicht gespeichert werden';
    }
    newCommentSubmitting = false;
  }

  async function archiveTicket(id: string) {
    actionLoading = id;
    const res = await fetch('/api/admin/bugs/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: id }),
    }).catch(() => null);
    if (res?.ok) {
      delete commentsByTicket[id];
      commentsByTicket = { ...commentsByTicket };
      await fetchTickets();
    }
    actionLoading = null;
  }

  async function reopenTicket(id: string) {
    actionLoading = id;
    const res = await fetch('/api/admin/bugs/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: id }),
    }).catch(() => null);
    if (res?.ok) {
      delete commentsByTicket[id];
      commentsByTicket = { ...commentsByTicket };
      await fetchTickets();
    }
    actionLoading = null;
  }

  async function resolveTicketSubmit() {
    if (!resolveModalId || !resolveNote.trim()) return;
    resolveLoading = true;
    resolveError = '';
    const res = await fetch('/api/admin/bugs/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: resolveModalId, resolutionNote: resolveNote }),
    }).catch(() => null);
    if (res?.ok) {
      delete commentsByTicket[resolveModalId];
      commentsByTicket = { ...commentsByTicket };
      resolveModalId = null;
      resolveNote = '';
      await fetchTickets();
    } else {
      resolveError = 'Fehler beim Erledigen.';
    }
    resolveLoading = false;
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(d: string) {
    return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  onMount(fetchTickets);

  $: statusTabs = [
    { id: '',         label: 'Alle' },
    { id: 'open',     label: 'Offen' },
    { id: 'resolved', label: 'Erledigt' },
    { id: 'archived', label: 'Archiviert' },
  ];
</script>

<div class="space-y-4">
  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex border border-gray-700 rounded overflow-hidden text-xs">
      {#each statusTabs as st}
        <button
          on:click={() => { activeStatus = st.id; fetchTickets(); }}
          class="px-3 py-1.5 {activeStatus === st.id ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}"
        >{st.label}</button>
      {/each}
    </div>

    <select
      bind:value={activeCategory}
      on:change={fetchTickets}
      class="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-gray-500"
    >
      <option value="">Alle Kategorien</option>
      {#each Object.entries(CATEGORY_LABELS) as [val, lbl]}
        <option value={val}>{lbl}</option>
      {/each}
    </select>

    <input
      bind:value={search}
      on:keydown={(e) => e.key === 'Enter' && fetchTickets()}
      placeholder="Ticket-ID oder E-Mail…"
      class="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 w-52 focus:outline-none focus:border-gray-500 font-mono"
    />
    <button on:click={fetchTickets}
      class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600">
      Suchen
    </button>
  </div>

  <!-- Table -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    {#if loading}
      <div class="px-4 py-8 text-center text-sm text-gray-500">Lädt…</div>
    {:else if tickets.length === 0}
      <div class="px-4 py-8 text-center text-sm text-gray-500">Keine Tickets gefunden.</div>
    {:else}
      <div class="grid grid-cols-[120px_1fr_140px_90px_90px_120px] gap-2 px-4 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
        <span>Ticket-ID</span><span>Beschreibung</span><span>Reporter</span>
        <span>Kategorie</span><span>Status</span><span>Datum</span>
      </div>
      {#each tickets as t (t.ticket_id)}
        <div class="border-b border-gray-700/50 last:border-0">
          <div
            class="grid grid-cols-[120px_1fr_140px_90px_90px_120px] gap-2 px-4 py-2.5 text-xs items-center cursor-pointer hover:bg-gray-700/30 transition-colors"
            on:click={() => expand(t.ticket_id)}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && expand(t.ticket_id)}
          >
            <span class="font-mono text-gray-300">{t.ticket_id}</span>
            <span class="text-gray-300 truncate">{t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</span>
            <span class="text-gray-400 truncate">{t.reporter_email}</span>
            <span class="text-gray-400">{CATEGORY_LABELS[t.category] ?? t.category}</span>
            <span class="px-1.5 py-0.5 rounded text-xs font-mono
              {t.status === 'open' ? 'bg-yellow-900/40 text-yellow-300' : t.status === 'resolved' ? 'bg-green-900/40 text-green-300' : 'bg-gray-700 text-gray-400'}">
              {t.status}
            </span>
            <span class="text-gray-500">{fmtDate(t.created_at)}</span>
          </div>

          {#if expandedId === t.ticket_id}
            <div class="px-4 pb-4 bg-gray-900/30 space-y-3 text-xs">
              {#if t.url}
                <p class="text-gray-500">URL: <a href={t.url} target="_blank" rel="noopener" class="text-blue-400 hover:underline">{t.url}</a></p>
              {/if}
              <p class="text-gray-300 whitespace-pre-wrap leading-relaxed">{t.description}</p>
              {#if t.resolution_note}
                <p class="text-green-400">Lösung: {t.resolution_note}</p>
              {/if}
              {#if t.screenshots?.length > 0}
                <div class="flex gap-2 flex-wrap mt-2">
                  {#each t.screenshots as ss}
                    <a href={ss.data_url} target="_blank" rel="noopener">
                      <img src={ss.data_url} alt={ss.filename} class="h-20 rounded border border-gray-700 object-cover" />
                    </a>
                  {/each}
                </div>
              {/if}

              <!-- Comments -->
              <div class="pt-2 border-t border-gray-700/50 space-y-2">
                <p class="text-gray-500 uppercase tracking-wide text-[10px]">Verlauf</p>
                {#if commentsLoadingId === t.ticket_id}
                  <p class="text-gray-500 italic">Lädt…</p>
                {:else if (commentsByTicket[t.ticket_id]?.length ?? 0) === 0}
                  <p class="text-gray-600 italic">Noch keine Kommentare.</p>
                {:else}
                  <div class="space-y-1.5">
                    {#each commentsByTicket[t.ticket_id] as c (c.id)}
                      <div class="flex gap-2 items-baseline {c.kind === 'status_change' ? 'text-gray-500' : 'text-gray-300'}">
                        <span class="font-mono text-gray-500 text-[10px]">{fmtDateTime(c.createdAt)}</span>
                        <span class="font-mono text-gray-400">{c.author}</span>
                        {#if c.kind === 'status_change'}
                          <span class="italic">→ {c.body}</span>
                        {:else}
                          <span class="whitespace-pre-wrap">{c.body}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}

                <!-- Add comment -->
                <div class="flex gap-2 pt-1">
                  <textarea bind:value={newCommentBody} rows={2} placeholder="Kommentar hinzufügen…"
                    class="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-200 resize-none focus:outline-none focus:border-gray-500"></textarea>
                  <button
                    on:click|stopPropagation={() => submitComment(t.ticket_id)}
                    disabled={newCommentSubmitting || !newCommentBody.trim()}
                    class="self-start px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50">
                    {newCommentSubmitting ? '…' : 'Senden'}
                  </button>
                </div>
                {#if newCommentError}<p class="text-red-400">{newCommentError}</p>{/if}
              </div>

              <!-- Action row -->
              <div class="flex gap-2 pt-1">
                {#if t.status === 'open'}
                  <button
                    on:click|stopPropagation={() => { resolveModalId = t.ticket_id; resolveNote = ''; resolveError = ''; }}
                    class="px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-200 rounded text-xs">
                    Erledigen
                  </button>
                  <button
                    on:click|stopPropagation={() => archiveTicket(t.ticket_id)}
                    disabled={actionLoading === t.ticket_id}
                    class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs disabled:opacity-50">
                    {actionLoading === t.ticket_id ? '…' : 'Archivieren'}
                  </button>
                {:else}
                  <button
                    on:click|stopPropagation={() => reopenTicket(t.ticket_id)}
                    disabled={actionLoading === t.ticket_id}
                    class="px-3 py-1.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded text-xs disabled:opacity-50">
                    {actionLoading === t.ticket_id ? '…' : 'Wieder öffnen'}
                  </button>
                  {#if t.status === 'resolved'}
                    <button
                      on:click|stopPropagation={() => archiveTicket(t.ticket_id)}
                      disabled={actionLoading === t.ticket_id}
                      class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs disabled:opacity-50">
                      {actionLoading === t.ticket_id ? '…' : 'Archivieren'}
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Resolve modal -->
{#if resolveModalId}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-md space-y-3">
      <h3 class="font-semibold text-gray-100 text-sm">Ticket erledigen: {resolveModalId}</h3>
      <textarea bind:value={resolveNote} rows={3} placeholder="Lösungshinweis…"
        class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none focus:outline-none"></textarea>
      {#if resolveError}<p class="text-red-400 text-xs">{resolveError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => resolveModalId = null} class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={resolveTicketSubmit} disabled={resolveLoading || !resolveNote.trim()}
          class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
          {resolveLoading ? '…' : 'Speichern'}
        </button>
      </div>
    </div>
  </div>
{/if}
