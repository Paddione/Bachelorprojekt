<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title = '',
    children,
  }: {
    title?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="control-card">
  <div class="control-card__header">
    <h3 class="control-card__title">{title}</h3>
  </div>
  <div class="control-card__body">
    {@render children?.()}
  </div>
</div>

<style>
  .control-card {
    background: #1e2736;
    border: 2px solid var(--factory-border);
    border-radius: var(--factory-radius-lg);
    padding: 1.5rem;
    min-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .control-card__header {
    margin-bottom: 1rem;
  }

  .control-card__title {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    font-weight: 600;
    color: var(--factory-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .control-card__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }
</style>
