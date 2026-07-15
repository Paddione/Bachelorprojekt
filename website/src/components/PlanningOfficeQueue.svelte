<script lang="ts">
  const DOR_KEYS = ['spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt'] as const;

  interface PlanItem {
    extId: string;
    title: string;
    valueProp: string | null;
    priority: string;
    effort: string | null;
    areas: string[];
    dependsOn: string[];
    rank: number | null;
    readiness: Record<string, boolean>;
    dorScore: number;
    isNextCandidate: boolean;
    pinned: boolean;
  }

  function priorityColor(p: string): string {
    switch (p) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      default: return '#6b7280';
    }
  }

  let {
    items,
    isMobile,
    selectedExtId,
    dragSrcExtId,
    dropTargetIdx,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    onSelect,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
  }: {
    items: PlanItem[];
    isMobile: boolean;
    selectedExtId: string | null;
    dragSrcExtId: string | null;
    dropTargetIdx: number | null;
    onDragStart: (e: DragEvent, it: PlanItem) => void;
    onDragOver: (e: DragEvent, idx: number) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent, idx: number) => void;
    onDragEnd: () => void;
    onSelect: (it: PlanItem) => void;
    onHandlePointerDown: (e: PointerEvent, it: PlanItem) => void;
    onHandlePointerMove: (e: PointerEvent) => void;
    onHandlePointerUp: (e: PointerEvent) => void;
  } = $props();
</script>

<div class="pb-queue" data-testid="pb-queue">
  {#each items as it, idx (it.extId)}
    <div
      class="pb-row"
      class:selected={selectedExtId === it.extId}
      class:drag-source={dragSrcExtId === it.extId}
      class:drop-target={dropTargetIdx === idx}
      data-testid="pb-queue-row-{it.extId}"
      data-planning-item=""
      draggable={!isMobile}
      ondragstart={(e) => onDragStart(e, it)}
      ondragover={(e) => onDragOver(e, idx)}
      ondragleave={onDragLeave}
      ondrop={(e) => onDrop(e, idx)}
      ondragend={onDragEnd}
      onclick={() => onSelect(it)}
    >
      <span
        class="pb-handle"
        onpointerdown={(e) => onHandlePointerDown(e, it)}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
      >☰</span>
      <span class="pb-rank">{String(idx + 1).padStart(2, '0')}</span>
      <span class="pb-priority-dot" style="background:{priorityColor(it.priority)}"></span>
      <span class="pb-extid">{it.extId}</span>
      <span class="pb-title">{it.title}</span>
      <span class="pb-dor-squares">
        {#each DOR_KEYS as k}
          <span class="pb-dor-sq" class:pb-dor-on={it.readiness?.[k] === true}></span>
        {/each}
      </span>
    </div>
  {/each}
</div>

<style>
  .pb-queue {
    border-right: 1px solid var(--admin-border);
    overflow-y: auto;
  }

  .pb-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 6px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--admin-border);
    border-left: 3px solid transparent;
    transition: background 0.12s;
  }

  .pb-row:hover {
    background: var(--admin-surface-hover);
  }

  .pb-row.selected {
    border-left: 3px solid var(--admin-amber);
    background: var(--admin-selected-bg);
  }

  .pb-row.drag-source {
    opacity: 0.4;
  }

  .pb-row.drop-target {
    border-top: 2px solid var(--admin-amber);
  }

  .pb-handle {
    cursor: grab;
    color: var(--admin-text-muted);
    font-size: 1rem;
    width: 24px;
    text-align: center;
    user-select: none;
    touch-action: none;
  }

  .pb-rank {
    font-family: var(--admin-mono);
    font-size: 0.75rem;
    color: var(--admin-text-muted);
    width: 20px;
  }

  .pb-priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pb-extid {
    font-family: var(--admin-mono);
    font-size: 0.7rem;
    color: var(--admin-amber);
    white-space: nowrap;
    min-width: 60px;
  }

  .pb-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
  }

  .pb-dor-squares {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .pb-dor-sq {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: var(--admin-border);
  }

  .pb-dor-sq.pb-dor-on {
    background: var(--admin-amber);
  }
</style>
