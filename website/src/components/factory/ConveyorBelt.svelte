<script lang="ts">
  import type { Phase, HallItem, ProviderConfigSummary } from '../../lib/factory-floor-types';
  import StationColumn from './StationColumn.svelte';

  let {
    stations,
    hallItems,
    mobileColIndex,
    onSelect,
    activeConfigs = {},
    onOpenDrawerPhase,
  }: {
    stations: { key: Phase; label: string }[];
    hallItems: HallItem[];
    mobileColIndex: number;
    onSelect: (extId: string) => void;
    activeConfigs?: Record<string, ProviderConfigSummary | undefined>;
    onOpenDrawerPhase?: (phase: string) => void;
  } = $props();

  function itemsFor(phase: Phase): HallItem[] {
    return hallItems.filter((h) => h.phase === phase);
  }

  const mobileIndex: Record<string, number> = {
    scout: 2, design: 3, plan: 4, implement: 5, verify: 6, deploy: 7,
  };

  function isMobileVisible(phase: Phase): boolean {
    return mobileColIndex === (mobileIndex[phase] ?? -1);
  }
</script>

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
</style>
