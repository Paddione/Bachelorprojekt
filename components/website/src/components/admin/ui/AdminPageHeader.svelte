<script lang="ts">
  interface Breadcrumb {
    label: string;
    href: string;
  }

  interface Props {
    title: string;
    description?: string;
    breadcrumbs?: Breadcrumb[];
  }

  let {
    title,
    description = '',
    breadcrumbs = [],
  }: Props = $props();
</script>

<header class="page-header">
  {#if breadcrumbs.length > 0}
    <nav class="page-header__breadcrumbs" aria-label="Breadcrumb">
      {#each breadcrumbs as crumb, i}
        {#if i > 0}
          <span class="page-header__breadcrumb-sep" aria-hidden="true">/</span>
        {/if}
        {#if crumb.href}
          <a href={crumb.href} class="page-header__breadcrumb-link">{crumb.label}</a>
        {:else}
          <span class="page-header__breadcrumb-current">{crumb.label}</span>
        {/if}
      {/each}
    </nav>
  {/if}

  <h1 class="page-header__title">{title}</h1>

  {#if description}
    <p class="page-header__description">{description}</p>
  {/if}

  <div class="page-header__actions">
    <slot name="actions" />
  </div>
</header>

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header__breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--admin-text-xs);
    color: var(--admin-text-disabled);
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  .page-header__breadcrumb-link {
    color: var(--admin-text-mute);
    text-decoration: none;
    transition: color var(--admin-transition-fast);
  }

  .page-header__breadcrumb-link:hover {
    color: var(--admin-primary);
  }

  .page-header__breadcrumb-sep {
    color: var(--admin-text-disabled);
  }

  .page-header__breadcrumb-current {
    color: var(--admin-text-disabled);
  }

  .page-header__title {
    font-family: var(--font-serif);
    font-size: 2rem;
    font-weight: 700;
    color: var(--admin-text);
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-2);
    line-height: 1.2;
  }

  .page-header__description {
    color: var(--admin-text-mute);
    font-size: var(--admin-text-md);
    margin: 0 0 var(--space-4);
    line-height: 1.6;
  }

  .page-header__actions {
    margin-top: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  @media (max-width: 767px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .page-header__actions {
      width: 100%;
    }
  }
</style>
