<script lang="ts">
  interface Props {
    variant?: 'default' | 'flat' | 'interactive';
    padding?: boolean;
  }

  let {
    variant = 'default',
    padding = true,
    children,
    header,
    footer,
  }: Props & { children?: any; header?: any; footer?: any } = $props();
</script>

<div
  class="admin-card"
  class:admin-card--flat={variant === 'flat'}
  class:admin-card--interactive={variant === 'interactive'}
  class:admin-card--no-padding={!padding}
  role={variant === 'interactive' ? 'button' : undefined}
  tabindex={variant === 'interactive' ? 0 : undefined}
>
  {#if header}
    <div class="admin-card__header">
      {@render header()}
    </div>
  {/if}
  <div class="admin-card__body">
    {@render children?.()}
  </div>
  {#if footer}
    <div class="admin-card__footer">
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .admin-card {
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-card-radius);
    transition: border-color var(--admin-transition-fast), transform var(--admin-transition-fast);
  }

  .admin-card:not(.admin-card--no-padding) {
    padding: var(--admin-card-padding);
  }

  .admin-card--flat {
    background: transparent;
    border: none;
  }

  .admin-card--interactive {
    cursor: pointer;
  }

  .admin-card--interactive:hover {
    border-color: var(--admin-border-bright);
    transform: scale(1.002);
  }

  .admin-card--interactive:focus-visible {
    outline: 3px solid var(--admin-primary);
    outline-offset: 2px;
  }

  .admin-card__header {
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--admin-border);
    margin-bottom: var(--space-4);
  }

  .admin-card__footer {
    padding-top: var(--space-3);
    border-top: 1px solid var(--admin-border);
    margin-top: var(--space-4);
  }
</style>
