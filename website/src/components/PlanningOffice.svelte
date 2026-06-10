<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const { brand }: { brand: string } = $props();

  const DOR_KEYS = ['spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt'] as const;
  const DOR_LABEL: Record<string, string> = {
    spec_skizziert: 'Spec skizziert',
    offene_fragen_geklaert: 'Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar',
    aufwand_geschaetzt: 'Aufwand geschätzt',
  };

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
  let touchStartY = $state(0);
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
    touchStartY = e.clientY;
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

  async function onHandlePointerUp(e: PointerEvent) {
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

  function priorityColor(p: string): string {
    switch (p) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      default: return '#6b7280';
    }
  }

  onMount(() => {
    try {
      const v = localStorage.getItem('planungsbuero_view');
      if (v === 'desktop' || v === 'mobile') viewOverride = v;
    } catch {}
    window.addEventListener('resize', onResize);
    load();
  });

  onDestroy(() => {
    window.removeEventListener('resize', onResize);
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
      <div class="pb-queue" data-testid="pb-queue">
        {#each items as it, idx (it.extId)}
          <div
            class="pb-row"
            class:selected={!isMobile && selected?.extId === it.extId}
            class:drag-source={dragSrcExtId === it.extId}
            class:drop-target={dropTargetIdx === idx}
            data-testid="pb-queue-row-{it.extId}"
            draggable={!isMobile}
            ondragstart={(e) => onDragStart(e, it)}
            ondragover={(e) => onDragOver(e, idx)}
            ondragleave={onDragLeave}
            ondrop={(e) => onDrop(e, idx)}
            ondragend={onDragEnd}
            onclick={() => selectItem(it)}
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

      {#if !isMobile && selected}
        <div class="pb-detail" data-testid="pb-detail">
          <h2 class="pb-detail-title">{selected.title}</h2>
          <label class="pb-field-label">Kern-Nutzen
            <textarea
              class="pb-textarea"
              value={selected.valueProp ?? ''}
              onblur={(e) => patch(selected!.extId, { valueProp: (e.target as HTMLTextAreaElement).value })}
            ></textarea>
          </label>
          <fieldset class="pb-fieldset">
            <legend>Definition of Ready</legend>
            {#each DOR_KEYS as k}
              <label class="pb-check">
                <input type="checkbox" checked={selected.readiness?.[k] === true} onchange={() => toggleDor(selected!, k)} />
                {DOR_LABEL[k]}
              </label>
            {/each}
          </fieldset>
          <div class="pb-deps">
            <span class="pb-field-label">Abhängigkeiten</span>
            <div class="pb-chips">
              {#each selected.dependsOn as dep}
                <span class="pb-chip">{dep}<button class="pb-chip-x" onclick={() => removeDep(dep)}>×</button></span>
              {/each}
            </div>
            <input
              class="pb-dep-input"
              placeholder="Neue Abhängigkeit…"
              bind:value={newDep}
              onkeydown={(e) => { if (e.key === 'Enter') addDep(); }}
            />
          </div>
          <div class="pb-effort-btns">
            {#each ['klein', 'mittel', 'gross'] as eff}
              <button
                class="pb-effort-btn"
                class:active={selected.effort === eff}
                onclick={() => patch(selected!.extId, { effort: eff })}
              >{eff}</button>
            {/each}
          </div>
          <label class="pb-check pb-override-check">
            <input type="checkbox" data-testid="pb-override" bind:checked={override} />
            Override (trotz &lt; 4/4)
          </label>
          <button
            class="pb-promote-btn"
            data-testid="pb-detail-promote"
            disabled={!override && selected.dorScore < 4}
            onclick={() => promote(selected!)}
          >Als nächstes planen</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if isMobile && sheetItem}
    <div class="pb-sheet" class:open={sheetOpen} data-testid="pb-sheet">
      <div
        class="pb-sheet-handle"
        onpointerdown={onSheetPointerDown}
        onpointerup={onSheetPointerUp}
      >
        <button class="pb-sheet-close" data-testid="pb-sheet-close" onclick={() => sheetOpen = false}>×</button>
      </div>
      <div class="pb-sheet-body">
        <h2 class="pb-detail-title">{sheetItem.title}</h2>
        <label class="pb-field-label">Kern-Nutzen
          <textarea
            class="pb-textarea"
            value={sheetItem.valueProp ?? ''}
            onblur={(e) => {
              patch(sheetItem!.extId, { valueProp: (e.target as HTMLTextAreaElement).value });
            }}
          ></textarea>
        </label>
        <fieldset class="pb-fieldset">
          <legend>Definition of Ready</legend>
          {#each DOR_KEYS as k}
            <label class="pb-check">
              <input type="checkbox" checked={sheetItem.readiness?.[k] === true} onchange={() => toggleDor(sheetItem!, k)} />
              {DOR_LABEL[k]}
            </label>
          {/each}
        </fieldset>
        <div class="pb-deps">
          <span class="pb-field-label">Abhängigkeiten</span>
          <div class="pb-chips">
            {#each sheetItem.dependsOn as dep}
              <span class="pb-chip">{dep}<button class="pb-chip-x" onclick={() => removeDep(dep)}>×</button></span>
            {/each}
          </div>
          <input
            class="pb-dep-input"
            placeholder="Neue Abhängigkeit…"
            bind:value={newDep}
            onkeydown={(e) => { if (e.key === 'Enter') addDep(); }}
          />
        </div>
        <div class="pb-effort-btns">
          {#each ['klein', 'mittel', 'gross'] as eff}
            <button
              class="pb-effort-btn"
              class:active={sheetItem.effort === eff}
              onclick={() => patch(sheetItem!.extId, { effort: eff })}
            >{eff}</button>
          {/each}
        </div>
        <label class="pb-check pb-override-check">
          <input type="checkbox" bind:checked={override} />
          Override (trotz &lt; 4/4)
        </label>
        <button
          class="pb-promote-btn"
          disabled={!override && sheetItem.dorScore < 4}
          onclick={() => promote(sheetItem!)}
        >Als nächstes planen</button>
      </div>
    </div>
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

  .pb-queue {
    border-right: 1px solid var(--pb-border);
    overflow-y: auto;
  }

  .pb-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 6px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--pb-border);
    border-left: 3px solid transparent;
    transition: background 0.12s;
  }

  .pb-row:hover {
    background: var(--pb-surface-hover);
  }

  .pb-row.selected {
    border-left: 3px solid var(--pb-amber);
    background: var(--pb-selected-bg);
  }

  .pb-row.drag-source {
    opacity: 0.4;
  }

  .pb-row.drop-target {
    border-top: 2px solid var(--pb-amber);
  }

  .pb-handle {
    cursor: grab;
    color: var(--pb-text-muted);
    font-size: 1rem;
    width: 24px;
    text-align: center;
    user-select: none;
    touch-action: none;
  }

  .pb-rank {
    font-family: var(--pb-mono);
    font-size: 0.75rem;
    color: var(--pb-text-muted);
    width: 20px;
  }

  .pb-priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pb-extid {
    font-family: var(--pb-mono);
    font-size: 0.7rem;
    color: var(--pb-amber);
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
    background: var(--pb-border);
  }

  .pb-dor-sq.pb-dor-on {
    background: var(--pb-amber);
  }

  .pb-detail {
    padding: 16px;
    overflow-y: auto;
    background: var(--pb-surface);
  }

  .pb-detail-title {
    font-size: 1.1rem;
    margin: 0 0 12px;
    color: var(--pb-text);
  }

  .pb-field-label {
    display: block;
    font-size: 0.75rem;
    color: var(--pb-text-muted);
    margin-bottom: 4px;
  }

  .pb-textarea {
    width: 100%;
    min-height: 60px;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: var(--pb-mono);
    font-size: 0.8rem;
    resize: vertical;
    box-sizing: border-box;
  }

  .pb-fieldset {
    border: 1px solid var(--pb-border);
    border-radius: 4px;
    padding: 8px 12px;
    margin: 12px 0;
  }

  .pb-fieldset legend {
    font-size: 0.75rem;
    color: var(--pb-text-muted);
  }

  .pb-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin: 4px 0;
    cursor: pointer;
  }

  .pb-check input[type="checkbox"] {
    accent-color: var(--pb-amber);
  }

  .pb-deps {
    margin: 12px 0;
  }

  .pb-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }

  .pb-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.7rem;
    color: var(--pb-amber);
  }

  .pb-chip-x {
    background: none;
    border: none;
    color: var(--pb-text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0;
    line-height: 1;
  }

  .pb-chip-x:hover {
    color: #ef4444;
  }

  .pb-dep-input {
    width: 100%;
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text);
    border-radius: 4px;
    padding: 4px 8px;
    font-family: var(--pb-mono);
    font-size: 0.75rem;
    margin-top: 4px;
    box-sizing: border-box;
  }

  .pb-effort-btns {
    display: flex;
    gap: 6px;
    margin: 12px 0;
  }

  .pb-effort-btn {
    background: var(--pb-bg);
    border: 1px solid var(--pb-border);
    color: var(--pb-text-muted);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--pb-mono);
    font-size: 0.75rem;
  }

  .pb-effort-btn.active {
    border-color: var(--pb-amber);
    color: var(--pb-amber);
    background: var(--pb-selected-bg);
  }

  .pb-override-check {
    margin: 12px 0 8px;
  }

  .pb-promote-btn {
    width: 100%;
    padding: 8px;
    background: var(--pb-amber);
    color: var(--pb-bg);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--pb-mono);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .pb-promote-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

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

  @media (max-width: 767px) {
    .pb-layout {
      grid-template-columns: 1fr;
    }

    .pb-queue {
      border-right: none;
    }
  }
</style>
