<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { WORKFLOW_STATUSES, ALL_PRIORITIES, statusLabel, priorityLabel } from '../../lib/tickets/cockpit-labels';
  export let ticket: TicketRowT;
  export let selected = false;
  export let busy = false;
  // Svelte 5 callback props (also dispatched as events for parent on:xxx compatibility)
  export let onStatusChange: ((detail: { id: string; status: string }) => void) | undefined = undefined;
  export let onPriorityChange: ((detail: { id: string; priority: string }) => void) | undefined = undefined;
  export let onSelectToggle: ((detail: { id: string }) => void) | undefined = undefined;
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;
  export let onDragStart: ((detail: { id: string; event: DragEvent }) => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  // Always include the ticket's current value so an out-of-list status/priority
  // (e.g. legacy 'planning') still displays selected instead of showing blank.
  $: STATUSES = WORKFLOW_STATUSES.includes(ticket.status as never)
    ? [...WORKFLOW_STATUSES] : [ticket.status, ...WORKFLOW_STATUSES];
  $: PRIORITIES = ALL_PRIORITIES.includes(ticket.priority as never)
    ? [...ALL_PRIORITIES] : [ticket.priority, ...ALL_PRIORITIES];

  function handleStatus(e: Event) {
    const detail = { id: ticket.id, status: (e.target as HTMLSelectElement).value };
    onStatusChange?.(detail);
    dispatch('statusChange', detail);
  }
  function handlePriority(e: Event) {
    const detail = { id: ticket.id, priority: (e.target as HTMLSelectElement).value };
    onPriorityChange?.(detail);
    dispatch('priorityChange', detail);
  }
  function handleSelectToggle() {
    const detail = { id: ticket.id };
    onSelectToggle?.(detail);
    dispatch('selectToggle', detail);
  }
  function handleOpenDrawer() {
    const detail = { ticket };
    onOpenDrawer?.(detail);
    dispatch('openDrawer', detail);
  }
  function handleDragStart(e: DragEvent) {
    e.dataTransfer?.setData('text/plain', ticket.id);
    const detail = { id: ticket.id, event: e };
    onDragStart?.(detail);
    dispatch('dragStart', detail);
  }

  function relDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days <= 0) return 'heute';
    if (days === 1) return 'gestern';
    return `vor ${days}T`;
  }
</script>

<div class="row prio-{ticket.priority}" class:selected aria-busy={busy}>
  <input type="checkbox" data-testid="row-checkbox" checked={selected}
    on:change={handleSelectToggle} aria-label={`Select ${ticket.title}`} />
  <span class="handle" draggable="true" role="button" tabindex="0" aria-label="Reorder (Shift+Up/Down)"
    on:dragstart={handleDragStart}>⋮⋮</span>
  <code class="ext ticket-col-id">{ticket.extId}</code>
  <button class="title-link" on:click={handleOpenDrawer}>{ticket.title}</button>
  <select data-testid="status-select" value={ticket.status} on:change={handleStatus} disabled={busy}>
    {#each STATUSES as s}<option value={s}>{statusLabel(s)}</option>{/each}
  </select>
  <select class="priority-select" data-testid="priority-select" value={ticket.priority} on:change={handlePriority} disabled={busy}>
    {#each PRIORITIES as p}<option value={p}>{priorityLabel(p)}</option>{/each}
  </select>
  <span class="created ticket-col-created">{relDate(ticket.createdAt)}</span>
  <span class="os-badges ticket-col-openspec">
    {#if ticket.openspecProposals && ticket.openspecProposals.length > 0}
      {#each ticket.openspecProposals as p (p.slug)}
        <span class="os-badge os-badge--{p.status}" title={p.slug}>
          {p.status === 'planning' ? 'SPEC' : p.status === 'plan_staged' ? 'READY' : 'DONE'}
        </span>
      {/each}
    {/if}
  </span>
</div>

<style>
  .row { display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto auto; gap: 0.5rem;
    align-items: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--admin-border, #2a2e37);
    border-left: 3px solid transparent; }
  .row.selected { background: rgba(110,168,254,0.12); }
  .row.prio-niedrig { border-left-color: #10b981; }
  .row.prio-mittel  { border-left-color: #f59e0b; }
  .row.prio-hoch    { border-left-color: #f97316; }
  .row.prio-kritisch{ border-left-color: #ef4444; }
  .handle { cursor: grab; opacity: 0.5; }
  .title-link { background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0; }
  .ext { opacity: 0.6; font-size: 0.75rem; font-family: var(--font-mono, monospace); }
  .created { opacity: 0.6; font-size: 0.72rem; white-space: nowrap; }
  .os-badges { display: flex; gap: 0.25rem; align-items: center; }
  .os-badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px;
    letter-spacing: 0.04em; white-space: nowrap; }
  .os-badge--planning   { background: #78350f; color: #fde68a; }
  .os-badge--plan_staged{ background: #14532d; color: #86efac; }
  .os-badge--archived   { background: #374151; color: #9ca3af; }

  @media (max-width: 767px) {
    .row { grid-template-columns: auto auto 1fr auto; }
    .ticket-col-id, .ticket-col-created, .ticket-col-openspec { display: none; }
    .priority-select { display: none; }
  }
</style>
