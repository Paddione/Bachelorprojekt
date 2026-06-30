<script lang="ts">
  import type { FeatureNode, TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, toggleTicketSelection, applyOptimistic, clearSelection } from '../../lib/stores/cockpitStore';
  import { defaultResolutionFor, isTerminal } from '../../lib/tickets/cockpit-labels';
  import * as actions from '../../lib/tickets/cockpit-table-actions';
  import TicketRow from './TicketRow.svelte';
  import BulkBar from './BulkBar.svelte';
  import BulkToast from './BulkToast.svelte';
  import FilterBar from './Cockpit/FilterBar.svelte';
  import type { CockpitFilterState } from '../../lib/cockpit-presets';

  export let feature: FeatureNode | null = null;
  export let tickets: TicketRowT[] = [];
  export let features: FeatureNode[] = [];
  export let brand = 'mentolder';
  export let onMutated: (() => void) | undefined = undefined;
  export let onOpenCreate: (() => void) | undefined = undefined;

  let busy: Record<string, boolean> = {};
  let dragId: string | null = null;
  let search = '';
  type ToastResult = { changed: number; skipped: number; failed: number; status: string; undoToken?: string } | null;
  let toastResult: ToastResult = null;
  // Default to "active" so the ~97% done tickets don't drown the few open ones.
  let statusFilter = 'active';
  const PAGE = 50;
  let limit = PAGE;

  const CHIPS: { label: string; value: string }[] = [
    { label: 'Aktiv', value: 'active' },
    { label: 'In Arbeit', value: 'in_progress' },
    { label: 'Review', value: 'in_review' },
    { label: 'Blockiert', value: 'blocked' },
    { label: 'Wartet auf Deploy', value: 'awaiting_deploy' },
    { label: 'Erledigt', value: 'done' },
    { label: 'Alle', value: '' },
  ];

  $: selectedIds = [...$cockpitStore.selectedTickets];
  $: q = search.trim().toLowerCase();
  $: matched = tickets.filter((t) => {
    const matchSearch = !q ||
      t.title.toLowerCase().includes(q) || t.extId.toLowerCase().includes(q);

    const storeFilter = $cockpitStore.filter;

    let matchStatus = true;
    if (storeFilter && storeFilter.status && storeFilter.status.length > 0) {
      matchStatus = storeFilter.status.includes(t.status);
    } else {
      matchStatus =
        statusFilter === '' ? true :
        statusFilter === 'active' ? !isTerminal(t.status) :
        t.status === statusFilter;
    }

    let matchArea = true;
    if (storeFilter && storeFilter.area && storeFilter.area.length > 0) {
      matchArea = !!t.component && storeFilter.area.some(a => a.toLowerCase() === t.component?.toLowerCase());
    }

    let matchBrand = true;
    if (storeFilter && storeFilter.brand && storeFilter.brand.length > 0) {
      matchBrand = storeFilter.brand.includes(brand);
    }

    return matchSearch && matchStatus && matchArea && matchBrand;
  });
  // Cap the rendered DOM — a feature can hold hundreds of tickets.
  $: visible = matched.slice(0, limit);
  $: activeCount = tickets.filter((t) => !isTerminal(t.status)).length;
  $: doneCount = tickets.length - activeCount;
  // Reset to the first page whenever the filter or search term changes.
  $: { void search; void statusFilter; limit = PAGE; }

  $: {
    const storeStatus = $cockpitStore.filter?.status;
    if (storeStatus && storeStatus.length > 0) {
      statusFilter = storeStatus[0];
    }
  }

  function handleApplyPreset(state: CockpitFilterState) {
    cockpitStore.update((s) => ({ ...s, filter: state }));
  }

  function selectStatus(val: string) {
    statusFilter = val;
    cockpitStore.update((s) => ({
      ...s,
      filter: {
        status: val ? [val] : [],
        area: [],
        brand: []
      }
    }));
  }

  async function patchStatus(id: string, status: string) {
    if (busy[id]) return;
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    const resolution = isTerminal(status) ? defaultResolutionFor(t.type) : undefined;
    if (await actions.transitionTicket(id, status, resolution)) { onMutated?.(); }
    else { t.status = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }

  async function patchPriority(id: string, priority: string) {
    if (busy[id]) return;
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
  async function runBulkStatus(d: { ids: string[]; status: string }) {
    const r = await actions.bulkStatusChange(d.ids, d.status);
    if (r.ok) {
      toastResult = { ...r.body, status: d.status };
      clearSelection();
      onMutated?.();
    }
  }
  async function handleUndo(token: string) {
    const r = await actions.undoBulkStatus(token);
    if (r.ok) {
      toastResult = null;
      onMutated?.();
    } else {
      toastResult = { ...toastResult, failed: (toastResult?.failed || 0) + 1 };
    }
  }
</script>

<section class="cockpit-table" data-testid="cockpit-table">
  <div class="toolbar">
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input class="search" data-testid="table-search" type="search"
        placeholder="Suche (Titel oder T-ID)…" bind:value={search} aria-label="Tickets durchsuchen" />
    </div>
    <div class="chips" role="group" aria-label="Status-Filter">
      {#each CHIPS as c}
        <button class="chip" class:active={statusFilter === c.value}
          data-testid="status-chip" on:click={() => selectStatus(c.value)}>{c.label}</button>
      {/each}
    </div>
    <button class="create" data-testid="open-create" on:click={() => onOpenCreate?.()}>+ Ticket</button>
  </div>

  <FilterBar currentFilter={$cockpitStore.filter} onApplyPreset={handleApplyPreset} />

  {#if feature}
    <h2 class="feature-title" data-testid="feature-title">
      {feature.title}
      <span class="feature-meta">· {feature.rollup.pctDone}% erledigt</span>
    </h2>
  {/if}

  <p class="counts" data-testid="table-counts">
    {matched.length} sichtbar · {activeCount} aktiv · {doneCount} erledigt
  </p>

  <div class="table-scroll-container">
    <div class="row-header" data-testid="table-header" role="row" aria-hidden="true">
      <span></span><span></span><span>ID</span><span>Titel</span>
      <span>Status</span><span class="col-prio">Priorität</span>
      <span class="col-date">Erstellt</span><span class="col-openspec">OpenSpec</span>
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
            onDragStart={(d) => onDragStart(d.id)} />
        </div>
      {/each}
      {#if visible.length === 0}<p class="empty">Keine Tickets</p>{/if}
    </div>
  </div>

  {#if matched.length > limit}
    <button class="more" data-testid="load-more" on:click={() => (limit += PAGE)}>
      Mehr anzeigen ({matched.length - limit} weitere)
    </button>
  {/if}

  <BulkBar selectedIds={selectedIds} {features}
    onBulkStatus={runBulkStatus}
    onBulkPriority={(d) => runBatch({ priority: d.priority }, d.ids)}
    onBulkReparent={(d) => runBatch({ parentId: d.parentId }, d.ids)}
    onBulkEnqueue={(d) => runBatch({ enqueue: true }, d.ids)}
    onClear={clearSelection} />
  <BulkToast result={toastResult} onUndo={handleUndo} onDismiss={() => toastResult = null} />
</section>

<style>
  .cockpit-table { display: flex; flex-direction: column; gap: 0.6rem; min-height: 0; }
  .table-scroll-container { overflow-x: auto; width: 100%; border: 1px solid var(--admin-border, rgba(255,255,255,0.07)); border-radius: 10px; }

  .toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .search-wrap { position: relative; flex: 1 1 180px; min-width: 140px; }
  .search-icon { position: absolute; left: 0.55rem; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; opacity: 0.45; pointer-events: none; }
  .search {
    width: 100%; background: var(--admin-surface, rgba(255,255,255,0.04));
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    color: var(--admin-text, #eef1f3); border-radius: 8px;
    padding: 0.42rem 0.6rem 0.42rem 2rem;
    font-size: 0.82rem;
    transition: border-color 0.15s, box-shadow 0.15s;
    outline: none;
    box-sizing: border-box;
  }
  .search:focus { border-color: var(--admin-primary, #818cf8); box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15); }

  .chips { display: flex; gap: 0.25rem; overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    background: transparent;
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    color: var(--admin-text-mute, #8c96a3);
    border-radius: 999px;
    padding: 0.28rem 0.7rem;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .chip:hover { background: var(--admin-surface-hover, rgba(255,255,255,0.06)); color: var(--admin-text, #eef1f3); }
  .chip.active {
    background: var(--admin-primary, #818cf8);
    color: var(--admin-bg, #0b111c);
    border-color: transparent;
    font-weight: 600;
  }

  .create {
    background: var(--admin-primary, #818cf8);
    color: var(--admin-bg, #0b111c);
    border: none; border-radius: 8px;
    padding: 0.42rem 0.9rem;
    cursor: pointer; font-weight: 700; font-size: 0.82rem;
    white-space: nowrap;
    transition: filter 0.12s;
  }
  .create:hover { filter: brightness(1.1); }

  .feature-title { margin: 0.25rem 0 0; font-size: 1rem; font-weight: 600; display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
  .feature-meta { font-size: 0.72rem; font-weight: 400; color: var(--admin-text-mute, #8c96a3); }
  .counts { margin: 0; font-size: 0.7rem; color: var(--admin-text-mute, #8c96a3); }

  .row-header {
    display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    border-left: 3px solid transparent;
    font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--admin-text-mute, #8c96a3);
    position: sticky; top: 0;
    background: var(--admin-bg, #0b111c);
    border-radius: 9px 9px 0 0;
    z-index: 1;
  }

  .rows { display: flex; flex-direction: column; }
  .empty {
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--admin-text-mute, #8c96a3);
    font-size: 0.85rem;
  }
  .more {
    align-self: flex-start;
    background: transparent;
    border: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    color: var(--admin-text-mute, #8c96a3);
    border-radius: 8px;
    padding: 0.38rem 0.9rem;
    cursor: pointer; font-size: 0.8rem;
    transition: color 0.1s, border-color 0.1s;
  }
  .more:hover { color: var(--admin-text, #eef1f3); border-color: var(--admin-border-bright, rgba(255,255,255,0.12)); }

  @media (max-width: 767px) {
    .row-header .col-prio, .row-header .col-date, .row-header .col-openspec { display: none; }
    .row-header { grid-template-columns: auto auto 1fr auto; }
  }
</style>
