<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PlanningOfficeDetail from './PlanningOfficeDetail.svelte';
  import PlanningOfficeQueue from './PlanningOfficeQueue.svelte';
  import PlanningOfficeTriage from './PlanningOfficeTriage.svelte';
  import PlanningOfficeItem from './PlanningOfficeItem.svelte';

  const { brand: _brand }: { brand: string } = $props();

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
    requirementsList: string[];
    lastenheftLocked: boolean;
    triage: {
      type: string; priority: string; severity: string;
      areas: string[]; component: string | null;
      assignee_suggested: string; rationale: string;
      model: string; at: string;
    } | null;
  }

  interface Stats {
    planning: number;
    ready: number;
    blocked: number;
  }

  let items: PlanItem[] = $state([]);
  let stats: Stats = $state({ planning: 0, ready: 0, blocked: 0 });
  let selected: PlanItem | null = $state(null);
  let loading = $state(true);
  let override = $state(false);
  let viewOverride = $state<'desktop' | 'mobile' | null>(null);
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  let sheetOpen = $state(false);
  let sheetItem: PlanItem | null = $state(null);
  let dragSrcExtId: string | null = $state(null);
  let dropTargetIdx: number | null = $state(null);
  let newDep = $state('');
  let touchDragExtId: string | null = $state(null);
  let sheetSwipeStartY = $state(0);

  let isMobile = $derived(
    (viewOverride ?? (windowWidth < 768 ? 'mobile' : 'desktop')) === 'mobile'
  );

  async function load() {
    loading = true;
    try {
      const r = await fetch('/api/admin/planungsbuero');
      if (r.ok) {
        const data = await r.json();
        items = data.items;
        stats = data.stats;
        if (selected) {
          selected = items.find((i: PlanItem) => i.extId === selected!.extId) ?? null;
        }
      }
    } catch {
      items = [];
    }
    loading = false;
  }

  async function patch(extId: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/planungsbuero/${extId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function toggleDor(it: PlanItem, key: string) {
    await patch(it.extId, { readiness: { ...it.readiness, [key]: !(it.readiness?.[key]) } });
  }

  // Save the requirements list (Pflichtenheft) without locking.
  async function saveRequirements(it: PlanItem, requirements: string[]) {
    await patch(it.extId, { requirements });
  }

  // Toggle the Lastenheft lock. Locking needs >=1 requirement (server-enforced) and
  // forwards the ticket into the autopilot lane → it leaves the Planungsbüro.
  async function toggleLock(it: PlanItem) {
    const r = await fetch(`/api/admin/planungsbuero/${it.extId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastenheftLocked: !it.lastenheftLocked }),
    });
    if (r.status === 422) {
      alert('Lastenheft kann nicht verriegelt werden — mindestens eine Anforderung nötig.');
      return;
    }
    if (!it.lastenheftLocked && r.ok) {
      // Just locked → status forwarded to backlog; clear selection (item left the office).
      selected = null;
      sheetOpen = false;
    }
    await load();
  }

  async function promote(it: PlanItem) {
    const r = await fetch(`/api/planning-office/${it.extId}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ override }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({ error: 'unknown' }));
      alert('Promote abgelehnt: ' + data.error);
    }
    await load();
  }

  function selectItem(it: PlanItem) {
    if (isMobile) {
      sheetItem = it;
      sheetOpen = true;
    } else {
      selected = it;
    }
  }

  function onDragStart(e: DragEvent, it: PlanItem) {
    dragSrcExtId = it.extId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', it.extId);
    }
  }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dropTargetIdx = idx;
  }

  function onDragLeave() {
    dropTargetIdx = null;
  }

  async function onDrop(e: DragEvent, targetIdx: number) {
    e.preventDefault();
    dropTargetIdx = null;
    if (!dragSrcExtId) return;
    const srcItem = items.find((i) => i.extId === dragSrcExtId);
    if (!srcItem) return;
    await patch(dragSrcExtId, { rank: targetIdx });
    dragSrcExtId = null;
  }

  function onDragEnd() {
    dragSrcExtId = null;
    dropTargetIdx = null;
  }

  function onHandlePointerDown(e: PointerEvent, it: PlanItem) {
    if (!isMobile) return;
    touchDragExtId = it.extId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!touchDragExtId) return;
    const rows = document.querySelectorAll('[data-testid^="pb-queue-row-"]');
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        dropTargetIdx = i;
        break;
      }
    }
  }

  async function onHandlePointerUp(_e: PointerEvent) {
    if (!touchDragExtId) return;
    if (dropTargetIdx !== null) {
      await patch(touchDragExtId, { rank: dropTargetIdx });
    }
    touchDragExtId = null;
    dropTargetIdx = null;
  }

  function toggleView() {
    const next = isMobile ? 'desktop' : 'mobile';
    viewOverride = next;
    try { localStorage.setItem('planungsbuero_view', next); } catch {}
  }

  function onResize() {
    windowWidth = window.innerWidth;
  }

  function onSheetPointerDown(e: PointerEvent) {
    sheetSwipeStartY = e.clientY;
  }

  function onSheetPointerUp(e: PointerEvent) {
    const delta = e.clientY - sheetSwipeStartY;
    if (delta > 80) sheetOpen = false;
  }

  async function removeDep(dep: string) {
    if (!selected) return;
    await patch(selected.extId, { dependsOn: selected.dependsOn.filter((d) => d !== dep) });
  }

  async function addDep() {
    if (!newDep.trim() || !selected) return;
    await patch(selected.extId, { dependsOn: [...selected.dependsOn, newDep.trim()] });
    newDep = '';
  }

  onMount(() => {
    try {
      const v = localStorage.getItem('planungsbuero_view');
      if (v === 'desktop' || v === 'mobile') viewOverride = v;
    } catch {}
    window.addEventListener('resize', onResize);
    window.addEventListener('factory-floor-refreshed', onFloorRefresh);
    load();
  });

  function onFloorRefresh() {
    void load();
  }

  onDestroy(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('factory-floor-refreshed', onFloorRefresh);
  });
