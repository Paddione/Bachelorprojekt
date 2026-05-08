<!-- website/src/components/admin/TicketActionBar.svelte -->
<script lang="ts">
  import type { TicketStatus, TicketResolution, ListedTicket, LinkKind } from '../../lib/tickets/admin';

  export let ticketId: string;
  export let currentStatus: TicketStatus;

  let mode: '' | 'transition' | 'comment' | 'link' = '';
  let busy = false;
  let error = '';

  // Transition state
  let nextStatus: TicketStatus = currentStatus;
  let resolution: TicketResolution | '' = '';
  let transitionNote = '';
  let transitionVisibility: 'internal' | 'public' = 'internal';

  // Comment state
  let commentBody = '';
  let commentVisibility: 'internal' | 'public' = 'internal';

  // Link state
  let linkKind: LinkKind = 'relates_to';
  let linkQuery = '';
  let linkResults: ListedTicket[] = [];
  let linkSelectedId = '';
  let linkPrNumber: number | null = null;

  const STATUSES: TicketStatus[] = ['triage','backlog','in_progress','in_review','blocked','done','archived'];
  const RESOLUTIONS: TicketResolution[] = ['fixed','shipped','wontfix','duplicate','cant_reproduce','obsolete'];
  const LINK_KINDS: LinkKind[] = ['blocks','blocked_by','duplicate_of','relates_to','fixes','fixed_by'];

  function reset() {
    mode = ''; busy = false; error = '';
    nextStatus = currentStatus; resolution = ''; transitionNote = ''; transitionVisibility = 'internal';
    commentBody = ''; commentVisibility = 'internal';
    linkKind = 'relates_to'; linkQuery = ''; linkResults = []; linkSelectedId = ''; linkPrNumber = null;
  }

  async function searchLink() {
    if (linkQuery.trim().length < 2) { linkResults = []; return; }
    const r = await fetch(`/api/admin/tickets?q=${encodeURIComponent(linkQuery)}&limit=10`);
    if (r.ok) {
      const j = await r.json() as { items: ListedTicket[] };
      linkResults = j.items.filter(it => it.id !== ticketId);
    }
  }

  async function submitTransition() {
    busy = true; error = '';
    const needsResolution = nextStatus === 'done' || nextStatus === 'archived';
    if (needsResolution && !resolution) { error = 'Resolution erforderlich für done/archived.'; busy = false; return; }
    const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        resolution: needsResolution ? resolution : undefined,
        note: transitionNote || undefined,
        noteVisibility: transitionVisibility,
      }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Transition fehlgeschlagen'; busy = false; return; }
    location.reload();
  }

  async function submitComment() {
    busy = true; error = '';
    const r = await fetch(`/api/admin/tickets/${ticketId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody, visibility: commentVisibility }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Kommentar fehlgeschlagen'; busy = false; return; }
    location.reload();
  }

  async function submitLink() {
    busy = true; error = '';
    if (!linkSelectedId) { error = 'Ziel-Ticket wählen.'; busy = false; return; }
    const r = await fetch(`/api/admin/tickets/${ticketId}/links`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toId: linkSelectedId, kind: linkKind,
        prNumber: linkPrNumber ?? undefined,
      }),
    });
    if (!r.ok) { error = (await r.json()).error ?? 'Link fehlgeschlagen'; busy = false; return; }
    location.reload();
  }
</script>

<div class="ticket-action-bar">
  <button type="button" on:click={() => mode = 'transition'} class:active={mode === 'transition'}>Status ändern</button>
  <button type="button" on:click={() => mode = 'comment'}    class:active={mode === 'comment'}>Kommentar</button>
  <button type="button" on:click={() => mode = 'link'}       class:active={mode === 'link'}>Verknüpfen</button>

  {#if mode === 'transition'}
    <div class="ticket-action-panel">
      <label>Status<select bind:value={nextStatus} disabled={busy}>
        {#each STATUSES as s}<option value={s}>{s}</option>{/each}
      </select></label>
      {#if nextStatus === 'done' || nextStatus === 'archived'}
        <label>Resolution<select bind:value={resolution} disabled={busy}>
          <option value="">— wählen —</option>
          {#each RESOLUTIONS as r}<option value={r}>{r}</option>{/each}
        </select></label>
      {/if}
      <label>Notiz (optional)<textarea bind:value={transitionNote} disabled={busy}
        rows="2" maxlength="2000" placeholder="Warum dieser Übergang?"></textarea></label>
      <label class="row">
        <input type="checkbox" disabled={busy}
          checked={transitionVisibility === 'public'}
          on:change={(e) => transitionVisibility = e.currentTarget.checked ? 'public' : 'internal'} />
        Notiz öffentlich (Reporter sieht sie in der Close-Mail)
      </label>
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitTransition} disabled={busy}>Speichern</button>
      </div>
    </div>
  {:else if mode === 'comment'}
    <div class="ticket-action-panel">
      <label>Text<textarea bind:value={commentBody} disabled={busy}
        rows="3" maxlength="4000" placeholder="Kommentar (max. 4000 Zeichen)"></textarea></label>
      <label class="row">
        <input type="checkbox" disabled={busy}
          checked={commentVisibility === 'public'}
          on:change={(e) => commentVisibility = e.currentTarget.checked ? 'public' : 'internal'} />
        Öffentlich (E-Mail an Reporter)
      </label>
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitComment} disabled={busy || !commentBody.trim()}>
          Posten
        </button>
      </div>
    </div>
  {:else if mode === 'link'}
    <div class="ticket-action-panel">
      <label>Beziehung<select bind:value={linkKind} disabled={busy}>
        {#each LINK_KINDS as k}<option value={k}>{k}</option>{/each}
      </select></label>
      <label>Ziel suchen
        <input type="text" bind:value={linkQuery} on:input={searchLink} disabled={busy}
          placeholder="Titel oder Ticket-ID" />
      </label>
      {#if linkResults.length > 0}
        <ul class="ticket-link-results">
          {#each linkResults as r (r.id)}
            <li>
              <label>
                <input type="radio" bind:group={linkSelectedId} value={r.id} />
                <span class="mono">{r.externalId ?? r.id.slice(0, 8)}</span>
                <span>{r.title}</span>
                <span class="mute">[{r.type} · {r.status}]</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
      {#if linkKind === 'fixes' || linkKind === 'fixed_by'}
        <label>PR-Nummer (optional)
          <input type="number" bind:value={linkPrNumber} disabled={busy} min="1" />
        </label>
      {/if}
      <div class="actions">
        <button type="button" on:click={reset} disabled={busy}>Abbrechen</button>
        <button type="button" class="primary" on:click={submitLink} disabled={busy || !linkSelectedId}>
          Verknüpfen
        </button>
      </div>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .ticket-action-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  .ticket-action-bar > button {
    padding: 6px 12px; font-size: 13px; border-radius: 6px;
    border: 1px solid var(--brass-d, #2a3a52); background: var(--ink-850, #1a2235); color: var(--fg, #e8e8f0);
    cursor: pointer;
  }
  .ticket-action-bar > button.active { background: var(--brass, #e8c870); color: var(--ink-900, #0f1623); border-color: var(--brass, #e8c870); }
  .ticket-action-panel {
    flex-basis: 100%; padding: 12px; background: var(--ink-850, #1a2235);
    border: 1px solid var(--brass-d, #2a3a52); border-radius: 10px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .ticket-action-panel label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--mute, #aabbcc); }
  .ticket-action-panel label.row { flex-direction: row; align-items: center; gap: 6px; }
  .ticket-action-panel input[type="text"], .ticket-action-panel input[type="number"], .ticket-action-panel select, .ticket-action-panel textarea {
    background: var(--ink-900, #0f1623); border: 1px solid var(--brass-d, #2a3a52);
    border-radius: 6px; padding: 6px 8px; color: var(--fg, #e8e8f0); font-size: 13px;
  }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .actions button { padding: 6px 14px; font-size: 13px; border-radius: 6px; cursor: pointer; }
  .actions button.primary { background: var(--brass, #e8c870); color: var(--ink-900, #0f1623); border: 1px solid var(--brass, #e8c870); }
  .ticket-link-results { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto;
    border: 1px solid var(--brass-d, #2a3a52); border-radius: 6px; }
  .ticket-link-results li { padding: 4px 8px; font-size: 12px; }
  .ticket-link-results li:hover { background: rgba(255,255,255,0.04); }
  .mono { font-family: monospace; color: var(--brass, #e8c870); }
  .mute { color: var(--mute, #aabbcc); font-size: 11px; }
  .error { color: #ff6b6b; font-size: 12px; margin: 0; }
</style>
