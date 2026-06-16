<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { transitionTicket, patchTitle, patchDescription, patchPriority } from '../../lib/tickets/cockpit-table-actions';
  import {
    statusLabel, priorityLabel, typeLabel, resolutionLabel, RESOLUTION_LABELS,
    ALL_PRIORITIES, nextTransitions, isTerminal, defaultResolutionFor,
  } from '../../lib/tickets/cockpit-labels';
  import MarkdownEditor from './MarkdownEditor.svelte';
  export let ticket: TicketRowT | null;
  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  export let onMutated: ((detail: { ticketId: string }) => void) | undefined = undefined;
  const dispatch = createEventDispatcher();

  let title = '';
  let description = '';
  let saving = false;
  let error: string | null = null;
  let resolution = 'shipped';
  $: if (ticket) {
    title = ticket.title;
    description = ticket.description ?? '';
    resolution = defaultResolutionFor(ticket.type);
  }
  $: transitions = ticket ? nextTransitions(ticket.status) : [];
  $: showResolution = transitions.some((s) => isTerminal(s));
  const RES_OPTIONS = Object.keys(RESOLUTION_LABELS);

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
  async function savePriority(e: Event) {
    if (!ticket) return;
    const priority = (e.target as HTMLSelectElement).value;
    saving = true; error = null;
    if (await patchPriority(ticket.id, priority)) { ticket = { ...ticket, priority }; notify(); }
    else { error = 'Priorität konnte nicht gespeichert werden.'; }
    saving = false;
  }
  async function transition(status: string) {
    if (!ticket) return;
    saving = true; error = null;
    const res = isTerminal(status) ? resolution : undefined;
    if (await transitionTicket(ticket.id, status, res)) { ticket = { ...ticket, status }; notify(); }
    else { error = 'Statuswechsel fehlgeschlagen.'; }
    saving = false;
  }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open && ticket}
  <div class="backdrop" on:click={close} role="presentation"></div>
  <aside class="drawer" data-testid="ticket-drawer" aria-label="Ticket-Details">
    <header>
      <button class="back" aria-label="Zurück" on:click={close}>←</button>
      <code class="ext">{ticket.extId}</code>
      <button class="close" aria-label="Schließen" on:click={close}>×</button>
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <label class="fld">Titel
      <input bind:value={title} on:blur={saveTitle} />
    </label>

    <div class="badges">
      <span class="badge status">{statusLabel(ticket.status)}</span>
      <label class="prio-edit">Priorität
        <select data-testid="drawer-priority" value={ticket.priority}
          on:change={savePriority} disabled={saving}>
          {#each ALL_PRIORITIES as p}<option value={p}>{priorityLabel(p)}</option>{/each}
        </select>
      </label>
    </div>

    <dl class="meta">
      <dt>Typ</dt><dd>{typeLabel(ticket.type)}</dd>
      {#if ticket.component}<dt>Komponente</dt><dd>{ticket.component}</dd>{/if}
      {#if ticket.createdAt}<dt>Erstellt</dt><dd>{ticket.createdAt.slice(0, 10)}</dd>{/if}
    </dl>

    <div class="fld"><span>Beschreibung</span>
      <MarkdownEditor testid="drawer-description" rows={4}
        bind:value={description} onblur={saveDescription} />
    </div>

    {#if showResolution}
      <label class="fld">Resolution (bei Erledigt/Archiviert)
        <select data-testid="drawer-resolution" bind:value={resolution}>
          {#each RES_OPTIONS as r}<option value={r}>{resolutionLabel(r)}</option>{/each}
        </select>
      </label>
    {/if}

    <div class="transitions">
      {#each transitions as tr}
        <button data-testid="drawer-transition" disabled={saving}
          on:click={() => transition(tr)}>→ {statusLabel(tr)}</button>
      {/each}
    </div>

    <footer>
      <a class="fullview" data-testid="drawer-fullview"
        href={`/admin/tickets/${ticket.id}`}>Vollansicht öffnen ↗</a>
      <button on:click={close}>Schließen</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(400px, 90vw);
    background: var(--admin-surface, #14171d); z-index: 50; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
    overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .ext { font-family: var(--font-mono, monospace); font-size: 0.9rem; opacity: 0.8; }
  .back { display: none; background: none; border: none; color: inherit; font-size: 1.3rem; cursor: pointer; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  .fld { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  input, select { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37); color: inherit; padding: 0.4rem; border-radius: 4px; font: inherit; }
  .badges { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .badge { display: inline-block; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
    background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37); }
  .prio-edit { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--admin-text-mute, #9ca3af); }
  .prio-edit select { padding: 0.25rem 0.4rem; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0; font-size: 0.82rem; }
  .meta dt { color: var(--admin-text-mute, #9ca3af); } .meta dd { margin: 0; }
  .transitions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .transitions button { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37); color: inherit; border-radius: 6px;
    padding: 0.35rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
  .transitions button:disabled { opacity: 0.5; cursor: default; }
  .error { color: #ef4444; font-size: 0.85rem; margin: 0; }
  footer { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .fullview { color: var(--admin-primary, #6ea8fe); font-size: 0.82rem; text-decoration: none; }
  .fullview:hover { text-decoration: underline; }
  footer button { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37); color: inherit; border-radius: 6px;
    padding: 0.4rem 0.8rem; cursor: pointer; }

  @media (max-width: 767px) {
    .drawer { inset: 0; width: 100%; height: 100%; }
    .back { display: inline-block; }
    .close { display: none; }
  }
</style>
