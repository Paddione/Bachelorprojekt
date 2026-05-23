<script lang="ts">
  import type { ListedTicket, TicketStatus } from '../../lib/tickets/admin';

  type AttentionMode = 'auto' | 'ai_ready' | 'needs_human';

  interface RowState {
    status:        TicketStatus;
    attentionMode: AttentionMode;
    aiQuestion:    string | null;
    humanAnswer:   string | null;
    saving:        boolean;
    error:         string | null;
    answer:        string;
    answerSaving:  boolean;
    answerSaved:   boolean;
  }

  let {
    tickets = [],
    admins  = [],
  }: {
    tickets: ListedTicket[];
    admins:  { id: string; name: string }[];
  } = $props();

  // Initialise per-row state map from SSR-resolved ticket list
  const rows = $state(
    new Map<string, RowState>(
      tickets.map(t => [t.id, {
        status:        t.status,
        attentionMode: t.attentionMode,
        aiQuestion:    t.aiQuestion,
        humanAnswer:   t.humanAnswer,
        saving:        false,
        error:         null,
        answer:        '',
        answerSaving:  false,
        answerSaved:   false,
      }])
    )
  );

  function row(id: string): RowState {
    return rows.get(id)!;
  }

  function setRow(id: string, patch: Partial<RowState>) {
    const current = rows.get(id)!;
    rows.set(id, { ...current, ...patch });
  }

  // ── Status transition ───────────────────────────────────────────────────────
  async function patchStatus(ticketId: string, newStatus: TicketStatus) {
    const prev = row(ticketId).status;
    setRow(ticketId, { status: newStatus, saving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { status: prev, error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { status: prev, error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { saving: false });
    }
  }

  // ── Attention mode toggle ───────────────────────────────────────────────────
  async function patchAttentionMode(ticketId: string, mode: AttentionMode) {
    const prev = row(ticketId).attentionMode;
    setRow(ticketId, { attentionMode: mode, saving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ attentionMode: mode }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { attentionMode: prev, error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { attentionMode: prev, error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { saving: false });
    }
  }

  // ── Answer & back to AI-ready ───────────────────────────────────────────────
  async function submitAnswer(ticketId: string) {
    const answer = row(ticketId).answer.trim();
    if (!answer) return;
    setRow(ticketId, { answerSaving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ humanAnswer: answer, attentionMode: 'ai_ready' }),
      });
      if (r.ok) {
        setRow(ticketId, {
          humanAnswer:   answer,
          attentionMode: 'ai_ready',
          answerSaved:   true,
          answer:        '',
        });
        setTimeout(() => setRow(ticketId, { answerSaved: false }), 1500);
      } else {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { answerSaving: false });
    }
  }

  // ── Display helpers ─────────────────────────────────────────────────────────
  const STATUS_LABEL: Record<string, string> = {
    triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
    in_review: 'Review', blocked: 'Blockiert', done: 'Fertig', archived: 'Archiviert',
  };
  const STATUS_OPTIONS: TicketStatus[] = [
    'triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'done', 'archived',
  ];
  const TYPE_LABEL: Record<string, string> = {
    bug: '🐛 Bug', feature: '✨ Feature', task: '📋 Task', project: '📁 Projekt',
  };
  const PRIO_CLS: Record<string, string> = {
    hoch: 'text-red-400', mittel: 'text-yellow-400', niedrig: 'text-green-400',
  };
  const PRIO_ICON: Record<string, string> = { hoch: '▲', mittel: '●', niedrig: '▼' };

  function formatDate(d: Date | null | string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<table class="w-full">
  <thead>
    <tr class="border-b border-dark-lighter">
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">ID</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Typ</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Titel</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Status</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Prio</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Zuständig</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Kunde</th>
      <th class="text-left px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Fällig</th>
      <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Aktion</th>
    </tr>
  </thead>
  <tbody>
{#if tickets.length === 0}
  <tr>
    <td colspan="9" class="px-4 py-10 text-center text-muted text-sm">
      Keine Tickets für diese Filterauswahl.
    </td>
  </tr>
{:else}
{#each tickets as t (t.id)}
  {@const rs = row(t.id)}
  {@const showWidget = rs.attentionMode === 'needs_human' && !!t.aiQuestion}

  <!-- Main ticket row -->
  <tr class="border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors {rs.status === 'archived' ? 'opacity-50' : ''}">

    <!-- ID -->
    <td class="px-4 py-3 font-mono text-xs text-gold whitespace-nowrap align-top">
      <a href={`/admin/tickets/${t.id}`} class="hover:underline">
        {t.externalId ?? t.id.slice(0, 8)}
      </a>
    </td>

    <!-- Typ -->
    <td class="px-4 py-3 text-xs whitespace-nowrap align-top">
      {TYPE_LABEL[t.type] ?? t.type}
    </td>

    <!-- Titel + tags -->
    <td class="px-4 py-3 align-top">
      <div class="flex items-center gap-2 flex-wrap">
        <a href={`/admin/tickets/${t.id}`} class="text-light hover:text-gold text-sm font-medium">
          {t.title}
        </a>
      </div>
      {#if t.tagNames.length > 0}
        <div class="flex flex-wrap gap-1 mt-1">
          {#each t.tagNames as tag}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted">
              {tag}
            </span>
          {/each}
        </div>
      {/if}
    </td>

    <!-- Status — inline select -->
    <td class="px-4 py-3 align-top">
      <div class="relative">
        <select
          value={rs.status}
          disabled={rs.saving}
          onchange={(e) => patchStatus(t.id, (e.currentTarget as HTMLSelectElement).value as TicketStatus)}
          class="appearance-none text-xs px-2 py-1 pr-6 rounded-full border bg-dark-light text-light cursor-pointer
                 border-dark-lighter hover:border-gold/40 transition-colors disabled:opacity-50
                 focus:outline-none focus:border-gold/60"
        >
          {#each STATUS_OPTIONS as s}
            <option value={s}>{STATUS_LABEL[s]}</option>
          {/each}
        </select>
        {#if rs.saving}
          <span class="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted animate-pulse">…</span>
        {/if}
      </div>
      {#if rs.error}
        <p class="text-[10px] text-red-400 mt-1">{rs.error}</p>
      {/if}
    </td>

    <!-- Prio -->
    <td class="px-4 py-3 text-sm whitespace-nowrap align-top {PRIO_CLS[t.priority] ?? ''}">
      {PRIO_ICON[t.priority]} {t.priority}
    </td>

    <!-- Zuständig -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {t.assigneeLabel ?? '—'}
    </td>

    <!-- Kunde -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {t.customerLabel ?? '—'}
    </td>

    <!-- Fällig -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {formatDate(t.dueDate)}
    </td>

    <!-- AI/Human pill + Edit -->
    <td class="px-4 py-3 align-top">
      <div class="flex flex-col gap-2 items-end">

        <!-- 3-segment pill -->
        <div class="flex rounded-md border border-dark-lighter overflow-hidden text-[10px]">
          {#each [
            { mode: 'ai_ready'    as AttentionMode, label: '🤖', activeClass: 'bg-green-900/30 text-green-400'  },
            { mode: 'auto'        as AttentionMode, label: '⚙️', activeClass: 'bg-indigo-900/30 text-indigo-400'},
            { mode: 'needs_human' as AttentionMode, label: '👤', activeClass: 'bg-red-900/30 text-red-400'     },
          ] as seg}
            <button
              type="button"
              disabled={rs.saving}
              onclick={() => patchAttentionMode(t.id, seg.mode)}
              class="px-2 py-1 border-r border-dark-lighter last:border-r-0 transition-colors disabled:opacity-50
                     {rs.attentionMode === seg.mode ? seg.activeClass : 'text-muted hover:text-light bg-dark-light'}"
              title={seg.mode}
            >{seg.label}</button>
          {/each}
        </div>

        <!-- Edit button -->
        <button
          type="button"
          class="quick-edit-btn text-xs px-2 py-1 bg-dark-lighter border border-dark-border rounded
                 hover:border-gold/40 hover:text-gold transition-colors"
          data-ticket={JSON.stringify(t)}
        >✏️ Edit</button>

      </div>
    </td>
  </tr>

  <!-- Answer widget row — only for needs_human + ai_question -->
  {#if showWidget}
    <tr class="border-b border-dark-lighter/50 bg-red-950/10">
      <td colspan="9" class="px-6 py-3">
        <div class="flex flex-col gap-2 max-w-2xl">

          <!-- AI question block -->
          <div class="rounded-lg border border-red-800/40 bg-red-900/10 px-4 py-3">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1">🤖 KI-Frage</p>
            <p class="text-sm text-red-200 leading-relaxed">{t.aiQuestion}</p>
            {#if rs.humanAnswer}
              <p class="text-[10px] text-muted mt-2 italic">Letzte Antwort: {rs.humanAnswer}</p>
            {/if}
          </div>

          <!-- Answer textarea + submit -->
          <div class="flex gap-2 items-end">
            <textarea
              bind:value={rs.answer}
              rows="2"
              placeholder="Antwort eingeben…"
              disabled={rs.answerSaving}
              class="flex-1 px-3 py-2 text-sm bg-dark border border-dark-lighter rounded-lg text-light
                     resize-none focus:outline-none focus:border-green-600/60 disabled:opacity-50"
            ></textarea>
            <button
              type="button"
              disabled={rs.answerSaving || !rs.answer.trim()}
              onclick={() => submitAnswer(t.id)}
              class="px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap
                     {rs.answerSaved
                       ? 'bg-green-900/30 border-green-700 text-green-400'
                       : 'bg-dark-lighter border-dark-border text-light hover:border-green-700 hover:text-green-400'}
                     disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rs.answerSaving ? '…' : rs.answerSaved ? '✓ Gespeichert' : '✓ Antworten → 🤖'}
            </button>
          </div>

        </div>
      </td>
    </tr>
  {/if}
{/each}
{/if}
  </tbody>
</table>
