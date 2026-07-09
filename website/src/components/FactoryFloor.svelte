<script module lang="ts">
  import { PHASE_ORDER } from '../lib/factory-floor-types';
  import type { Phase } from '../lib/factory-floor-types';
  import { MOBILE_COL_INDEX } from './factory/MobileTabBar.svelte';
  export { MOBILE_COL_INDEX }; // eslint-disable-line no-import-assign
  export const STATIONS: { key: Phase; label: string }[] =
    PHASE_ORDER.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { FloorPayload, TicketDetail, InjectionKind } from '../lib/factory-floor-types';
  import KiProviderDrawer from './admin/KiProviderDrawer.svelte';
  import { interfaceById, type InterfaceDef } from '../lib/ki-catalog';

  import QaChip from './QaChip.svelte';
  import QaModal from './QaModal.svelte';
  import DetailPanel from './factory/DetailPanel.svelte';
  import MobileTabBar from './factory/MobileTabBar.svelte';
  import StagedColumn from './factory/StagedColumn.svelte';
  import ShippedColumn from './factory/ShippedColumn.svelte';
  import AwaitingDeployLane from './factory/AwaitingDeployLane.svelte';
  import AttentionStrip from './factory/AttentionStrip.svelte';
  import FactoryFloorLane from './FactoryFloorLane.svelte';
  import FloorControlCard from './factory/FloorControlCard.svelte';
  import type { QaItem } from '../lib/qa-dal';
  import type { CiRollup } from '../lib/factory-ci';
  import { SSE_RECONNECT_MS } from '../lib/factory-constants';
  import { relTime, prUrl, ticketUrl, planUrl, prioDot } from '../lib/factory-floor-client';

  let { initial }: { initial: FloorPayload | null } = $props();

  const MOBILE_COL_COUNT = 11;
  let mobileColIndex = $state(0);
  let touchStartX = $state(0);
  let isMobile = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    isMobile = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  function mobileNext() { if (mobileColIndex < MOBILE_COL_COUNT - 1) mobileColIndex++; }
  function mobilePrev() { if (mobileColIndex > 0) mobileColIndex--; }
  function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX; }
  function onTouchEnd(e: TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (delta < -40) { mobileNext(); if ('vibrate' in navigator) navigator.vibrate(5); }
    else if (delta > 40) { mobilePrev(); if ('vibrate' in navigator) navigator.vibrate(5); }
  }

  let data = $state<FloorPayload | null>(initial);
  let stale = $state(false);
  let selected = $state<string | null>(null);

  interface ProviderEntry {
    id: number; source: string; tier: 'sonnet' | 'haiku'; priority: number;
    provider: string; model_id: string; base_url: string | null;
    max_concurrent: number; enabled: boolean;
    api_key_hint: string | null;
  }
  interface Health {
    provider: string; cooldown_until: string | null; active_agents: number;
  }

  let providerEntries = $state<ProviderEntry[]>([]);
  let providerHealth = $state<Health[]>([]);
  let catalog = $state<InterfaceDef[]>([]);
  let openDrawerPhase = $state<string | null>(null);
  let editId = $state<number | null>(null);
  let confirmingDelete = $state<number | null>(null);
  let form = $state(blankForm());
  let toast = $state('');

  function blankForm(source = '', tier: 'sonnet' | 'haiku' = 'sonnet') {
    return { source, tier, priority: 1, provider: '', model_id: '', base_url: '', max_concurrent: 3, enabled: true, api_key: '' };
  }

  function onProviderChange() {
    const def = interfaceById(form.provider);
    if (def?.defaultBaseUrl && !form.base_url.trim()) {
      form.base_url = def.defaultBaseUrl;
    }
  }

  async function loadProvidersAndCatalog() {
    try {
      const [provRes, catRes] = await Promise.all([
        fetch('/api/admin/ki/providers', { credentials: 'same-origin' }),
        fetch('/api/admin/ki/catalog', { credentials: 'same-origin' }),
      ]);
      if (provRes.ok) {
        const { entries: e, health: h } = await provRes.json();
        providerEntries = e ?? [];
        providerHealth = h ?? [];
      }
      if (catRes.ok) {
        const { catalog: c } = await catRes.json();
        catalog = c ?? [];
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }

  function sourceForPhase(phase: string): string {
    const mapping: Record<string, string> = {
      scout: 'factory-scout',
      design: 'factory-plan',
      plan: 'factory-plan',
      implement: 'factory-implement',
      verify: 'factory-review',
      deploy: 'factory-implement',
    };
    return mapping[phase] || '*';
  }

  function activeConfigForPhase(phase: string, allEntries: ProviderEntry[]): ProviderEntry | undefined {
    const src = sourceForPhase(phase);
    const specific = allEntries.filter(e => e.source === src && e.enabled).sort((a, b) => a.priority - b.priority);
    if (specific.length) return specific[0];
    const global = allEntries.filter(e => e.source === '*' && e.enabled).sort((a, b) => a.priority - b.priority);
    if (global.length) return global[0];
    return undefined;
  }

  let activeConfigsByPhase = $derived<Record<string, ProviderEntry | undefined>>({
    scout: activeConfigForPhase('scout', providerEntries),
    design: activeConfigForPhase('design', providerEntries),
    plan: activeConfigForPhase('plan', providerEntries),
    implement: activeConfigForPhase('implement', providerEntries),
    verify: activeConfigForPhase('verify', providerEntries),
    deploy: activeConfigForPhase('deploy', providerEntries),
  });

  const PHASE_LABELS: Record<string, string> = {
    scout: 'Sichten (factory-scout)',
    design: 'Entwurf (factory-plan)',
    plan: 'Planung (factory-plan)',
    implement: 'Umsetzung (factory-implement)',
    verify: 'Prüfung (factory-review)',
    deploy: 'Auslieferung (factory-implement)',
  };

  function entriesForPhase(phase: string): ProviderEntry[] {
    const src = sourceForPhase(phase);
    return providerEntries.filter((e) => e.source === src).sort((a, b) => a.priority - b.priority);
  }

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => { if (toast === msg) toast = ''; }, 5000);
  }

  function closeDrawer() { openDrawerPhase = null; editId = null; confirmingDelete = null; }

  function startEdit(e: ProviderEntry) {
    editId = e.id;
    form = { source: e.source, tier: e.tier, priority: e.priority, provider: e.provider, model_id: e.model_id, base_url: e.base_url ?? '', max_concurrent: e.max_concurrent, enabled: e.enabled, api_key: '' };
  }

  function startNew() {
    editId = -1;
    if (openDrawerPhase) {
      form = blankForm(sourceForPhase(openDrawerPhase), 'sonnet');
    }
  }

  async function saveForm() {
    const payload: Record<string, unknown> = { ...form, base_url: form.base_url.trim() || null };
    if (editId !== -1 && !form.api_key.trim()) { delete payload.api_key; }
    else { payload.api_key = form.api_key.trim() || null; }
    const isNew = editId === -1;
    const res = await fetch(isNew ? '/api/admin/ki/providers' : `/api/admin/ki/providers/${editId}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? `Fehler ${res.status}`);
      return;
    }
    editId = null;
    await loadProvidersAndCatalog();
  }

  async function changePriority(e: ProviderEntry, delta: number) {
    const next = e.priority + delta;
    if (next < 0) return;
    const res = await fetch(`/api/admin/ki/providers/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Priorität konnte nicht geändert werden');
      return;
    }
    await loadProvidersAndCatalog();
  }

  async function doDelete(id: number) {
    const res = await fetch(`/api/admin/ki/providers/${id}`, { method: 'DELETE' });
    confirmingDelete = null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? 'Löschen fehlgeschlagen');
      return;
    }
    await loadProvidersAndCatalog();
  }
  let detail = $state<TicketDetail | null>(null);
  let qaItems = $state<QaItem[]>([]);
  let qaCriteria = $state<{ key: string; label: string }[]>([]);
  let qaModalItem = $state<QaItem | null>(null);
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let ciByExt = $state<Record<string, CiRollup>>({});

  async function refresh() {
    try {
      void loadProvidersAndCatalog();
      const [floorRes, qaRes, criteriaRes] = await Promise.all([
        fetch('/api/factory-floor', { credentials: 'same-origin' }),
        fetch('/api/admin/qa-queue', { credentials: 'same-origin' }),
        fetch('/api/admin/qa-criteria', { credentials: 'same-origin' }),
      ]);
      if (!floorRes.ok) { stale = true; return; }
      data = await floorRes.json() as FloorPayload;
      stale = false;
      if (qaRes.ok) { const { items } = await qaRes.json(); qaItems = items ?? []; }
      if (criteriaRes.ok) { const { criteria } = await criteriaRes.json(); qaCriteria = criteria ?? []; }
      void refreshCi(data.hall.filter(w => w.prNumber).map(w => w.extId));
      window.dispatchEvent(new CustomEvent('factory-floor-refreshed', {
        detail: {
          planningCount: data?.planningCount,
          hallActive: data?.hall.length ?? 0,
        },
      }));
    } catch { stale = true; }
  }
  async function refreshCi(extIds: string[]) {
    await Promise.all(extIds.map(async (id) => {
      try {
        const r = await fetch(`/api/factory-floor/${encodeURIComponent(id)}/ci`, { credentials: 'same-origin' });
        if (r.ok) { const { rollup } = await r.json(); ciByExt = { ...ciByExt, [id]: rollup }; }
      } catch { /* CI badge stays absent on error */ }
    }));
  }
  async function openDetail(extId: string) {
    selected = extId; detail = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}`, { credentials: 'same-origin' });
      if (res.ok) detail = await res.json() as TicketDetail;
    } catch { /* keep panel open with a spinner */ }
  }
  function closeDetail() { selected = null; detail = null; }
  let injKind = $state<InjectionKind>('context');
  let injPhase = $state<string>('');
  let injTitle = $state('');
  let injContent = $state('');
  let injBusy = $state(false);
  let injError = $state<string | null>(null);
  async function submitInjection() {
    if (!selected) return;
    injBusy = true; injError = null;
    const payload: Record<string, unknown> = { kind: injKind, title: injTitle || undefined, content: injContent || undefined };
    if (injPhase) payload.phase = injPhase;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(selected)}/inject`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { injError = `Fehler (${res.status})`; return; }
      injTitle = ''; injContent = '';
      await openDetail(selected);
    } catch { injError = 'Netzwerkfehler'; }
    finally { injBusy = false; }
  }
  let releasing = $state<string | null>(null);
  let releaseErr = $state<string | null>(null);
  async function releaseToFactory(extId: string) {
    releasing = extId; releaseErr = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}/release`, {
        method: 'POST', credentials: 'same-origin',
      });
      if (!res.ok) { releaseErr = `Freigabe fehlgeschlagen (${res.status})`; return; }
      if (data) data = { ...data, staged: data.staged.filter((s) => s.extId !== extId),
                         stagedWaiting: Math.max(0, (data.stagedWaiting ?? 1) - 1) };
      await refresh();
    } catch { releaseErr = 'Netzwerkfehler'; }
    finally { releasing = null; }
  }
  let manualHintFor = $state<string | null>(null);
  function toggleManualHint(extId: string) {
    manualHintFor = manualHintFor === extId ? null : extId;
  }
  function connectSSE() {
    es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
    es.addEventListener('phase', () => { void refresh(); });
    es.addEventListener('heartbeat', () => { stale = false; });
    es.onerror = () => {
      es?.close(); es = null;
      if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSSE(); }, SSE_RECONNECT_MS);
    };
  }

  onMount(() => { if (!initial) void refresh(); connectSSE(); void loadProvidersAndCatalog(); });
  onDestroy(() => { es?.close(); if (reconnectTimer) clearTimeout(reconnectTimer); });
</script>
<div class="text-light" data-testid="factory-floor">
  {#if !data}
    <p class="text-muted">Fabrikhalle lädt…</p>
  {:else}
    <div class="mb-3 flex items-center gap-2 text-xs" data-testid="floor-pulse">
      <span class="relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full rounded-full opacity-75"
              class:bg-emerald-400={!stale} class:bg-amber-400={stale} class:animate-ping={!stale}></span>
        <span class="relative inline-flex h-2 w-2 rounded-full"
              class:bg-emerald-400={!stale} class:bg-amber-400={stale}></span>
      </span>
      {#if stale}
        <span class="text-amber-400/90" data-testid="floor-stale">Veraltet — letzter Stand wird gezeigt.</span>
      {:else}
        <span class="text-muted">live · aktualisiert {relTime(data.fetchedAt)}</span>
      {/if}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="floor-leitstand">
      <FloorControlCard control={data.control} />
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Slots</p><p class="text-xl font-bold" data-testid="floor-slots">{data.control.slotsUsed}/{data.control.slotsCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Daily-Cap</p><p class="text-xl font-bold">{data.control.dailyUsed}/{data.control.dailyCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Durchsatz heute</p><p class="text-xl font-bold">{data.metrics.shippedToday}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Ø Zyklus</p><p class="text-xl font-bold">{data.metrics.avgCycleH ?? '–'}h</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Watchdog-Stale</p><p class="text-xl font-bold">{data.control.watchdogStale}</p></div>
      <a href="/admin/planungsbuero" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-office" title="Im Planungsbüro"><p class="text-muted text-xs">Büro</p><p class="text-xl font-bold">{data.officeWaiting ?? 0}</p></a>
      <a href="#floor-kommissionierung" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-komm-count" title="Zur Kommissionierung"><p class="text-muted text-xs">Kommissionierung</p><p class="text-xl font-bold">{data.stagedWaiting ?? 0}</p></a>
    </div>

    <AttentionStrip attention={data.attention} />

    <div class="mobile-station-dots" aria-hidden="true">
      {#each Array(10) as _, i}
        <span class="dot" class:active={i === mobileColIndex}></span>
      {/each}
    </div>
    <MobileTabBar activeIndex={mobileColIndex} onSelect={(i) => { mobileColIndex = i; }} />

    <div
      class="kanban-container flex flex-col lg:flex-row gap-4"
      ontouchstart={onTouchStart}
      ontouchend={onTouchEnd}
    >
      <StagedColumn
        staged={data.staged}
        stagedWaiting={data.stagedWaiting ?? 0}
        {releasing}
        {releaseErr}
        {manualHintFor}
        {mobileColIndex}
        onOpenDetail={openDetail}
        onReleaseToFactory={releaseToFactory}
        onToggleManualHint={toggleManualHint}
        {relTime}
        {prioDot}
        {planUrl}
        {ticketUrl}
      />
      <FactoryFloorLane
        hall={data.hall}
        loadingDock={data.loadingDock}
        {mobileColIndex}
        {ciByExt}
        onSelect={openDetail}
        activeConfigs={activeConfigsByPhase}
        onOpenDrawerPhase={(phase) => { openDrawerPhase = phase; }}
      />

      <div class="lg:w-1/5" data-testid="floor-qa">
        <h3 class="font-semibold mb-2">QS-Abnahme</h3>
        {#if qaItems.length === 0}
          <p class="text-muted text-sm">Keine Tickets warten auf Abnahme.</p>
        {:else}
          <div class="space-y-1">
            {#each qaItems as item (item.extId)}
              <QaChip
                {item}
                isActive={qaModalItem?.extId === item.extId}
                draftCount={0}
                on:click={() => { qaModalItem = item; }}
              />
            {/each}
          </div>
        {/if}
      </div>

      {#if data?.awaitingDeployVisible}
        <AwaitingDeployLane items={data.awaitingDeploy ?? []} {mobileColIndex} />
      {/if}

      <ShippedColumn
        shipped={data.shipped}
        {mobileColIndex}
        {relTime}
        {prUrl}
      />
    </div>

    <DetailPanel
      {detail}
      {selected}
      onClose={closeDetail}
      {injKind}
      {injPhase}
      {injTitle}
      {injContent}
      {injBusy}
      {injError}
      onSubmitInjection={submitInjection}
      {prUrl}
      {isMobile}
    />

    {#if qaModalItem}
      <QaModal
        item={qaModalItem}
        criteria={qaCriteria}
        on:close={() => { qaModalItem = null; }}
        on:submitted={() => { qaModalItem = null; refresh(); }}
      />
    {/if}

    {#if openDrawerPhase}
      <KiProviderDrawer
        title={PHASE_LABELS[openDrawerPhase] || openDrawerPhase}
        entries={entriesForPhase(openDrawerPhase)}
        health={providerHealth}
        {catalog}
        {editId}
        {form}
        {confirmingDelete}
        onclose={closeDrawer}
        onsave={saveForm}
        onedit={(e) => startEdit(e)}
        onnew={startNew}
        oncanceledit={() => (editId = null)}
        ondelete={(id) => doDelete(id)}
        onconfirmdelete={(id) => (confirmingDelete = id)}
        onchangepriority={(e, d) => changePriority(e, d)}
        onproviderchange={onProviderChange}
        showtoast={showToast}
      />
    {/if}

    {#if toast}
      <div class="toast" role="alert">{toast}</div>
    {/if}
  {/if}
</div>
<style>
  @media (max-width: 767px) {
    .kanban-container [data-col] { display: none; }
    .kanban-container [data-col].mobile-visible { display: flex; flex-direction: column; width: 100%; }
    .kanban-container { overflow-x: hidden; }
  }

  .mobile-station-dots {
    display: none;
  }
  @media (max-width: 767px) {
    .kanban-container {
      padding-bottom: calc(var(--factory-tab-bar-height, 48px) + env(safe-area-inset-bottom, 0px) + 8px);
    }
    .mobile-station-dots {
      display: flex;
      justify-content: center;
      gap: 4px;
      padding: 6px 0 2px;
    }
    .dot {
      width: 4px;
      height: 4px;
      background: var(--factory-border);
      border-radius: 2px;
      transition: width 0.15s ease, background 0.15s ease;
      flex-shrink: 0;
    }
    .dot.active {
      width: 8px;
      background: var(--factory-accent);
    }
  }

  @media (max-width: 767px) {
    :global([data-testid="floor-leitstand"] > *) { padding: 0.5rem !important; }
    :global([data-testid="floor-leitstand"] p.text-xl) { font-size: 1.125rem !important; }
    :global([data-testid="floor-leitstand"] p.text-xs) { font-size: 10px !important; }
    :global([data-testid="floor-pulse"]) { flex-wrap: wrap; row-gap: 4px; }
    :global([data-testid="floor-stale"]) { font-size: 12px; flex-basis: 100%; }
  }

  .toast {
    position: fixed;
    bottom: 24px;
    left: 24px;
    background: #9b1c1c;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    font-size: 14px;
  }
</style>
