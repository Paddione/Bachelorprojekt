<script lang="ts">
  type Window = '7d' | '30d' | 'all';

  let {
    value = '7d' as Window,
    onchange,
  }: {
    value?: Window;
    onchange?: (w: Window) => void;
  } = $props();
</script>

<div class="window-filter">
  <button class="win-btn" class:active={value === '7d'} onclick={() => onchange?.('7d')}>7 Tage</button>
  <button class="win-btn" class:active={value === '30d'} onclick={() => onchange?.('30d')}>30 Tage</button>
  <button class="win-btn" class:active={value === 'all'} onclick={() => onchange?.('all')}>Gesamt</button>
</div>

<style>
  .window-filter {
    display: flex;
    gap: 4px;
  }
  .win-btn {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--admin-border, #21262d);
    background: transparent;
    color: var(--admin-text-mute, #8c96a3);
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-sans, inherit);
  }
  .win-btn.active {
    background: oklch(0.80 0.09 75 / 0.14);
    color: oklch(0.80 0.09 75);
    border-color: oklch(0.80 0.09 75 / 0.3);
  }
</style>
