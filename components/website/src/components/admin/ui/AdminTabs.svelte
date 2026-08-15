<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    href?: string;
  }

  interface Props {
    tabs: Tab[];
    active: string;
    onselect?: (id: string) => void;
  }

  let {
    tabs = [],
    active = '',
    onselect,
  }: Props = $props();

  let tabRefs: HTMLElement[] = $state([]);
  let indicatorStyle = $state('');

  function updateIndicator(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    indicatorStyle = `left:${rect.left - parentRect.left}px;width:${rect.width}px`;
  }

  function handleKeydown(e: KeyboardEvent, index: number) {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else {
      return;
    }
    e.preventDefault();
    const el = tabRefs[nextIndex];
    if (el) {
      el.focus();
      updateIndicator(el);
      if (el instanceof HTMLAnchorElement) el.click();
    }
  }

  $effect(() => {
    const idx = tabs.findIndex(t => t.id === active);
    if (idx >= 0 && tabRefs[idx]) {
      updateIndicator(tabRefs[idx]);
    }
  });
</script>

<div class="tabs" role="tablist" aria-label="Tabs">
  <div class="tabs__indicator" style={indicatorStyle} aria-hidden="true"></div>
  {#each tabs as tab, i}
    {#if tab.href}
      <a
        bind:this={tabRefs[i]}
        href={tab.href}
        class="tabs__tab"
        class:tabs__tab--active={tab.id === active}
        role="tab"
        aria-selected={tab.id === active}
        tabindex={tab.id === active ? 0 : -1}
        onkeydown={(e) => handleKeydown(e, i)}
      >
        {tab.label}
      </a>
    {:else}
      <button
        bind:this={tabRefs[i]}
        class="tabs__tab"
        class:tabs__tab--active={tab.id === active}
        role="tab"
        aria-selected={tab.id === active}
        tabindex={tab.id === active ? 0 : -1}
        onkeydown={(e) => handleKeydown(e, i)}
        onclick={() => onselect?.(tab.id)}
      >
        {tab.label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0;
    position: relative;
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: var(--space-5);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tabs__tab {
    padding: var(--space-3) var(--space-4);
    font-size: var(--admin-text-sm);
    font-weight: 500;
    color: var(--admin-text-mute);
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    position: relative;
    transition: color var(--admin-transition-fast);
    white-space: nowrap;
  }

  .tabs__tab:hover {
    color: var(--admin-text);
  }

  .tabs__tab--active {
    color: var(--admin-primary);
    font-weight: 600;
  }

  .tabs__tab:focus-visible {
    outline: 3px solid var(--admin-primary);
    outline-offset: -3px;
    border-radius: 2px;
  }

  .tabs__indicator {
    position: absolute;
    bottom: -1px;
    height: 2px;
    background: var(--admin-primary);
    transition: left 0.2s ease, width 0.2s ease;
    border-radius: 1px;
  }

  @media (max-width: 767px) {
    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x proximity;
      flex-wrap: nowrap;
    }
    .tabs__tab {
      scroll-snap-align: start;
      white-space: nowrap;
    }
  }
</style>
