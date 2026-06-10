<script lang="ts">
  import type { Phase, HallItem } from '../../lib/factory-floor';
  import StationColumn from './StationColumn.svelte';

  let {
    stations,
    hallItems,
    mobileColIndex,
    onSelect,
  }: {
    stations: { key: Phase; label: string }[];
    hallItems: HallItem[];
    mobileColIndex: number;
    onSelect: (extId: string) => void;
  } = $props();

  function itemsFor(phase: Phase): HallItem[] {
    return hallItems.filter((h) => h.phase === phase);
  }

  function isMobileVisible(station: Phase): boolean {
    const mobileIndex: Record<string, number> = {
      scout: 2, design: 3, plan: 4, implement: 5, verify: 6, deploy: 7,
    };
    return mobileColIndex === (mobileIndex[station] ?? -1);
  }
</script>

<div class="conveyor-belt">
  {#each stations as station, i (station.key)}
    {#if i > 0}
      <div class="conveyor-belt__link"></div>
    {/if}
    <StationColumn
      {station}
      items={itemsFor(station.key)}
      mobileVisible={isMobileVisible(station.key)}
      {onSelect}
    />
  {/each}
</div>

<style>
  .conveyor-belt {
    display: flex;
    align-items: stretch;
    gap: 0;
    width: 100%;
    position: relative;
  }

  .conveyor-belt__link {
    width: 32px;
    flex-shrink: 0;
    align-self: center;
    height: 4px;
    background:
      repeating-linear-gradient(
        90deg,
        var(--factory-conveyor-line) 0px,
        var(--factory-conveyor-line) 8px,
        transparent 8px,
        transparent 12px
      );
    position: relative;
  }

  .conveyor-belt__link::before,
  .conveyor-belt__link::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--factory-conveyor-line);
  }

  .conveyor-belt__link::before { top: -2px; }
  .conveyor-belt__link::after { bottom: -2px; }

  @media (max-width: 767px) {
    .conveyor-belt {
      display: none;
    }
  }
</style>
