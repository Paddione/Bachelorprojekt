<script lang="ts">
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  export let portfolio: PortfolioPayload;
  export let selectedFeature: string | null = null;
  export let onSelectFeature: (extId: string) => void;

  let drawerOpen = false;

  function pick(extId: string) {
    onSelectFeature(extId);
    drawerOpen = false;
  }
</script>

<button
  class="hamburger"
  data-testid="sidebar-hamburger"
  aria-label="Navigation öffnen"
  aria-expanded={drawerOpen}
  on:click={() => (drawerOpen = !drawerOpen)}
>☰</button>

{#if drawerOpen}
  <div class="scrim" role="presentation" on:click={() => (drawerOpen = false)}></div>
{/if}

<aside
  class="cockpit-sidebar"
  class:drawer-open={drawerOpen}
  data-testid="cockpit-sidebar"
  aria-label="Feature-Navigation"
>
  {#each portfolio.products as product (product.id)}
    <div class="product">
      <h4 class="product-title">{product.title}</h4>
      <ul class="features">
        {#each product.features as f (f.id)}
          <li>
            <button
              class="feature"
              class:active={selectedFeature === f.extId}
              data-testid="sidebar-feature"
              on:click={() => pick(f.extId)}
            >
              <span class="feature-name">{f.title}</span>
              <span class="feature-count">{f.rollup.total} Tickets</span>
            </button>
          </li>
        {/each}
        {#if product.features.length === 0}
          <li class="empty">Keine Features</li>
        {/if}
      </ul>
    </div>
  {/each}
</aside>

<style>
  .cockpit-sidebar {
    width: 200px;
    flex: 0 0 200px;
    border-right: 1px solid var(--admin-border, #2a2e37);
    padding: 0.5rem 0.25rem;
    overflow-y: auto;
  }
  .product-title {
    margin: 0.75rem 0.5rem 0.25rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--admin-text-mute, #9ca3af);
  }
  .features { list-style: none; margin: 0; padding: 0; }
  .feature {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    color: var(--admin-text, #e5e7eb);
    cursor: pointer;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    font-size: 0.85rem;
    text-align: left;
  }
  .feature:hover { background: var(--admin-surface-hover, #1e2129); }
  .feature.active { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12); font-weight: 600; }
  .feature-count { font-size: 0.7rem; opacity: 0.7; white-space: nowrap; }
  .empty { padding: 0.35rem 0.5rem; font-size: 0.8rem; opacity: 0.5; }
  .hamburger {
    display: none;
    background: none;
    border: 1px solid var(--admin-border, #2a2e37);
    border-radius: 6px;
    color: inherit;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
  }
  .scrim { display: none; }

  @media (max-width: 767px) {
    .hamburger { display: inline-flex; }
    .cockpit-sidebar { display: none; }
    .cockpit-sidebar.drawer-open {
      display: block;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: min(280px, 80vw);
      z-index: 60;
      background: var(--admin-surface, #14171d);
    }
    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 55;
    }
  }
</style>