</script>

<div class="pb-root" data-testid="pb-root">
  <div class="pb-stats-bar" data-testid="pb-stats-bar">
    <span>{stats.planning} planning · {stats.ready} ready · {stats.blocked} blocked</span>
  </div>

  <button class="pb-view-toggle" data-testid="pb-view-toggle" onclick={toggleView}>
    {isMobile ? '⊞' : '≡'}
  </button>

  {#if loading}
    <div class="pb-loading">Lädt…</div>
  {:else if !items.length}
    <div class="pb-empty">Büro leer.</div>
  {:else}
    <div class="pb-layout" class:pb-mobile={isMobile}>
      <PlanningOfficeQueue
        {items}
        {isMobile}
        selectedExtId={selected?.extId ?? null}
        {dragSrcExtId}
        {dropTargetIdx}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onSelect={selectItem}
        onHandlePointerDown={onHandlePointerDown}
        onHandlePointerMove={onHandlePointerMove}
        onHandlePointerUp={onHandlePointerUp}
      />

      {#if !isMobile && selected}
        <div class="pb-detail" data-testid="pb-detail">
          <PlanningOfficeTriage
            extId={selected.extId}
            triage={selected.triage}
            onTriageDone={load}
          />
          <PlanningOfficeDetail
            item={selected}
            bind:override
            bind:newDep
            patchFn={patch}
            toggleDorFn={toggleDor}
            promoteFn={promote}
            removeDepFn={removeDep}
            addDepFn={addDep}
            saveRequirementsFn={saveRequirements}
            lockFn={toggleLock}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if isMobile && sheetItem}
    <PlanningOfficeItem
      {sheetItem}
      bind:sheetOpen
      bind:override
      bind:newDep
      onTriageDone={load}
      patchFn={patch}
      toggleDorFn={toggleDor}
      promoteFn={promote}
      removeDepFn={removeDep}
      addDepFn={addDep}
      onSheetPointerDown={onSheetPointerDown}
      onSheetPointerUp={onSheetPointerUp}
    />
  {/if}
</div>

<style>
  :root {
    --pb-bg: #0f1117;
    --pb-surface: #161b22;
    --pb-surface-hover: #1c2129;
    --pb-border: #21262d;
    --pb-text: #e6edf3;
    --pb-text-muted: #64748b;
    --pb-amber: #d4af37;
    --pb-amber-dim: #b8962e;
    --pb-mono: 'JetBrains Mono', 'Fira Code', monospace;
    --pb-selected-bg: #1e2736;
  }

  .pb-root {
    position: relative;
    background: var(--pb-bg);
    color: var(--pb-text);
    font-family: var(--pb-mono);
    min-height: 400px;
  }

  .pb-stats-bar {
    font-family: var(--pb-mono);
    color: var(--pb-text-muted);
    padding: 8px 16px;
    border-bottom: 1px solid var(--pb-border);
    font-size: 0.8rem;
  }

  .pb-view-toggle {
    position: absolute;
    top: 12px;
    right: 16px;
    background: none;
    border: 1px solid var(--pb-border);
    color: var(--pb-text-muted);
    font-size: 0.75rem;
    padding: 4px 8px;
    cursor: pointer;
    z-index: 10;
  }

  .pb-view-toggle:hover {
    color: var(--pb-text);
    border-color: var(--pb-text-muted);
  }

  .pb-loading,
  .pb-empty {
    padding: 2rem;
    color: var(--pb-text-muted);
    text-align: center;
  }

  .pb-layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    min-height: 300px;
  }

  .pb-layout.pb-mobile {
    grid-template-columns: 1fr;
  }

  .pb-detail {
    padding: 16px;
    overflow-y: auto;
    background: var(--pb-surface);
  }

  @media (max-width: 767px) {
    .pb-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
