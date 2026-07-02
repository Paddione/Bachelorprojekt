<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { WORKFLOW_STATUSES, ALL_PRIORITIES, statusLabel, priorityLabel } from '../../lib/tickets/cockpit-labels';
  export let ticket: TicketRowT;
  export let selected = false;
  export let busy = false;
  export let expanded = false;
  // Svelte 5 callback props (also dispatched as events for parent on:xxx compatibility)
  export let onStatusChange: ((detail: { id: string; status: string }) => void) | undefined = undefined;
  export let onPriorityChange: ((detail: { id: string; priority: string }) => void) | undefined = undefined;
  export let onSelectToggle: ((detail: { id: string }) => void) | undefined = undefined;
  export let onDragStart: ((detail: { id: string; event: DragEvent }) => void) | undefined = undefined;
  export let onToggleExpand: (() => void) | undefined = undefined;

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
  function handleDragStart(e: DragEvent) {
    e.dataTransfer?.setData('text/plain', ticket.id);
    const detail = { id: ticket.id, event: e };
    onDragStart?.(detail);
    dispatch('dragStart', detail);
  }
  function handleRowActivate(e: MouseEvent | KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && typeof target.closest === 'function' && target.closest('.title-link')) return;
    onToggleExpand?.();
  }
  function handleRowKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      if ((e.target as HTMLElement | null)?.closest('.title-link')) return;
      e.preventDefault();
      onToggleExpand?.();
    }
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

