<script lang="ts">
  import { onMount } from 'svelte';
  import type { FloorPayload, TicketDetail, InjectionKind } from '../../lib/factory-floor-types.ts';
  import { relTime, prUrl } from '../../lib/sdlc/factory-floor-client.ts';
  import { onLeitstandSelectionChange, pushLeitstandSelection } from '../../lib/sdlc/leitstand-url.ts';
  import type { LeitstandSelection } from '../../lib/sdlc/leitstand-url.ts';
  import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store.ts';
  import FactoryFloor from '../sdlc/FactoryFloor.svelte';
  import PlanningOffice from '../PlanningOffice.svelte';
  import DetailPanel from '../sdlc/factory/DetailPanel.svelte';
  import ShippedColumn from '../sdlc/factory/ShippedColumn.svelte';
  import KpiGrid from './KpiGrid.svelte';

  // Props: SSR-Erstzustand von cockpit.astro durchgereicht.
  let {
    initial = null,
    brand,
    initialSelection = {},
  }: {
    initial?: FloorPayload | null;
    brand: string;
    initialSelection?: LeitstandSelection;
  } = $props();

  // Aktuelle Selektion: initialSelection (SSR) -> Live-Updates via Kontrakt B.
  let sel = $state<LeitstandSelection>(initialSelection);

  onMount(() => {
    const offSel = onLeitstandSelectionChange((s) => {
      sel = s;
    });
    return () => offSel();
  });

  // ── Ticket-Zweig: eigenes Detail-Fetch (analog FactoryFloor.openDetail,
  //    bewusst kleine Dopplung statt groesserer Extraktion -- T007957/E3). ──
  let detail = $state<TicketDetail | null>(null);
  let detailLoading = $state(false);
  let injKind = $state<InjectionKind>('context');
  let injPhase = $state('');
  let injTitle = $state('');
  let injContent = $state('');
  let injBusy = $state(false);
  let injError = $state<string | null>(null);

  $effect(() => {
    const ticket = sel.ticket;
    if (!ticket) {
      detail = null;
      return;
    }
    detailLoading = true;
    detail = null;
    fetch(`/sdlc/api/factory-floor/${encodeURIComponent(ticket)}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { detail = d as TicketDetail | null; })
      .catch(() => { detail = null; })
      .finally(() => { detailLoading = false; });
  });

  async function submitInjection() {
    if (!sel.ticket) return;
    injBusy = true;
    injError = null;
    const payload: Record<string, unknown> = {
      kind: injKind, title: injTitle || undefined, content: injContent || undefined,
    };
    if (injPhase) payload.phase = injPhase;
    try {
      const res = await fetch(`/sdlc/api/factory-floor/${encodeURIComponent(sel.ticket)}/inject`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { injError = `Fehler (${res.status})`; return; }
      injTitle = '';
      injContent = '';
    } catch (e) {
      injError = e instanceof Error ? e.message : 'Injection fehlgeschlagen';
    } finally {
      injBusy = false;
    }
  }

  function clearTicket() {
    // Ticket aus der URL-Selektion entfernen; die Station bleibt erhalten.
    pushLeitstandSelection({ station: sel.station });
  }

  // ── Ship-Zweig: Shipped-Liste aus dem floorStore (wie FactoryFloor). ──
  let shippedList = $state<{ extId: string; title: string; prNumber?: number | null; doneAt?: string | null }[]>([]);
  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => {
      if (s.payload) shippedList = s.payload.shipped ?? [];
    });
    return () => { unsub(); release(); };
  });

  const FERTIGUNG_STATIONS = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'];
  const isFertigung = $derived(FERTIGUNG_STATIONS.includes(sel.station ?? ''));
</script>

<div class="ls-kontextzone" data-testid="leitstand-kontextzone">
  {#if sel.ticket}
    <DetailPanel
      detail={detailLoading ? null : detail}
      selected={sel.ticket}
      onClose={clearTicket}
      {injKind}
      {injPhase}
      {injTitle}
      {injContent}
      {injBusy}
      {injError}
      onSubmitInjection={submitInjection}
      {prUrl}
    />
  {:else if isFertigung}
    <!-- Alle sechs Fertigungsstationen zeigen dieselbe Bauen-Ansicht -->
    <FactoryFloor {initial} />
  {:else if sel.station === 'triage' || sel.station === 'planung'}
    <PlanningOffice {brand} stationFilter={sel.station} />
  {:else if sel.station === 'ship'}
    <ShippedColumn
      shipped={shippedList}
      mobileColIndex={0}
      {relTime}
      {prUrl}
    />
  {:else}
    <!-- Idle: DORA-/Factory-KPI-Raster (T008016/E4) -- laedt sich selbst,
         fail-soft mit fetchedAt + error-Feld (D12/D13). -->
    <div class="ls-kontextzone__idle">
      <KpiGrid />
    </div>
  {/if}
</div>

<style>
  .ls-kontextzone {
    background: var(--ls-surface-base);
    color: var(--ls-text-primary);
    min-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .ls-kontextzone__idle {
    padding: var(--ls-space-6);
  }
</style>
