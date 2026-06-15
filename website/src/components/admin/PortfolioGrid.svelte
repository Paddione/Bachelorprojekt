<script lang="ts">
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  import FeatureCard from './FeatureCard.svelte';
  export let portfolio: PortfolioPayload;
  export let onSelectFeature: (extId: string) => void;
  export let onReparent: ((ticketId: string, newParentId: string) => void) | undefined = undefined;
</script>

<div class="portfolio" data-testid="portfolio-grid">
  {#each portfolio.products as product (product.id)}
    <section class="product-group">
      <header class="product-header">
        <h3>{product.title}</h3>
        <span class="pill">{product.rollup.pctDone}% ({product.rollup.done}/{product.rollup.total})</span>
        {#if product.rollup.blocked > 0}
          <span class="warn">⚠ {product.rollup.blocked} blockiert</span>
        {/if}
      </header>
      <div class="cards">
        {#each product.features as f (f.id)}
          <FeatureCard feature={f} onClick={() => onSelectFeature(f.extId)}
            onReparent={onReparent ? (d) => onReparent(d.ticketId, d.newParentId) : undefined} />
        {/each}
        {#if product.features.length === 0}
          <p class="empty">Keine Features</p>
        {/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .portfolio { display: flex; flex-direction: column; gap: 1.5rem; }
  .product-group { background: rgba(28,31,38,.4); border-radius: 10px; padding: 1rem; }
  .product-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .product-header h3 { margin: 0; font-size: 1.05rem; font-weight: 600; }
  .pill { font-size: 0.78rem; padding: 0.15rem 0.55rem; border-radius: 999px; background: #2a2e37;
    font-weight: 500; }
  .warn { font-size: 0.78rem; color: #f87171; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
  .empty { opacity: 0.5; font-size: 0.85rem; padding: 0.5rem 0; }
</style>
