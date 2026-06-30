<script lang="ts">
  import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
  import type { FloorPayload, HallItem, StagedItem, LoadingDockItem, ShippedItem } from '../../lib/factory-floor-types';
  import PhaseStepper from '../factory/PhaseStepper.svelte';

  let { onClose: _onClose }: { onClose: () => void } = $props();

  let floor = $state<FloorPayload | null>(null);
  let qaItems = $state<{ extId: string }[]>([]);
  let error = $state('');
  let loading = $state(true);
  let expandedLane = $state<string | null>(null);
  let expandedTicket = $state<string | null>(null);

  const lanes = $derived(PIPELINE_LANES.filter((l) => !l.side));

  function getCount(key: string): number {
    if (!floor) return 0;
    switch (key) {
      case 'planning': return floor.planningCount.total;
      case 'staged': return floor.staged.length;
      case 'loadingDock': return floor.loadingDock.length;
      case 'hall': return floor.hall.length;
      case 'qa': return qaItems.length;
      case 'shipped': return floor.shipped.length;
      default: return 0;
    }
  }

  function getCountLabel(key: string): string {
    if (!floor || key !== 'planning') return String(getCount(key));
    return `${floor.planningCount.ready}/${floor.planningCount.total}`;
  }

  function getTickets(key: string): (StagedItem | LoadingDockItem | HallItem | ShippedItem | { extId: string })[] {
    if (!floor) return [];
    switch (key) {
      case 'staged': return floor.staged;
      case 'loadingDock': return floor.loadingDock;
      case 'hall': return floor.hall;
      case 'qa': return qaItems;
      case 'shipped': return floor.shipped;
      default: return [];
    }
  }

  const maxCount = $derived(Math.max(1, ...lanes.map((l) => getCount(l.key))));

  function lanePct(key: string): number {
    return Math.round((getCount(key) / maxCount) * 100);
  }

  function isHallItem(t: unknown): t is HallItem {
    return typeof t === 'object' && t !== null && 'phase' in t;
  }

  function ticketLabel(t: { extId: string; title?: string }): string {
    if ('title' in t && typeof t.title === 'string' && t.title) {
      return t.title;
    }
    return t.extId;
  }

  function ticketPrio(t: { extId: string; priority?: string }): string {
    return 'priority' in t ? (t.priority ?? '') : '';
  }

  function toggleLane(key: string) {
    expandedLane = expandedLane === key ? null : key;
    expandedTicket = null;
  }

  function toggleTicket(extId: string) {
    expandedTicket = expandedTicket === extId ? null : extId;
  }

  async function loadData() {
    loading = true;
    error = '';
    try {
      const [floorRes, qaRes] = await Promise.all([
        fetch('/api/factory-floor', { credentials: 'same-origin' }),
        fetch('/api/admin/qa-queue', { credentials: 'same-origin' }),
      ]);
      if (!floorRes.ok) throw new Error(`Floor HTTP ${floorRes.status}`);
      floor = await floorRes.json() as FloorPayload;
      if (qaRes.ok) {
        qaItems = await qaRes.json() as { extId: string }[];
      }
    } catch {
      error = 'Pipeline konnte nicht geladen werden.';
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadData(); });

  // SSE live refresh — silent reconnect on disconnect
  $effect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        es = new EventSource('/api/factory-floor/stream');
        es.onmessage = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as { floor?: FloorPayload };
            if (data.floor) floor = data.floor;
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => {
          es?.close();
          timer = setTimeout(connect, 5000);
        };
      } catch { /* fail-soft */ }
    }

    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  });
</script>

<div class="view">
  <div class="pv-intro">
    <span class="pv-eyebrow">
      <span class="pv-eyebrow-bar" aria-hidden="true"></span>
      Pipeline
    </span>
    <p class="pv-desc">Ticket-Status von der Planung bis zur Auslieferung.</p>
  </div>

  {#if error}
    <p class="err">{error}</p>
  {:else if loading && !floor}
    {#each lanes as _lane}
      <div class="pv-skeleton" aria-hidden="true"></div>
    {/each}
  {:else}
    <div class="pv-strip">
      {#each lanes as lane (lane.key)}
        <button
          class="pv-lane"
          class:pv-lane--open={expandedLane === lane.key}
          data-testid="pipeline-lane"
          data-lane={lane.key}
          onclick={() => toggleLane(lane.key)}
          aria-expanded={expandedLane === lane.key}
        >
          <span class="pv-lane-top">
            <span class="pv-lane-label">{lane.label}</span>
            <span class="pv-lane-count">{getCountLabel(lane.key)}</span>
          </span>
          <span class="pv-bar-track">
            <span class="pv-bar-fill" style="width: {lanePct(lane.key)}%"></span>
          </span>
        </button>

        {#if expandedLane === lane.key}
          <div class="pv-drill">
            {#if getTickets(lane.key).length === 0}
              <p class="empty">{lane.label}: Keine Tickets</p>
            {:else}
              {#each getTickets(lane.key) as ticket (ticket.extId)}
                <div class="pv-ticket" class:pv-ticket--open={expandedTicket === ticket.extId}>
                  <button
                    class="pv-ticket-head"
                    onclick={() => toggleTicket(ticket.extId)}
                    aria-expanded={expandedTicket === ticket.extId}
                  >
                    <span class="pv-ticket-label">
                      <span class="ext-id">{ticket.extId}</span>
                      <span class="pv-ticket-title">{ticketLabel(ticket)}</span>
                    </span>
                    {#if ticketPrio(ticket)}
                      <span class="prio-dot prio-{ticketPrio(ticket)}" aria-hidden="true"></span>
                    {/if}
                  </button>
                  {#if expandedTicket === ticket.extId && isHallItem(ticket) && ticket.phaseProgress.length}
                    <div class="pv-stepper-wrap">
                      <PhaseStepper segments={ticket.phaseProgress} />
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