<div class="row prio-{ticket.priority}" class:selected class:row--expanded={expanded} aria-busy={busy} aria-expanded={expanded}
     role="button" tabindex="0"
     on:click={handleRowActivate}
     on:keydown={handleRowKey}>
  <input type="checkbox" data-testid="row-checkbox" checked={selected}
    on:change={handleSelectToggle} aria-label={`Select ${ticket.title}`} />
  <span class="handle" draggable="true" role="button" tabindex="0" aria-label="Reorder (Shift+Up/Down)"
    on:dragstart={handleDragStart}>⠿</span>
  <code class="ext ticket-col-id">{ticket.extId}</code>
  <a class="title-link cockpit-ticket-title" href="/admin/tickets/{ticket.id}" title={ticket.title}>
    <span class="type-dot type-dot--{ticket.type}"></span>
    {ticket.title}
  </a>
  <select data-testid="status-select" class="status-sel" data-s={ticket.status}
    value={ticket.status} on:change={handleStatus} disabled={busy}>
    {#each STATUSES as s}<option value={s}>{statusLabel(s)}</option>{/each}
  </select>
  <select class="prio-sel priority-select" data-testid="priority-select" value={ticket.priority}
    on:change={handlePriority} disabled={busy}>
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
  .row {
    display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-left: 3px solid transparent;
    transition: background 0.1s ease;
  }
  .row:hover { background: var(--admin-surface-hover, rgba(255,255,255,0.05)); }
  .row.selected { background: rgba(110,168,254,0.08); border-left-color: #6ea8fe; }
  .row[aria-busy="true"] { opacity: 0.6; pointer-events: none; }
  .row--expanded { background: var(--admin-surface-hover, rgba(255,255,255,0.05)); }
  .row.prio-niedrig { border-left-color: #10b981; }
  .row.prio-mittel  { border-left-color: #f59e0b; }
  .row.prio-hoch    { border-left-color: #f97316; }
  .row.prio-kritisch{ border-left-color: #ef4444; }

  .handle {
    cursor: grab;
    color: var(--admin-text-mute, #8c96a3);
    font-size: 0.88rem;
    user-select: none;
    transition: color 0.1s;
    line-height: 1;
  }
  .handle:hover { color: var(--admin-text, #eef1f3); }

  .ext {
    font-family: var(--font-mono, monospace);
    font-size: 0.68rem;
    color: var(--admin-primary, #818cf8);
    background: oklch(0.80 0.09 75 / 0.1);
    padding: 1px 5px;
    border-radius: 4px;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .title-link {
    color: var(--admin-text, #eef1f3);
    text-decoration: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    overflow: hidden;
    font-size: 0.855rem;
    min-width: 0;
  }
  .title-link:hover { color: var(--admin-primary, #818cf8); }

  .type-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .type-dot--bug      { background: #f87171; }
  .type-dot--task     { background: #60a5fa; }
  .type-dot--feature  { background: #34d399; }
  .type-dot--project  { background: var(--admin-primary, #818cf8); }
  .type-dot--story    { background: #a78bfa; }
  .type-dot--spike    { background: #fb923c; }

  /* Status as colored pill-select */
  .status-sel {
    appearance: none; -webkit-appearance: none;
    font-size: 0.72rem; font-weight: 600;
    padding: 0.22rem 1.3rem 0.22rem 0.55rem;
    border-radius: 9999px;
    cursor: pointer;
    border: 1px solid;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238c96a3'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.42rem center;
    background-size: 7px;
    white-space: nowrap;
    transition: filter 0.1s, opacity 0.1s;
    outline: none;
  }
  .status-sel:hover:not(:disabled) { filter: brightness(1.15); }
  .status-sel:focus { outline: 2px solid var(--admin-primary, #818cf8); outline-offset: 1px; }
  .status-sel:disabled { opacity: 0.55; cursor: default; }
  .status-sel[data-s="triage"]          { background-color: rgba(168,85,247,0.14); color: #d8b4fe; border-color: rgba(168,85,247,0.34); }
  .status-sel[data-s="backlog"]         { background-color: rgba(100,116,139,0.14); color: #94a3b8; border-color: rgba(100,116,139,0.28); }
  .status-sel[data-s="in_progress"]     { background-color: rgba(234,179,8,0.18);  color: #fde68a; border-color: rgba(234,179,8,0.34); }
  .status-sel[data-s="in_review"]       { background-color: rgba(99,102,241,0.16); color: #a5b4fc; border-color: rgba(99,102,241,0.34); }
  .status-sel[data-s="blocked"]         { background-color: rgba(239,68,68,0.16);  color: #fca5a5; border-color: rgba(239,68,68,0.34); }
  .status-sel[data-s="done"]            { background-color: rgba(16,185,129,0.14); color: #6ee7b7; border-color: rgba(16,185,129,0.28); }
  .status-sel[data-s="awaiting_deploy"] { background-color: rgba(6,182,212,0.14);  color: #67e8f9; border-color: rgba(6,182,212,0.28); }
  .status-sel[data-s="archived"]        { background-color: rgba(255,255,255,0.04); color: #6b7280; border-color: rgba(255,255,255,0.1); }

  /* Priority select */
  .prio-sel {
    appearance: none; -webkit-appearance: none;
    font-size: 0.72rem; font-weight: 500;
    padding: 0.22rem 1.1rem 0.22rem 0.45rem;
    border-radius: 6px;
    cursor: pointer;
    background-color: var(--admin-surface, rgba(255,255,255,0.04));
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238c96a3'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.3rem center;
    background-size: 7px;
    white-space: nowrap;
    outline: none;
    transition: opacity 0.1s;
  }
  .prio-sel:disabled { opacity: 0.55; cursor: default; }
  .row.prio-niedrig  .prio-sel { color: #10b981; }
  .row.prio-mittel   .prio-sel { color: #f59e0b; }
  .row.prio-hoch     .prio-sel { color: #f97316; }
  .row.prio-kritisch .prio-sel { color: #ef4444; }

  .created { color: var(--admin-text-mute, #8c96a3); font-size: 0.7rem; white-space: nowrap; }

  .os-badges { display: flex; gap: 0.25rem; align-items: center; }
  .os-badge {
    font-size: 0.62rem; font-weight: 700;
    padding: 0.15rem 0.4rem; border-radius: 4px;
    letter-spacing: 0.04em; white-space: nowrap;
  }
  .os-badge--planning    { background: rgba(120,53,15,0.6);  color: #fde68a; }
  .os-badge--plan_staged { background: rgba(20,83,45,0.6);   color: #86efac; }
  .os-badge--archived    { background: rgba(55,65,81,0.6);   color: #9ca3af; }

  @media (max-width: 767px) {
    .row { grid-template-columns: auto auto 1fr auto; }
    .ticket-col-id, .ticket-col-created, .ticket-col-openspec { display: none; }
    .priority-select { display: none; }
  }
</style>
