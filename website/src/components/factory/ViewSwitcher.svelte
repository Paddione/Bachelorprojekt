<script lang="ts">
  type View = 'full' | 'compact';

  let view = $state<View>('full');
  let mounted = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('factory-view');
    if (stored === 'compact' || stored === 'full') {
      view = stored;
    } else {
      const mq = window.matchMedia('(max-width: 768px)');
      view = mq.matches ? 'compact' : 'full';
    }
    mounted = true;
  });

  function toggle() {
    view = view === 'full' ? 'compact' : 'full';
    if (typeof window !== 'undefined') {
      localStorage.setItem('factory-view', view);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('viewchange', { detail: { view } }));
    }
  }
</script>

{#if mounted}
  <div class="view-switcher">
    <button
      class="view-switcher__btn"
      class:active={view === 'full'}
      onclick={toggle}
      aria-label="Switch to {view === 'full' ? 'compact' : 'full'} view"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
      Full
    </button>
    <button
      class="view-switcher__btn"
      class:active={view === 'compact'}
      onclick={toggle}
      aria-label="Switch to {view === 'compact' ? 'full' : 'compact'} view"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="1" y1="4" x2="15" y2="4" />
        <line x1="1" y1="8" x2="15" y2="8" />
        <line x1="1" y1="12" x2="15" y2="12" />
      </svg>
      Compact
    </button>
  </div>
{/if}

<style>
  .view-switcher {
    display: inline-flex;
    gap: 2px;
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-md);
    padding: 2px;
  }

  .view-switcher__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: var(--factory-radius-sm);
    background: transparent;
    color: var(--factory-text-muted);
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-xs);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .view-switcher__btn:hover {
    color: var(--factory-text-secondary);
  }

  .view-switcher__btn.active {
    background: var(--factory-surface-elevated);
    color: var(--factory-accent);
  }
</style>
