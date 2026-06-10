<script lang="ts">
  import type { Phase, HallItem } from '../../lib/factory-floor';
  import PilotLight from './PilotLight.svelte';
  import WorkpieceCard from './WorkpieceCard.svelte';

  let {
    station,
    items,
    mobileVisible = false,
    onSelect,
  }: {
    station: { key: Phase; label: string };
    items: HallItem[];
    mobileVisible?: boolean;
    onSelect: (extId: string) => void;
  } = $props();
</script>

<div
  class="station-column"
  class:mobile-visible={mobileVisible}
  data-col={station.key}
>
  <PilotLight spotlight active={items.length > 0}>
    <h3 class="station-column__label">{station.label}</h3>
  </PilotLight>
  <div class="station-column__cards">
    {#each items as item (item.extId)}
      <WorkpieceCard
        {item}
        onClick={() => onSelect(item.extId)}
      />
    {/each}
    {#if items.length === 0}
      <p class="station-column__empty">Leer</p>
    {/if}
  </div>
</div>

<style>
  .station-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--factory-spacing-sm);
    min-width: 180px;
    flex: 1;
    padding: var(--factory-spacing-md);
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-lg);
    min-height: 200px;
  }

  .station-column__label {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    font-weight: 600;
    color: var(--factory-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0;
    padding: var(--factory-spacing-xs) 0;
  }

  .station-column__cards {
    display: flex;
    flex-direction: column;
    gap: var(--factory-spacing-sm);
    width: 100%;
    align-items: center;
  }

  .station-column__empty {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    color: var(--factory-text-muted);
    margin: var(--factory-spacing-lg) 0;
  }

  @media (max-width: 767px) {
    .station-column {
      display: none;
    }
    .station-column.mobile-visible {
      display: flex;
      width: 100%;
      min-width: unset;
    }
  }
</style>
