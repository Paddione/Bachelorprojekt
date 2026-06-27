<script module lang="ts">
  import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
  import { PHASE_ORDER } from '../../lib/factory-floor-types';

  const linearLanes = PIPELINE_LANES.filter(l => !l.side && l.key !== 'planning');

  export const TABS = linearLanes.flatMap(l => {
    if (l.key === 'hall') {
      return PHASE_ORDER.map(p => ({
        key: p,
        label: p === 'implement' ? 'IMPL' : p.toUpperCase(),
      }));
    }
    const labelMap: Record<string, string> = {
      staged: 'STAGED',
      loadingDock: 'BACKLOG',
      qa: 'QS',
      awaitingDeploy: 'AWAITING',
      shipped: 'DONE'
    };
    const keyMap: Record<string, string> = {
      loadingDock: 'backlog',
      qa: 'qs',
      shipped: 'done'
    };
    return [{
      key: keyMap[l.key] || l.key,
      label: labelMap[l.key] || l.key.toUpperCase(),
    }];
  });

  export const MOBILE_COL_INDEX = Object.fromEntries(
    TABS.map((tab, idx) => [tab.key, idx])
  ) as Record<string, number>;
</script>

<script lang="ts">
  let {
    activeIndex,
    onSelect,
  }: {
    activeIndex: number;
    onSelect: (i: number) => void;
  } = $props();

  function handleSelect(i: number) {
    if ('vibrate' in navigator) navigator.vibrate(5);
    onSelect(i);
  }
</script>

<nav class="mobile-tab-bar">
  {#each TABS as tab, i}
    <button
      class="mobile-tab-bar__tab"
      class:active={i === activeIndex}
      onclick={() => handleSelect(i)}
      aria-label={`Station: ${tab.label}`}
      aria-pressed={i === activeIndex}
    >
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .mobile-tab-bar {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--factory-tab-bar-height);
    background: var(--factory-bg);
    border-top: 1px solid var(--factory-border);
    z-index: 100;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-tab-bar__tab {
    flex: 0 0 auto;
    min-width: 56px;
    min-height: 44px;
    height: 100%;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: var(--factory-text-muted);
    font-family: var(--factory-font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .mobile-tab-bar__tab:hover {
    color: var(--factory-text-secondary);
  }

  .mobile-tab-bar__tab.active {
    color: var(--factory-accent);
    background: var(--factory-surface);
    border-bottom: 2px solid var(--factory-accent);
  }

  @media (max-width: 767px) {
    .mobile-tab-bar {
      display: flex;
    }
  }
</style>
