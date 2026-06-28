<script lang="ts">
  import PlanningOfficeTriage from './PlanningOfficeTriage.svelte';
  import PlanningOfficeDetail from './PlanningOfficeDetail.svelte';

  let {
    sheetItem,
    sheetOpen = $bindable(),
    override = $bindable(),
    newDep = $bindable(),
    onTriageDone,
    patchFn,
    toggleDorFn,
    promoteFn,
    removeDepFn,
    addDepFn,
    onSheetPointerDown,
    onSheetPointerUp,
  } = $props();
</script>

<div class="pb-sheet" class:open={sheetOpen} data-testid="pb-sheet">
  <div
    class="pb-sheet-handle"
    onpointerdown={onSheetPointerDown}
    onpointerup={onSheetPointerUp}
  >
    <button class="pb-sheet-close" data-testid="pb-sheet-close" onclick={() => sheetOpen = false}>×</button>
  </div>
  <div class="pb-sheet-body">
    <PlanningOfficeTriage
      extId={sheetItem.extId}
      triage={sheetItem.triage}
      onTriageDone={onTriageDone}
    />
    <PlanningOfficeDetail
      item={sheetItem}
      bind:override
      bind:newDep
      patchFn={patchFn}
      toggleDorFn={toggleDorFn}
      promoteFn={promoteFn}
      removeDepFn={removeDepFn}
      addDepFn={addDepFn}
    />
  </div>
</div>

<style>
  .pb-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60vh;
    background: var(--pb-surface);
    border-radius: 12px 12px 0 0;
    transform: translateY(100%);
    transition: transform 0.25s ease;
    z-index: 100;
    overflow-y: auto;
  }

  .pb-sheet.open {
    transform: translateY(0);
  }

  .pb-sheet-handle {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    touch-action: none;
  }

  .pb-sheet-close {
    background: none;
    border: none;
    color: var(--pb-text-muted);
    font-size: 1.2rem;
    cursor: pointer;
  }

  .pb-sheet-body {
    padding: 0 16px 16px;
  }
</style>
