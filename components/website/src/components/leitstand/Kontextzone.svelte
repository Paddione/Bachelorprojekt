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

  // ── Idle-Zweig: KPI-Raster portiert aus OverviewDashboard.load() (Fetch
  //    /sdlc/api/cockpit/portfolio, phaseMap-Aggregation), ohne die alte
  //    Attention-Sektion (redundant zu Z2). ──
  interface PhaseSummary {
    phase: string; label: string; total: number; done: number; blocked: number; inProgress: number;
  }

  const PHASE_LABELS: Record<string, string> = {
    triage: 'Triage', planung: 'Planung', bauen: 'Bauen',
    review: 'Review', deploy: 'Deploy', ship: 'Ship',
  };
  const PHASE_ORDER = ['triage', 'planung', 'bauen', 'review', 'deploy', 'ship'];

  const emptyPhases = (): PhaseSummary[] => PHASE_ORDER.map((p) => ({
    phase: p, label: PHASE_LABELS[p] || p, total: 0, done: 0, blocked: 0, inProgress: 0,
  }));

  let phases = $state<PhaseSummary[]>(emptyPhases());
  let idleLoading = $state(true);

  async function loadPortfolio() {
    idleLoading = true;
    try {
      const res = await fetch('/sdlc/api/cockpit/portfolio');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const phaseMap = new Map(PHASE_ORDER.map((p) => [p, {
        phase: p, label: PHASE_LABELS[p] || p, total: 0, done: 0, blocked: 0, inProgress: 0,
      }]));
      if (data.products) {
        for (const product of data.products) {
          for (const feature of product.features || []) {
            if (feature.rollup) {
              const phase = feature.nextStep ? 'bauen' : feature.discarded ? 'triage' : 'planung';
              const s = phaseMap.get(phase);
              if (s) {
                s.total += feature.rollup.total || 0;
                s.done += feature.rollup.done || 0;
                s.blocked += feature.rollup.blocked || 0;
                s.inProgress += feature.rollup.inProgress || 0;
              }
            }
          }
        }
      }
      phases = Array.from(phaseMap.values());
    } catch {
      // fail-soft: Leerzustand bleibt stehen, nie die Shell blockieren (D12/D13)
      phases = emptyPhases();
    } finally {
      idleLoading = false;
    }
  }

  $effect(() => {
    if (!sel.station && !sel.ticket) void loadPortfolio();
  });
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
    <!-- Idle: KPI-Raster + PR-Sektion (Leerzustand, keine PR-Listen-API deklariert) -->
    <div class="ls-kontextzone__idle">
      <section class="ls-kpi-grid">
        <h2 class="ls-kontextzone__heading">Lifecycle</h2>
        {#if idleLoading}
          <p class="ls-kontextzone__muted">Lade Phasen…</p>
        {:else}
          <div class="ls-kpi-grid__cards">
            {#each phases as phase}
              <div
                class="ls-kpi-card"
                class:ls-kpi-card--empty={phase.total === 0}
                data-kpi={phase.phase}
              >
                <span class="ls-kpi-card__label">{phase.label}</span>
                <span class="ls-kpi-card__count">{phase.total}</span>
                <span class="ls-kpi-card__detail">
                  {#if phase.inProgress > 0}
                    <span class="ls-kpi-card__chip ls-kpi-card__chip--progress">{phase.inProgress} aktiv</span>
                  {/if}
                  {#if phase.blocked > 0}
                    <span class="ls-kpi-card__chip ls-kpi-card__chip--blocked">{phase.blocked} ⛔</span>
                  {/if}
                  {#if phase.done > 0}
                    <span class="ls-kpi-card__chip ls-kpi-card__chip--done">{phase.done} ✓</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="ls-pr-section">
        <h2 class="ls-kontextzone__heading">Pull Requests</h2>
        <p class="ls-pr-section__empty">Offene PRs und CI-Status werden hier angezeigt (kommendes Feature).</p>
      </section>
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
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-7);
  }

  .ls-kontextzone__heading {
    font-family: var(--ls-font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted);
    margin: 0 0 var(--ls-space-4);
  }

  .ls-kontextzone__muted {
    color: var(--ls-text-muted);
    font-size: 0.8rem;
  }

  .ls-kpi-grid__cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--ls-space-4);
  }

  .ls-kpi-card {
    background: var(--ls-surface-raised);
    border: 1px solid var(--ls-line);
    border-radius: var(--ls-radius-md);
    padding: var(--ls-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-2);
  }

  .ls-kpi-card--empty {
    opacity: 0.55;
  }

  .ls-kpi-card__label {
    font-family: var(--ls-font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ls-text-secondary);
  }

  .ls-kpi-card__count {
    font-family: var(--ls-font-sans);
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1;
    color: var(--ls-text-primary);
  }

  .ls-kpi-card__detail {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ls-space-2);
  }

  .ls-kpi-card__chip {
    font-family: var(--ls-font-mono);
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: var(--ls-radius-sm);
  }

  .ls-kpi-card__chip--progress { background: var(--ls-signal-info-dim); color: var(--ls-signal-info); }
  .ls-kpi-card__chip--blocked { background: var(--ls-signal-red-dim); color: var(--ls-signal-red); }
  .ls-kpi-card__chip--done { background: var(--ls-signal-green-dim); color: var(--ls-signal-green); }

  .ls-pr-section {
    border-top: 1px solid var(--ls-line);
    padding-top: var(--ls-space-5);
  }

  .ls-pr-section__empty {
    color: var(--ls-text-muted);
    font-size: 0.8rem;
  }
</style>
