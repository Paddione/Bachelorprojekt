<script lang="ts">
  import type { FeatureNode, TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, toggleTicketSelection, applyOptimistic, clearSelection } from '../../lib/stores/cockpitStore';
  import * as actions from '../../lib/tickets/cockpit-table-actions';
  import TicketRow from './TicketRow.svelte';
  import BulkBar from './BulkBar.svelte';

  export let feature: FeatureNode | null = null;
  export let tickets: TicketRowT[] = [];
  export let features: FeatureNode[] = [];
  export let onMutated: (() => void) | undefined = undefined;
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;
  export let onOpenCreate: (() => void) | undefined = undefined;

  let busy: Record<string, boolean> = {};
  let dragId: string | null = null;
  let search = '';
  let statusFilter = '';

  const CHIPS: { label: string; value: string }[] = [
    { label: 'Alle', value: '' },
    { label: 'Offen', value: 'open' },
    { label: 'In Arbeit', value: 'in_progress' },
    { label: 'Review', value: 'in_review' },
    { label: 'Blockiert', value: 'blocked' },
    { label: 'Erledigt', value: 'done' },
  ];

  $: selectedIds = [...$cockpitStore.selectedTickets];
  $: visible = tickets.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function patchStatus(id: string, status: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    if (await actions.transitionTicket(id, status)) { onMutated?.(); }
    else { t.status = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }

  async function patchPriority(id: string, priority: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.priority; t.priority = priority; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'priority', priority, old);
    if (await actions.patchPriority(id, priority)) { onMutated?.(); }
    else { t.priority = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }

  async function persistOrder() {
    const snapshot = [...tickets];
    if (await actions.reorderTickets(tickets)) { onMutated?.(); }
    else { tickets = snapshot; }
  }
  function moveBy(id: string, delta: number) {
    const i = tickets.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= tickets.length) return;
    [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
    tickets = [...tickets];
    persistOrder();
  }
  function onRowKey(e: KeyboardEvent, id: string) {
    if (!e.shiftKey) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); moveBy(id, -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveBy(id, 1); }
  }
  function onDragStart(id: string) { dragId = id; }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = tickets.findIndex((t) => t.id === dragId);
    const to = tickets.findIndex((t) => t.id === targetId);
    const [moved] = tickets.splice(from, 1);
    tickets.splice(to, 0, moved);
    tickets = [...tickets]; dragId = null; persistOrder();
  }
  async function runBatch(mutation: Record<string, unknown>, ids: string[]) {
    if (await actions.runBatch(ids, mutation)) { clearSelection(); onMutated?.(); }
  }
</script>

<section class="cockpit-table" data-testid="cockpit-table">
  <div class="toolbar">
    <input class="search" data-testid="table-search" type="search"
      placeholder="Suche…" bind:value={search} aria-label="Tickets durchsuchen" />
    <div class="chips" role="group" aria-label="Status-Filter">
      {#each CHIPS as c}
        <button class="chip" class:active={statusFilter === c.value}
          data-testid="status-chip" on:click={() => (statusFilter = c.value)}>{c.label}</button>
      {/each}
    </div>
    <button class="create" data-testid="open-create" on:click={() => onOpenCreate?.()}>+ Ticket</button>
  </div>

  <div class="rows">
    {#each visible as t (t.id)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div role="listitem" on:keydown={(e) => onRowKey(e, t.id)}
           on:dragover|preventDefault on:drop={() => onDrop(t.id)}>
        <TicketRow ticket={t} busy={busy[t.id]}
          selected={$cockpitStore.selectedTickets.has(t.id)}
          onStatusChange={(d) => patchStatus(d.id, d.status)}
          onPriorityChange={(d) => patchPriority(d.id, d.priority)}
          onSelectToggle={(d) => toggleTicketSelection(d.id)}
          onDragStart={(d) => onDragStart(d.id)}
          onOpenDrawer={(d) => onOpenDrawer?.(d)} />
      </div>
    {/each}
    {#if visible.length === 0}<p class="empty">Keine Tickets</p>{/if}
  </div>

  <BulkBar selectedIds={selectedIds} {features}
    onBulkStatus={(d) => runBatch({ status: d.status }, d.ids)}
    onBulkPriority={(d) => runBatch({ priority: d.priority }, d.ids)}
    onBulkReparent={(d) => runBatch({ parentId: d.parentId }, d.ids)}
    onBulkEnqueue={(d) => runBatch({ enqueue: true }, d.ids)}
    onClear={clearSelection} />
</section>

<style>
  .cockpit-table { display: flex; flex-direction: column; gap: 0.5rem; min-height: 0; }
  .toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .search { flex: 1 1 180px; min-width: 140px; background: var(--admin-bg, #1c1f26);
    border: 1px solid var(--admin-border, #2a2e37); color: inherit; border-radius: 6px; padding: 0.4rem 0.6rem; }
  .chips { display: flex; gap: 0.25rem; overflow-x: auto; }
  .chip { background: transparent; border: 1px solid var(--admin-border, #2a2e37);
    color: var(--admin-text-mute, #9ca3af); border-radius: 999px; padding: 0.25rem 0.65rem;
    font-size: 0.78rem; cursor: pointer; white-space: nowrap; }
  .chip.active { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12); border-color: transparent; font-weight: 600; }
  .create { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12);
    border: none; border-radius: 6px; padding: 0.4rem 0.8rem; cursor: pointer; font-weight: 600; white-space: nowrap; }
  .rows { display: flex; flex-direction: column; }
  .empty { opacity: 0.6; padding: 0.5rem; }
</style>
