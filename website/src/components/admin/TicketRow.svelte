<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
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

  const STATUSES = ['triage', 'backlog', 'planning', 'in_progress', 'in_review', 'blocked', 'done'];
  const PRIORITIES = ['niedrig', 'mittel', 'hoch'];

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
    {#each STATUSES as s}<option value={s}>{s}</option>{/each}
  </select>
  <select data-testid="priority-select" value={ticket.priority} on:change={handlePriority} disabled={busy}>
    {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
  </select>
  <span class="created ticket-col-created">{relDate(ticket.createdAt)}</span>
</div>

<style>
  .row { display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto; gap: 0.5rem;
    align-items: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid #2a2e37;
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

  @media (max-width: 767px) {
    .row { grid-template-columns: auto auto 1fr auto; }
    .ticket-col-id, .ticket-col-created { display: none; }
    .row :global([data-testid="priority-select"]) { display: none; }
  }
</style>
