<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Phase = 'scout' | 'design' | 'plan' | 'implement' | 'verify' | 'deploy';
  interface ControlSnapshot { killSwitch: boolean; slotsUsed: number; slotsCap: number; dailyCap: number; dailyUsed: number; dryRun: boolean; watchdogStale: number; }
  interface FloorMetrics { shippedToday: number; avgCycleH: number | null; }
  interface LoadingDockItem { extId: string; title: string; priority: string; waitReason: string; }
  interface HallItem { extId: string; title: string; priority: string; phase: Phase | null; phaseState: 'entered'|'done'|'blocked'|null; phaseSince: string | null; retryCount: number; blockReason: string | null; slot: number | null; driver: 'factory'|'devflow'|null; prNumber: number | null; ciStatus: 'success'|'pending'|'failure'|null; }
  interface ShippedItem { extId: string; title: string; doneAt: string | null; prNumber: number | null; }
  interface StagedItem { extId: string; title: string; priority: string; branch: string | null; planPath: string | null; createdAt: string | null; }
  interface FloorPayload { control: ControlSnapshot; metrics: FloorMetrics; loadingDock: LoadingDockItem[]; hall: HallItem[]; shipped: ShippedItem[]; staged: StagedItem[]; officeWaiting: number; stagedWaiting: number; fetchedAt: string; }

  interface PhaseEventRow { phase: Phase; state: string; detail: string | null; driver: string; at: string; }
  interface Breadcrumb { authorLabel: string; body: string; at: string; }
  interface InjectionRow { id: string; phase: string | null; kind: 'context'|'note'|'asset'; title: string | null; content: string | null; filename: string | null; injectedBy: string; injectedAt: string; consumedAt: string | null; }
  interface TicketDetail { extId: string; title: string; status: string; priority: string; retryCount: number; prNumber: number | null; events: PhaseEventRow[]; breadcrumbs: Breadcrumb[]; injections: InjectionRow[]; }

  import QaChip from './QaChip.svelte';
  import QaModal from './QaModal.svelte';
  import type { QaItem } from '../lib/qa-dal';

  let { initial }: { initial: FloorPayload | null } = $props();

  const STATIONS: { key: Phase; label: string }[] = [
    { key: 'scout', label: 'Scout' }, { key: 'design', label: 'Design' }, { key: 'plan', label: 'Plan' },
    { key: 'implement', label: 'Implement' }, { key: 'verify', label: 'Verify' }, { key: 'deploy', label: 'Deploy' },
  ];

  let data = $state<FloorPayload | null>(initial);
  let stale = $state(false);
  let selected = $state<string | null>(null);
  let detail = $state<TicketDetail | null>(null);
  let qaItems = $state<QaItem[]>([]);
  let qaCriteria = $state<{ key: string; label: string }[]>([]);
  let qaModalItem = $state<QaItem | null>(null);
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async function refresh() {
    try {
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

  let injKind = $state<'context'|'note'|'asset'>('context');
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
      await openDetail(selected); // refresh injections list
    } catch { injError = 'Netzwerkfehler'; }
    finally { injBusy = false; }
  }

  function hallAt(station: Phase): HallItem[] {
    return data?.hall.filter((h) => h.phase === station) ?? [];
  }
  function assetFallback(e: Event) { (e.currentTarget as HTMLImageElement).style.display = 'none'; }

  // --- Verlinkung + Zeit-Helfer -------------------------------------------------
  const GH_REPO = 'Paddione/Bachelorprojekt';
  const prUrl = (n: number) => `https://github.com/${GH_REPO}/pull/${n}`;
  const ticketUrl = (extId: string) => `/admin/tickets?q=${encodeURIComponent(extId)}`;
  const planUrl = (branch: string, planPath: string) =>
    `https://github.com/${GH_REPO}/blob/${branch}/${planPath}`;

  let releasing = $state<string | null>(null);
  let releaseErr = $state<string | null>(null);

  /** „-> Factory": plan_staged -> backlog, dann optimistisch neu laden. */
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

  /** Kompakte deutsche Relativzeit ("vor 2 Min."). Aktualisiert mit jedem Poll. */
  function relTime(iso: string | null): string {
    if (!iso) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `vor ${s} Sek.`;
    const m = Math.round(s / 60);
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60);
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.round(h / 24)} Tg.`;
  }
  function minutesSince(iso: string | null): number {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  }
  const STUCK_MIN = 15; // Werkstück hängt verdächtig lange in einer Phase
  function ciIcon(s: 'success'|'pending'|'failure'|null): string {
    return s === 'success' ? '🟢' : s === 'failure' ? '🔴' : s === 'pending' ? '🟡' : '';
  }
  function openPR(n: number | null) { if (n) window.open(prUrl(n), '_blank', 'noopener'); }
  function prioDot(p: string): string {
    if (p === 'hoch') return 'bg-red-400';
    if (p === 'mittel') return 'bg-amber-400';
    if (p === 'niedrig') return 'bg-emerald-400';
    return 'bg-white/40';
  }

  function connectSSE() {
    es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
    es.addEventListener('phase', () => { void refresh(); });
    es.addEventListener('heartbeat', () => { stale = false; });
    es.onerror = () => {
      es?.close(); es = null;
      if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSSE(); }, 5000);
    };
  }

  onMount(() => { if (!initial) void refresh(); connectSSE(); });
  onDestroy(() => {
    es?.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
</script>

<div class="text-light" data-testid="factory-floor">
  {#if !data}
    <p class="text-muted">Fabrikhalle lädt…</p>
  {:else}
    <!-- Live-Indikator: zeigt, dass das 4s-Polling lebt -->
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
      <a href="/admin/planungsbuero" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-office" title="Im Planungsbüro"><p class="text-muted text-xs">Büro</p><p class="text-xl font-bold">{data.officeWaiting ?? 0}</p></a>
      <a href="#floor-kommissionierung" class="rounded-xl bg-white/5 p-3 hover:bg-white/10 transition-colors" data-testid="floor-komm-count" title="Zur Kommissionierung"><p class="text-muted text-xs">Kommissionierung</p><p class="text-xl font-bold">{data.stagedWaiting ?? 0}</p></a>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <!-- ⓪ Kommissionierung -->
      <div class="lg:w-1/5 scroll-mt-24" id="floor-kommissionierung" data-testid="floor-kommissionierung">
        <h3 class="font-semibold mb-2">Kommissionierung</h3>
        {#if data.staged.length === 0}
          <p class="text-muted text-sm">Nichts kommissioniert.</p>
        {:else}
          <ul class="space-y-1.5">
            {#each data.staged as s (s.extId)}
              <li class="rounded-lg border border-transparent bg-white/5 px-2.5 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.08]"
                  data-testid="floor-staged-item">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="h-2 w-2 shrink-0 rounded-full {prioDot(s.priority)}" title={`Priorität: ${s.priority}`}></span>
                    <a href={ticketUrl(s.extId)} class="font-mono text-xs text-gold hover:underline"
                       title="In der Ticket-Übersicht öffnen">{s.extId}</a>
                  </div>
                  {#if s.createdAt}
                    <span class="whitespace-nowrap text-[10px] text-muted"
                          title={new Date(s.createdAt).toLocaleString('de-DE')}>{relTime(s.createdAt)}</span>
                  {/if}
                </div>
                <button type="button" onclick={() => openDetail(s.extId)}
                        class="mt-0.5 block w-full text-left leading-snug transition-colors hover:text-gold"
                        title="Phasen-Timeline &amp; Details anzeigen">{s.title}</button>
                {#if s.branch && s.planPath}
                  <a href={planUrl(s.branch, s.planPath)} target="_blank" rel="noopener noreferrer"
                     data-testid="floor-staged-plan"
                     class="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-gold hover:text-dark"
                     title={`Branch ${s.branch} · Plan ansehen`}>
                    <svg viewBox="0 0 16 16" class="h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M11.75 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 11a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM3.5 6.5v3h1.5v-3H3.5Zm8.25-1.25a3.25 3.25 0 0 1-3.25 3.25H5v1.5h3.5A4.75 4.75 0 0 0 13.25 5.25h-1.5Z"/></svg>
                    {s.branch}<span class="opacity-60">↗</span>
                  </a>
                {:else}
                  <span class="mt-1 block text-[10px] text-muted">⚠ kein Plan-Ref</span>
                {/if}
                <div class="mt-1.5 flex gap-1.5">
                  <button type="button" onclick={() => releaseToFactory(s.extId)} disabled={releasing === s.extId}
                          data-testid="floor-staged-release"
                          class="rounded bg-emerald-500/80 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-emerald-400 disabled:opacity-50">
                    {releasing === s.extId ? '…' : '→ Factory'}
                  </button>
                  <button type="button" onclick={() => toggleManualHint(s.extId)}
                          data-testid="floor-staged-manual"
                          class="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white/20">
                    → Manuell
                  </button>
                </div>
                {#if manualHintFor === s.extId}
                  <p class="mt-1 rounded bg-white/5 px-2 py-1 text-[10px] text-muted" data-testid="floor-staged-manual-hint">
                    Lokal <code class="text-gold">dev-flow-execute</code> auf <code class="text-gold">{s.branch ?? 'feature/<branch>'}</code> aufrufen.
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if releaseErr}<p class="mt-2 text-xs text-red-400" data-testid="floor-staged-error">{releaseErr}</p>{/if}
      </div>

      <!-- ② Laderampe -->
      <div class="lg:w-1/5" data-testid="floor-loadingdock">
        <h3 class="font-semibold mb-2">Laderampe</h3>
        {#if data.loadingDock.length === 0}
          <p class="text-muted text-sm">Leer.</p>
        {:else}
          <ul class="space-y-1">
            {#each data.loadingDock as d (d.extId)}
              <li class="rounded bg-white/5 px-2 py-1 text-sm">
                <div class="flex items-center gap-1.5">
                  <span class="h-2 w-2 shrink-0 rounded-full {prioDot(d.priority)}" title={`Priorität: ${d.priority}`}></span>
                  <a href={ticketUrl(d.extId)} class="font-mono text-xs text-gold hover:underline">{d.extId}</a>
                  <span class="truncate">{d.title}</span>
                </div>
                <span class="block text-muted text-xs">⏳ {d.waitReason}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- ③ Die Halle -->
      <div class="lg:w-2/5" data-testid="floor-hall">
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
                  data-driver={w.driver ?? 'factory'}
                  title={`${w.title}${w.driver === 'devflow' && w.prNumber ? ` · PR #${w.prNumber}` : ''}${w.blockReason ? ` · ⛔ ${w.blockReason}` : ''}${w.phaseSince ? ` · seit ${minutesSince(w.phaseSince)} Min. in ${w.phase}` : ''}`}
                  class="flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-xs mb-1 transition-all"
                  class:bg-gold={w.driver !== 'devflow' && w.phaseState !== 'blocked'}
                  class:text-dark={w.driver !== 'devflow' && w.phaseState !== 'blocked'}
                  class:bg-red-500={w.driver !== 'devflow' && w.phaseState === 'blocked'}
                  class:border={w.driver === 'devflow'}
                  class:border-blue-400={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:text-blue-300={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:bg-blue-950={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:border-red-400={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:text-red-300={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:bg-red-950={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:animate-pulse={w.phaseState === 'blocked'}>
                  <span class="truncate">{w.extId}{w.driver === 'devflow' ? ' 👨‍💻' : ''}{w.phaseState === 'blocked' ? ' ⛔' : (minutesSince(w.phaseSince) >= STUCK_MIN ? ' ⏱' : '')}</span>
                  {#if w.driver === 'devflow' && w.ciStatus}
                    <span role="button" tabindex="0" data-testid="floor-ci-badge"
                          title={`CI: ${w.ciStatus} — PR öffnen`}
                          onclick={(e) => { e.stopPropagation(); openPR(w.prNumber); }}
                          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openPR(w.prNumber); } }}>
                      {ciIcon(w.ciStatus)}
                    </span>
                  {/if}
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
          <ul class="space-y-1.5">
            {#each data.shipped as s (s.extId)}
              <li class="rounded-lg border border-transparent bg-white/5 px-2.5 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.08]"
                  data-testid="floor-shipped-item">
                <div class="flex items-center justify-between gap-2">
                  <a href={ticketUrl(s.extId)} class="font-mono text-xs text-gold hover:underline"
                     title="In der Ticket-Übersicht öffnen">{s.extId}</a>
                  {#if s.doneAt}
                    <span class="whitespace-nowrap text-[10px] text-muted"
                          title={new Date(s.doneAt).toLocaleString('de-DE')}>{relTime(s.doneAt)}</span>
                  {/if}
                </div>
                <button type="button" onclick={() => openDetail(s.extId)}
                        class="mt-0.5 block w-full text-left leading-snug transition-colors hover:text-gold"
                        title="Phasen-Timeline &amp; Details anzeigen">{s.title}</button>
                {#if s.prNumber}
                  <a href={prUrl(s.prNumber)} target="_blank" rel="noopener noreferrer"
                     data-testid="floor-shipped-pr"
                     class="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-gold hover:text-dark">
                    <svg viewBox="0 0 16 16" class="h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>
                    PR #{s.prNumber}<span class="opacity-60">↗</span>
                  </a>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- ⑤ QS-Abnahme -->
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
    </div>

    <!-- ⑥ Detail-Panel (Slide-in) -->
    {#if selected}
      <div class="fixed inset-y-0 right-0 w-full max-w-md bg-dark-light border-l border-white/10 p-5 overflow-y-auto z-50" data-testid="floor-detail">
        <button onclick={closeDetail} class="float-right text-muted">✕</button>
        <h3 class="font-bold mb-3">{selected}</h3>
        {#if !detail}
          <p class="text-muted text-sm">Lädt…</p>
        {:else}
          <p class="mb-2">{detail.title}</p>
          <p class="text-muted text-sm mb-3">Status: {detail.status} · Priorität: {detail.priority} · Retries: {detail.retryCount}{#if detail.prNumber} · <a href={prUrl(detail.prNumber)} target="_blank" rel="noopener noreferrer" class="text-gold hover:underline">PR #{detail.prNumber} ↗</a>{/if}</p>
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

          <h4 class="font-semibold mt-4 mb-1">Injektionen</h4>
          {#if detail.injections.length}
            <ul class="space-y-1 text-sm mb-3" data-testid="inject-list">
              {#each detail.injections as inj (inj.id)}
                <li class="rounded bg-white/5 px-2 py-1">
                  <span class="font-mono text-xs">{inj.kind}{inj.phase ? `@${inj.phase}` : ''}</span>
                  {#if inj.title}<span class="font-semibold"> {inj.title}</span>{/if}
                  <span class="block text-xs">{inj.consumedAt ? `✓ konsumiert ${new Date(inj.consumedAt).toLocaleString('de-DE')}` : '⏳ offen'}</span>
                  {#if inj.content}<span class="block text-muted text-xs">{inj.content}</span>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-muted text-sm mb-3">Keine Injektionen.</p>
          {/if}

          <details class="mt-2" data-testid="inject-form">
            <summary class="cursor-pointer font-semibold text-sm">Injizieren</summary>
            <div class="mt-2 space-y-2">
              <select bind:value={injKind} class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-kind">
                <option value="context">context</option>
                <option value="note">note</option>
                <option value="asset">asset</option>
              </select>
              <select bind:value={injPhase} class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-phase">
                <option value="">nächste Grenze (NULL)</option>
                <option value="scout">scout</option><option value="design">design</option>
                <option value="plan">plan</option><option value="implement">implement</option>
                <option value="verify">verify</option><option value="deploy">deploy</option>
              </select>
              <input bind:value={injTitle} placeholder="Titel (optional)" class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-title" />
              <textarea bind:value={injContent} placeholder="Kontext / Notiz" rows="3" class="w-full rounded bg-white/10 px-2 py-1 text-sm" data-testid="inject-content"></textarea>
              {#if injError}<p class="text-red-400 text-xs">{injError}</p>{/if}
              <button onclick={submitInjection} disabled={injBusy} class="rounded bg-emerald-500/80 px-3 py-1 text-sm font-semibold disabled:opacity-50" data-testid="inject-submit">
                {injBusy ? 'sende…' : 'injizieren'}
              </button>
            </div>
          </details>
        {/if}
      </div>
    {/if}

    {#if qaModalItem}
      <QaModal
        item={qaModalItem}
        criteria={qaCriteria}
        on:close={() => { qaModalItem = null; }}
        on:submitted={() => { qaModalItem = null; refresh(); }}
      />
    {/if}
  {/if}
</div>
