<script lang="ts">
  let {
    total = 8,
    filled = 0,
    colorFilled = 'var(--factory-success)',
    colorEmpty = 'var(--factory-border)',
  }: {
    total?: number;
    filled?: number;
    colorFilled?: string;
    colorEmpty?: string;
  } = $props();
</script>

<div class="segment-dots" style="--sd-color-filled: {colorFilled}; --sd-color-empty: {colorEmpty};">
  {#each Array(total) as _, i}
    <span
      class="segment-dots__dot"
      class:filled={i < filled}
    ></span>
  {/each}
</div>

<style>
  .segment-dots {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .segment-dots__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--sd-color-empty);
    transition: all 0.2s;
  }

  .segment-dots__dot.filled {
    background: var(--sd-color-filled);
    box-shadow: 0 0 6px var(--sd-color-filled);
  }
</style>
