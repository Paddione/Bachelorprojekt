<script lang="ts">
  import ControlCard from './ControlCard.svelte';

  let {
    value = 180000,
    onchange,
  }: {
    value?: number;
    onchange?: (value: number) => void;
  } = $props();

  function handleInput(e: Event) {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(v)) onchange?.(v);
  }
</script>

<ControlCard title="Context Budget">
  <input type="range" min="0" max="180000" step="5000" value={value} oninput={handleInput} class="budget-slider" />
  <div class="budget-value">{value.toLocaleString()} tokens</div>
</ControlCard>

<style>
  .budget-slider {
    width: 100%;
    accent-color: var(--admin-primary, #818cf8);
  }
  .budget-value {
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text, 0.875rem);
    color: var(--admin-text, #e6edf3);
  }
</style>
