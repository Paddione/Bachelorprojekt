<script lang="ts">
  import { icons } from '../../../layouts/admin-icons';

  interface Props {
    icon?: string;
    title: string;
    description?: string;
  }

  let {
    icon = '',
    title,
    description = '',
  }: Props = $props();

  const svg = $derived(icon && icons[icon] ? icons[icon] : '');
</script>

<div class="empty-state" role="status">
  {#if svg}
    <div class="empty-state__icon" aria-hidden="true">
      {@html svg}
    </div>
  {/if}
  <h3 class="empty-state__title">{title}</h3>
  {#if description}
    <p class="empty-state__description">{description}</p>
  {/if}
  <div class="empty-state__action">
    <slot name="action" />
  </div>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }

  .empty-state__icon {
    width: 48px;
    height: 48px;
    color: var(--admin-text-disabled);
    margin-bottom: var(--space-4);
  }

  .empty-state__title {
    font-family: var(--font-serif);
    font-size: var(--admin-text-lg);
    font-weight: 600;
    color: var(--admin-text);
    margin: 0 0 var(--space-2);
  }

  .empty-state__description {
    color: var(--admin-text-mute);
    font-size: var(--admin-text-sm);
    margin: 0 0 var(--space-4);
    max-width: 320px;
    line-height: 1.5;
  }

  .empty-state__action {
    margin-top: var(--space-2);
  }
</style>
