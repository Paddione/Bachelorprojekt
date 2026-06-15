<script lang="ts">
  import type { FeatureNode, TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, toggleTicketSelection, applyOptimistic, clearSelection } from '../../lib/stores/cockpitStore';
  import TicketRow from './TicketRow.svelte';
  import BulkBar from './BulkBar.svelte';

  export let feature: FeatureNode;
  export let tickets: TicketRowT[];
  export let features: FeatureNode[] = [];
  // Callback props (Svelte 5 compatible)
  export let onBack: (() => void) | undefined = undefined;
  export let onMutated: ((detail: { featureExtId: string }) => void) | undefined = undefined;
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;

  let busy: Record<string, boolean> = {};
  let dragId: string | null = null;

  $: selectedIds = [...$cockpitStore.selectedTickets];

  async function patchStatus(id: string, status: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    try {
      const res = await fetch(`/api/admin/tickets/${id}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus: status }),
      });
      if (!res.ok) throw new Error(`transition ${res.status}`);
      onMutated?.({ featureExtId: feature.extId });
    } catch {
      t.status = old; tickets = [...tickets]; rollback();
    } finally { busy[id] = false; busy = { ...busy }; }
  }

  async function patchPriority(id: string, priority: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.priority; t.priority = priority; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'priority', priority, old);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error(`patch ${res.status}`);
      onMutated?.({ featureExtId: feature.extId });
    } catch {
      t.priority = old; tickets = [...tickets]; rollback();
    } finally { busy[id] = false; busy = { ...busy }; }
  }

  async function persistOrder() {
    const updates = tickets.map((t, i) => ({ ticketId: t.id, planningRank: i }));
    const snapshot = [...tickets];
    try {
      const res = await fetch('/api/admin/cockpit/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error(`reorder ${res.status}`);
      onMutated?.({ featureExtId: feature.extId });
    } catch { tickets = snapshot; }
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
    try {
      const res = await fetch('/api/admin/cockpit/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketIds: ids, mutation }),
      });
      if (res.ok) { clearSelection(); onMutated?.({ featureExtId: feature.extId }); }
    } catch { /* batch errors are non-critical; selection stays for retry */ }
  }
</script>

<section class="workbench" data-testid="feature-workbench">
  <header class="head">
    <button class="back" on:click={() => onBack?.()}>← Zurück</button>
    <h3>{feature.title}</h3>
    <span class={`health-dot health-${feature.health}`}></span>
    {#if feature.rollup.blocked > 0}<span class="warn">⚠ {feature.rollup.blocked} blockiert</span>{/if}
  </header>
  <div class="list">
    {#each tickets as t (t.id)}
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
    {#if tickets.length === 0}<p class="empty">Keine Tickets</p>{/if}
  </div>
  <BulkBar selectedIds={selectedIds} {features}
    onBulkStatus={(d) => runBatch({ status: d.status }, d.ids)}
    onBulkPriority={(d) => runBatch({ priority: d.priority }, d.ids)}
    onBulkReparent={(d) => runBatch({ parentId: d.parentId }, d.ids)}
    onBulkEnqueue={(d) => runBatch({ enqueue: true }, d.ids)}
    onClear={clearSelection} />
</section>

<style>
  .head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .back { background: none; border: none; color: inherit; cursor: pointer; }
  .health-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .health-green { background: #10b981; } .health-amber { background: #f59e0b; } .health-red { background: #ef4444; }
  .warn { color: #ef4444; font-size: 0.8rem; }
  .empty { opacity: 0.6; }
</style>
