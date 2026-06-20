<script lang="ts">
  let {
    open = false,
    onToggle = () => {}
  }: {
    open?: boolean;
    onToggle?: () => void;
  } = $props();

  function handleClick() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cockpit:toggle-sidekick', {
        detail: { source: 'cockpit' }
      }));
    }
    onToggle();
  }
</script>

<button
  class="mobile-toggle"
  type="button"
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
  onclick={handleClick}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" aria-hidden="true">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
</button>

<style>
  .mobile-toggle {
    min-height: 48px;
    min-width: 48px;
    display: none;
    align-items: center;
    justify-content: center;
    background: var(--admin-surface, #14171d);
    border: 1px solid var(--admin-border, #2a2e37);
    border-radius: 8px;
    cursor: pointer;
    color: var(--admin-text, #e5e7eb);
    padding: 0;
  }
</style>
