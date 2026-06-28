<script lang="ts">
  import type { HallItem, LoadingDockItem } from '../lib/factory-floor-types';
  import { PHASE_ORDER } from '../lib/factory-floor-types';
  import type { Phase } from '../lib/factory-floor-types';
  import { MOBILE_COL_INDEX } from './factory/MobileTabBar.svelte';
  import ConveyorBelt from './factory/ConveyorBelt.svelte';
  import PhaseStepper from './factory/PhaseStepper.svelte';
  import CiBadge from './factory/CiBadge.svelte';
  import { minutesSince, ciIcon, prioDot, ticketUrl, openPR, assetFallback } from '../lib/factory-floor-client';
  import type { CiRollup } from '../lib/factory-ci';
  import { STUCK_MIN } from '../lib/factory-constants';

  const STATIONS: { key: Phase; label: string }[] =
    PHASE_ORDER.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));

  let {
    hall,
    loadingDock,
    floorView,
    mobileColIndex,
    ciByExt,
    onSelect,
  }: {
    hall: HallItem[];
    loadingDock: LoadingDockItem[];
    floorView: 'conveyor' | 'kanban';
    mobileColIndex: number;
    ciByExt: Record<string, CiRollup>;
    onSelect: (extId: string) => void;
  } = $props();
</script>

<div data-col="backlog" class:mobile-visible={mobileColIndex === 1} class="lg:w-1/5" data-testid="floor-loadingdock">
  <h3 class="font-semibold mb-2">Laderampe</h3>
  {#if loadingDock.length === 0}
    <p class="text-muted text-sm">Leer.</p>
  {:else}
    <ul class="space-y-1">
      {#each loadingDock as d (d.extId)}
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

{#if floorView === 'conveyor'}
  <div class="conveyor-wrapper w-full" data-testid="floor-hall">
    <ConveyorBelt
      stations={STATIONS}
      hallItems={hall}
      {mobileColIndex}
      {onSelect}
    />
  </div>
{:else}
  <div class="lg:w-2/5" data-testid="floor-hall">
    <h3 class="font-semibold mb-2">Halle</h3>
    {#if hall.length === 0}
      <p class="text-muted text-sm">Fabrik im Leerlauf.</p>
    {:else}
      <div class="grid grid-cols-6 gap-2">
        {#each STATIONS as st (st.key)}
          <div data-col={st.key} class:mobile-visible={mobileColIndex === MOBILE_COL_INDEX[st.key]} class="rounded-lg bg-white/5 p-2 min-h-24">
            <img src={`/factory/station-${st.key}.svg`} alt="" class="h-8 mx-auto mb-1" onerror={assetFallback} />
            <p class="text-center text-xs text-muted mb-1">{st.label}</p>
            {#each hall.filter((h) => h.phase === st.key) as w (w.extId)}
              <div class="mb-1">
                <button
                  onclick={() => onSelect(w.extId)}
                  data-testid="floor-workpiece"
                  data-driver={w.driver ?? 'factory'}
                  title={`${w.title}${w.driver === 'devflow' && w.prNumber ? ` · PR #${w.prNumber}` : ''}${w.blockReason ? ` · ⛔ ${w.blockReason}` : ''}${w.phaseSince ? ` · seit ${minutesSince(w.phaseSince)} Min. in ${w.phase}` : ''}`}
                  class="flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-xs transition-all"
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
                  {#if w.driver === 'devflow' && w.prNumber}
                    <CiBadge rollup={ciByExt[w.extId] ?? null} />
                  {/if}
                  {#if w.driver === 'devflow' && w.ciStatus}
                    <span role="button" tabindex="0" data-testid="floor-ci-badge"
                          title={`CI: ${w.ciStatus} — PR öffnen`}
                          onclick={(e) => { e.stopPropagation(); openPR(w.prNumber); }}
                          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openPR(w.prNumber); } }}>
                      {ciIcon(w.ciStatus)}
                    </span>
                  {/if}
                </button>
                <PhaseStepper segments={w.phaseProgress} />
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
