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
            on:reparent={(e) => onReparent?.(e.detail.ticketId, e.detail.newParentId)} />
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
  .product-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .product-header h3 { margin: 0; font-size: 1.05rem; }
  .pill { font-size: 0.8rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #2a2e37; }
  .warn { font-size: 0.8rem; color: #ef4444; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
  .empty { opacity: 0.6; font-size: 0.85rem; }
</style>
