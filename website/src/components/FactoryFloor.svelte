<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Phase = 'scout' | 'design' | 'plan' | 'implement' | 'verify' | 'deploy';
  interface ControlSnapshot { killSwitch: boolean; slotsUsed: number; slotsCap: number; dailyCap: number; dailyUsed: number; dryRun: boolean; watchdogStale: number; }
  interface FloorMetrics { shippedToday: number; avgCycleH: number | null; }
  interface LoadingDockItem { extId: string; title: string; priority: string; waitReason: string; }
  interface HallItem { extId: string; title: string; priority: string; phase: Phase | null; phaseState: 'entered'|'done'|'blocked'|null; phaseSince: string | null; retryCount: number; blockReason: string | null; slot: number | null; }
  interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
  interface FloorPayload { control: ControlSnapshot; metrics: FloorMetrics; loadingDock: LoadingDockItem[]; hall: HallItem[]; shipped: ShippedItem[]; fetchedAt: string; }

  interface PhaseEventRow { phase: Phase; state: string; detail: string | null; driver: string; at: string; }
  interface Breadcrumb { authorLabel: string; body: string; at: string; }
  interface TicketDetail { extId: string; title: string; status: string; priority: string; retryCount: number; prNumber: number | null; events: PhaseEventRow[]; breadcrumbs: Breadcrumb[]; }

  let { initial }: { initial: FloorPayload | null } = $props();

  const POLL_MS = 4000;
  const STATIONS: { key: Phase; label: string }[] = [
    { key: 'scout', label: 'Scout' }, { key: 'design', label: 'Design' }, { key: 'plan', label: 'Plan' },
    { key: 'implement', label: 'Implement' }, { key: 'verify', label: 'Verify' }, { key: 'deploy', label: 'Deploy' },
  ];

  let data = $state<FloorPayload | null>(initial);
  let stale = $state(false);
  let selected = $state<string | null>(null);
  let detail = $state<TicketDetail | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/factory-floor', { credentials: 'same-origin' });
      if (!res.ok) { stale = true; return; }
      data = await res.json() as FloorPayload;
      stale = false;
    } catch { stale = true; }
  }

  async function openDetail(extId: string) {
    selected = extId; detail = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}`, { credentials: 'same-origin' });
      if (res.ok) detail = await res.json() as TicketDetail;
    } catch { /* keep panel open with a spinner */ }
  }
  function closeDetail() { selected = null; detail = null; }

  function hallAt(station: Phase): HallItem[] {
    return data?.hall.filter((h) => h.phase === station) ?? [];
  }
  function assetFallback(e: Event) { (e.currentTarget as HTMLImageElement).style.display = 'none'; }

  onMount(() => { if (!initial) refresh(); timer = setInterval(refresh, POLL_MS); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<div class="text-light" data-testid="factory-floor">
  {#if !data}
    <p class="text-muted">Fabrikhalle lädt…</p>
  {:else}
    {#if stale}
      <div class="mb-3 text-sm text-amber-400/80" data-testid="floor-stale">Veraltet — letzter Stand wird gezeigt.</div>
    {/if}

    <!-- ① Leitstand -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="floor-leitstand">
      <div class="rounded-xl p-3" class:bg-red-500={data.control.killSwitch} class:bg-white={!data.control.killSwitch} class:bg-opacity-5={!data.control.killSwitch}>
        <p class="text-muted text-xs">Kill-Switch</p><p class="text-xl font-bold">{data.control.killSwitch ? 'AN' : 'aus'}</p>
      </div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Slots</p><p class="text-xl font-bold" data-testid="floor-slots">{data.control.slotsUsed}/{data.control.slotsCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Daily-Cap</p><p class="text-xl font-bold">{data.control.dailyUsed}/{data.control.dailyCap}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Durchsatz heute</p><p class="text-xl font-bold">{data.metrics.shippedToday}</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Ø Zyklus</p><p class="text-xl font-bold">{data.metrics.avgCycleH ?? '–'}h</p></div>
      <div class="rounded-xl bg-white/5 p-3"><p class="text-muted text-xs">Watchdog-Stale</p><p class="text-xl font-bold">{data.control.watchdogStale}</p></div>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <!-- ② Laderampe -->
      <div class="lg:w-1/5" data-testid="floor-loadingdock">
        <h3 class="font-semibold mb-2">Laderampe</h3>
        {#if data.loadingDock.length === 0}
          <p class="text-muted text-sm">Leer.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.loadingDock as d (d.extId)}
              <li class="rounded bg-white/5 px-2 py-1 text-sm">
                <span class="font-mono">{d.extId}</span> — {d.title}
                <span class="block text-muted text-xs">⏳ {d.waitReason}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- ③ Die Halle -->
      <div class="lg:w-3/5" data-testid="floor-hall">
        <h3 class="font-semibold mb-2">Halle</h3>
        {#if data.hall.length === 0}
          <p class="text-muted text-sm">Fabrik im Leerlauf.</p>
        {/if}
        <div class="grid grid-cols-6 gap-2">
          {#each STATIONS as st (st.key)}
            <div class="rounded-lg bg-white/5 p-2 min-h-24">
              <img src={`/factory/station-${st.key}.svg`} alt="" class="h-8 mx-auto mb-1" onerror={assetFallback} />
              <p class="text-center text-xs text-muted mb-1">{st.label}</p>
              {#each hallAt(st.key) as w (w.extId)}
                <button
                  onclick={() => openDetail(w.extId)}
                  data-testid="floor-workpiece"
                  class="block w-full text-left rounded px-1 py-0.5 text-xs mb-1 transition-all"
                  class:bg-gold={w.phaseState !== 'blocked'}
                  class:text-dark={w.phaseState !== 'blocked'}
                  class:bg-red-500={w.phaseState === 'blocked'}
                  class:animate-pulse={w.phaseState === 'blocked'}>
                  {w.extId}{w.phaseState === 'blocked' ? ' ⛔' : ''}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- ④ Versand -->
      <div class="lg:w-1/5" data-testid="floor-shipped">
        <h3 class="font-semibold mb-2">Versand</h3>
        {#if data.shipped.length === 0}
          <p class="text-muted text-sm">Noch nichts versandt.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.shipped as s (s.extId)}
              <li class="rounded bg-white/5 px-2 py-1 text-sm">
                <span class="font-mono">{s.extId}</span> — {s.title}
                {#if s.prNumber}<span class="block text-muted text-xs">PR #{s.prNumber}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- ⑤ Detail-Panel (Slide-in) -->
    {#if selected}
      <div class="fixed inset-y-0 right-0 w-full max-w-md bg-dark-light border-l border-white/10 p-5 overflow-y-auto z-50" data-testid="floor-detail">
        <button onclick={closeDetail} class="float-right text-muted">✕</button>
        <h3 class="font-bold mb-3">{selected}</h3>
        {#if !detail}
          <p class="text-muted text-sm">Lädt…</p>
        {:else}
          <p class="mb-2">{detail.title}</p>
          <p class="text-muted text-sm mb-3">Status: {detail.status} · Priorität: {detail.priority} · Retries: {detail.retryCount}{#if detail.prNumber} · PR #{detail.prNumber}{/if}</p>
          <h4 class="font-semibold mt-3 mb-1">Phasen-Timeline</h4>
          <ul class="space-y-1 text-sm">
            {#each detail.events as e}
              <li class="rounded bg-white/5 px-2 py-1">
                <span class="font-mono">{e.phase}/{e.state}</span>
                <span class="text-muted text-xs"> · {new Date(e.at).toLocaleString('de-DE')} · {e.driver}</span>
                {#if e.detail}<span class="block text-muted text-xs">{e.detail}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if detail.breadcrumbs.length}
            <h4 class="font-semibold mt-3 mb-1">Breadcrumbs</h4>
            <ul class="space-y-1 text-sm">
              {#each detail.breadcrumbs as b}
                <li class="rounded bg-white/5 px-2 py-1"><span class="text-muted text-xs">{b.authorLabel}:</span> {b.body}</li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>
