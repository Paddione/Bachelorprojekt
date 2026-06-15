<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { transitionTicket, patchTitle, patchDescription } from '../../lib/tickets/cockpit-table-actions';
  export let ticket: TicketRowT | null;
  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  export let onMutated: ((detail: { ticketId: string }) => void) | undefined = undefined;
  const dispatch = createEventDispatcher();

  let title = '';
  let description = '';
  let saving = false;
  let error: string | null = null;
  $: if (ticket) { title = ticket.title; description = ticket.description ?? ''; }

  const TRANSITIONS = [
    { label: '→ In Arbeit', status: 'in_progress' },
    { label: '→ Review', status: 'in_review' },
    { label: '→ Erledigt', status: 'done' },
  ];

  function close() { onClose?.(); dispatch('close'); }
  function notify() {
    if (!ticket) return;
    const detail = { ticketId: ticket.id };
    onMutated?.(detail); dispatch('mutated', detail);
  }

  async function saveTitle() {
    if (!ticket) return;
    const old = ticket.title; saving = true; error = null;
    if (await patchTitle(ticket.id, title)) { ticket = { ...ticket, title }; notify(); }
    else { title = old; error = 'Titel konnte nicht gespeichert werden.'; }
    saving = false;
  }
  async function saveDescription() {
    if (!ticket) return;
    if (description === (ticket.description ?? '')) return;
    const old = ticket.description ?? ''; saving = true; error = null;
    if (await patchDescription(ticket.id, description)) { ticket = { ...ticket, description }; notify(); }
    else { description = old; error = 'Beschreibung konnte nicht gespeichert werden.'; }
    saving = false;
  }
  async function transition(status: string) {
    if (!ticket) return;
    saving = true; error = null;
    if (await transitionTicket(ticket.id, status)) { ticket = { ...ticket, status }; notify(); }
    else { error = 'Statuswechsel fehlgeschlagen.'; }
    saving = false;
  }
  async function archive() { await transition('archived'); }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open && ticket}
  <div class="backdrop" on:click={close} role="presentation"></div>
  <aside class="drawer" data-testid="ticket-drawer" aria-label="Ticket-Details">
    <header>
      <button class="back" aria-label="Zurück" on:click={close}>←</button>
      <h3>{ticket.extId}</h3>
      <button class="close" aria-label="Schließen" on:click={close}>×</button>
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <label class="fld">Titel
      <input bind:value={title} on:blur={saveTitle} />
    </label>

    <dl class="meta">
      <dt>Status</dt><dd>{ticket.status}</dd>
      <dt>Priorität</dt><dd>{ticket.priority}</dd>
      <dt>Typ</dt><dd>{ticket.type}</dd>
      {#if ticket.createdAt}<dt>Erstellt</dt><dd>{ticket.createdAt.slice(0, 10)}</dd>{/if}
    </dl>

    <label class="fld">Beschreibung
      <textarea data-testid="drawer-description" rows="4"
        bind:value={description} on:blur={saveDescription}></textarea>
    </label>

    <div class="transitions">
      {#each TRANSITIONS as tr}
        <button data-testid="drawer-transition" disabled={saving}
          on:click={() => transition(tr.status)}>{tr.label}</button>
      {/each}
    </div>

    <footer>
      <button on:click={archive} disabled={saving}>Archivieren</button>
      <button on:click={close}>Schließen</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(400px, 90vw);
    background: #14171d; z-index: 50; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
    overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .back { display: none; background: none; border: none; color: inherit; font-size: 1.3rem; cursor: pointer; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  .fld { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  input, textarea { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; padding: 0.4rem; border-radius: 4px; font: inherit; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0; font-size: 0.82rem; }
  .meta dt { color: #9ca3af; } .meta dd { margin: 0; }
  .transitions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .transitions button { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; border-radius: 6px;
    padding: 0.35rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
  .error { color: #ef4444; font-size: 0.85rem; margin: 0; }
  footer { margin-top: auto; display: flex; gap: 0.5rem; }
  footer button { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; border-radius: 6px;
    padding: 0.4rem 0.8rem; cursor: pointer; }

  @media (max-width: 767px) {
    .drawer { inset: 0; width: 100%; height: 100%; }
    .back { display: inline-block; }
    .close { display: none; }
  }
</style>
