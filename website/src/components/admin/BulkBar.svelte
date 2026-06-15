<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  export let selectedIds: string[] = [];
  export let features: FeatureNode[] = [];
  // Svelte 5 callback props for testing
  export let onBulkStatus: ((detail: { ids: string[]; status: string }) => void) | undefined = undefined;
  export let onBulkPriority: ((detail: { ids: string[]; priority: string }) => void) | undefined = undefined;
  export let onBulkReparent: ((detail: { ids: string[]; parentId: string }) => void) | undefined = undefined;
  export let onBulkEnqueue: ((detail: { ids: string[] }) => void) | undefined = undefined;
  export let onClear: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();
  const STATUSES = ['triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'done'];
  const PRIORITIES = ['niedrig', 'mittel', 'hoch'];

  function onStatus(e: Event) {
    const detail = { ids: selectedIds, status: (e.target as HTMLSelectElement).value };
    onBulkStatus?.(detail);
    dispatch('bulkStatus', detail);
  }
  function onPriority(e: Event) {
    const detail = { ids: selectedIds, priority: (e.target as HTMLSelectElement).value };
    onBulkPriority?.(detail);
    dispatch('bulkPriority', detail);
  }
  function onParent(e: Event) {
    const detail = { ids: selectedIds, parentId: (e.target as HTMLSelectElement).value };
    onBulkReparent?.(detail);
    dispatch('bulkReparent', detail);
  }
  function handleEnqueue() {
    const detail = { ids: selectedIds };
    onBulkEnqueue?.(detail);
    dispatch('bulkEnqueue', detail);
  }
  function handleClear() {
    onClear?.();
    dispatch('clear');
  }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClear(); }
</script>

{#if selectedIds.length > 0}
  <div class="bulk-bar" data-testid="bulk-bar" role="toolbar" tabindex="0" on:keydown={onKey}>
    <span>{selectedIds.length} Tickets ausgewählt</span>
    <select data-testid="bulk-status" on:change={onStatus}>
      <option value="" selected>Status …</option>
      {#each STATUSES as s}<option value={s}>{s}</option>{/each}
    </select>
    <select data-testid="bulk-priority" on:change={onPriority}>
      <option value="" selected>Priorität …</option>
      {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
    </select>
    <select data-testid="bulk-parent" on:change={onParent}>
      <option value="" selected>Verschieben nach …</option>
      {#each features as f}<option value={f.id}>{f.title}</option>{/each}
    </select>
    <button on:click={handleEnqueue}>Zur Fabrik</button>
    <button class="clear" on:click={handleClear}>Auswahl aufheben</button>
  </div>
{/if}

<style>
  .bulk-bar { position: sticky; bottom: 0; display: flex; gap: 0.5rem; align-items: center;
    padding: 0.5rem 0.75rem; background: #1c1f26; border-top: 1px solid #2a2e37; }
  .clear { margin-left: auto; }
</style>
