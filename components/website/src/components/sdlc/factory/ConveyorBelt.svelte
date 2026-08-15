<script lang="ts">
  import { onMount } from 'svelte';
  import type { Phase, HallItem, ProviderConfigSummary } from '../../../lib/factory-floor-types.ts';
  import StationColumn from './StationColumn.svelte';
  import { floorStore, acquireFloor } from '../../../lib/stores/factory-floor-store.ts';
  import { onLeitstandSelectionChange, pushLeitstandSelection } from '../../../lib/sdlc/leitstand-url.ts';

  let {
    stations,
    hallItems,
    mobileColIndex,
    onSelect,
    activeConfigs = {},
    onOpenDrawerPhase,
    compact = false,
    selectedStation = null,
    onStationSelect,
    intakeCounts,
    ausgangCount,
  }: {
    stations: { key: Phase; label: string }[];
    hallItems: HallItem[];
    mobileColIndex: number;
    onSelect: (extId: string) => void;
    activeConfigs?: Record<string, ProviderConfigSummary | undefined>;
    onOpenDrawerPhase?: (phase: string) => void;
    compact?: boolean;
    selectedStation?: string | null;
    onStationSelect?: (key: string) => void;
    intakeCounts?: { triage: number | null; planung: number | null };
    ausgangCount?: number | null;
  } = $props();

  // Z3-Selbststaendigkeit (T007957/E3): im compact-Modus liest die Achse die
  // Zaehler und die aktuelle Station-Selektion selbst aus dem floorStore bzw.
  // leitstand-url.ts, statt sie von cockpit.astro durchgereicht zu bekommen --
  // noetig, weil Z3 unabhaengig vom Astro-Island fuer Z4 aktualisiert wird.
  let hall = $state<HallItem[]>([]);
  let officeWaiting = $state(0);
  let stagedWaiting = $state(0);
  let shippedCount = $state(0);
  let stationSel = $state<string | null>(selectedStation ?? null);

  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => {
      if (s.payload) {
        hall = s.payload.hall ?? [];
        officeWaiting = s.payload.officeWaiting ?? 0;
        stagedWaiting = s.payload.stagedWaiting ?? 0;
        shippedCount = s.payload.shipped?.length ?? 0;
      }
    });
    const offSel = onLeitstandSelectionChange((sel) => {
      stationSel = sel.station ?? null;
    });
    return () => {
      unsub();
      release();
      offSel();
    };
  });

  function itemsFor(phase: Phase): HallItem[] {
    return (compact ? hall : hallItems).filter((h) => h.phase === phase);
  }

  const mobileIndex: Record<string, number> = {
    scout: 2, design: 3, plan: 4, implement: 5, verify: 6, deploy: 7,
  };

  function isMobileVisible(phase: Phase): boolean {
    return mobileColIndex === (mobileIndex[phase] ?? -1);
  }

  function selectStation(key: string) {
    if (onStationSelect) {
      onStationSelect(key);
      return;
    }
    pushLeitstandSelection({ station: key });
  }
</script>

{#if compact}
  <div class="belt belt--compact" data-testid="leitstand-achse">
    <button
      type="button"
      class="capsule"
      class:capsule--selected={stationSel === 'triage'}
      onclick={() => selectStation('triage')}
    >
      <span class="capsule-node"></span>
      <span class="capsule-label">Triage</span>
      <span class="capsule-count">{intakeCounts?.triage ?? officeWaiting}</span>
    </button>
    <button
      type="button"
      class="capsule"
      class:capsule--selected={stationSel === 'planung'}
      onclick={() => selectStation('planung')}
    >
      <span class="capsule-node"></span>
      <span class="capsule-label">Planung</span>
      <span class="capsule-count">{intakeCounts?.planung ?? stagedWaiting}</span>
    </button>
    {#each stations as station, i (station.key)}
      <StationColumn
        {station}
        compact
        items={itemsFor(station.key)}
        selected={stationSel === station.key}
        isFirst={i === 0}
        onStationSelect={selectStation}
      />
    {/each}
    <button
      type="button"
      class="capsule"
      class:capsule--selected={stationSel === 'ship'}
      onclick={() => selectStation('ship')}
    >
      <span class="capsule-node"></span>
      <span class="capsule-label">Ship</span>
      <span class="capsule-count">{ausgangCount ?? shippedCount}</span>
    </button>
  </div>
{:else}
  <div class="belt">
    {#each stations as station, i (station.key)}
      <StationColumn
        {station}
        items={itemsFor(station.key)}
        mobileVisible={isMobileVisible(station.key)}
        isFirst={i === 0}
        {onSelect}
        activeConfig={activeConfigs[station.key]}
        onOpenDrawer={() => onOpenDrawerPhase?.(station.key)}
      />
    {/each}
  </div>
{/if}

<style>
  .belt {
    display: grid;
    grid-template-columns: repeat(6, minmax(168px, 1fr));
    gap: 14px;
    width: 100%;
    min-width: 1040px;
  }

  @media (max-width: 767px) {
    .belt { display: block; min-width: unset; }
  }

  /* ── Kompakte Achse (T007957/E3, Z3) ─────────────────────────────────── */
  .belt--compact {
    grid-template-columns: repeat(9, minmax(96px, 1fr));
    gap: var(--ls-space-4);
    min-width: 0;
    overflow-x: auto;
  }

  @media (max-width: 767px) {
    .belt--compact {
      display: grid; /* bleibt auf Mobil ein Grid, horizontal scrollbar */
      min-width: 0;
    }
  }

  .capsule {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ls-space-2);
    padding: var(--ls-space-4) var(--ls-space-2);
    background: var(--ls-surface-raised);
    border: 1px solid var(--ls-line);
    border-radius: var(--ls-radius-md);
    color: var(--ls-text-secondary);
    font-family: var(--ls-font-mono);
    font-size: 0.7rem;
    cursor: pointer;
    transition:
      border-color var(--ls-dur-fast) var(--ls-ease),
      background var(--ls-dur-fast) var(--ls-ease);
  }

  .capsule:hover {
    border-color: var(--ls-line-strong);
  }

  .capsule-node {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--ls-surface-raised);
    border: 1px solid var(--ls-line-strong);
  }

  .capsule-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .capsule-count {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ls-text-primary);
  }

  .capsule--selected {
    border-color: var(--ls-signal-info);
    background: var(--ls-signal-info-dim);
    color: var(--ls-text-primary);
  }

  .capsule--selected .capsule-node {
    background: var(--ls-signal-info);
    border-color: var(--ls-signal-info);
  }
</style>
