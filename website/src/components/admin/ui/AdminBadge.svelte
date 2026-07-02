<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
    size?: 'sm' | 'md';
    dot?: boolean;
  }

  let {
    variant = 'neutral',
    size = 'md',
    dot = false,
    children,
  }: Props & { children?: Snippet } = $props();
</script>

<span
  class="badge badge--{variant} badge--{size}"
  class:badge--dot={dot}
  role="status"
>
  {#if dot}
    <span class="badge__dot" aria-hidden="true"></span>
  {/if}
  <span class="badge__text">
    {@render children?.()}
  </span>
</span>

<style>
  /* T001433 — variant mapping: warning→Brass, success→Sage, error→Danger, info→Brass.
     Resolved through the --admin-* alias layer (factory-tokens.css), not literals. */

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: 999px;
    font-weight: 600;
    white-space: nowrap;
    line-height: 1;
  }

  .badge--sm {
    padding: 2px 8px;
    font-size: 10px;
  }

  .badge--md {
    padding: 3px 10px;
    font-size: 11px;
  }

  .badge--success {
    background: color-mix(in srgb, var(--admin-success) 15%, transparent);
    color: var(--admin-success);
  }

  .badge--warning {
    background: color-mix(in srgb, var(--admin-warning) 15%, transparent);
    color: var(--admin-warning);
  }

  .badge--error {
    background: color-mix(in srgb, var(--admin-danger) 15%, transparent);
    color: var(--admin-danger);
  }

  .badge--info {
    background: color-mix(in srgb, var(--admin-info) 15%, transparent);
    color: var(--admin-info);
  }

  .badge--neutral {
    background: var(--admin-surface);
    color: var(--admin-text-mute);
  }

  .badge__dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .badge--success .badge__dot { background: var(--admin-success); }
  .badge--warning .badge__dot { background: var(--admin-warning); }
  .badge--error .badge__dot { background: var(--admin-danger); }
  .badge--info .badge__dot { background: var(--admin-info); }
  .badge--neutral .badge__dot { background: var(--admin-text-mute); }
</style>
