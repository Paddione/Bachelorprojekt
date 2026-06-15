<script lang="ts">
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  import SuggestionBar from './SuggestionBar.svelte';

  export let portfolio: PortfolioPayload;
  export let selectedFeature: string | null = null;
  export let onSelectFeature: (extId: string) => void;
  export let onFeatureAction: ((featureId: string, action: string, value?: boolean | string) => void) | undefined = undefined;
  export let onMutated: (() => void) | undefined = undefined;

  let drawerOpen = false;
  let isRolling = false;

  $: allFeatures = portfolio.products.flatMap((p) => p.features);

  function pick(extId: string) {
    onSelectFeature(extId);
    drawerOpen = false;
  }

  async function handleRoll(detail: { provider: string; model: string }) {
    isRolling = true;
    try {
      const res = await fetch('/api/admin/cockpit/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: detail.provider, model: detail.model }),
      });
      if (!res.ok) throw new Error(`suggest ${res.status}`);
      onMutated?.();
    } catch { /* errors surfaced via parent toast */ }
    finally { isRolling = false; }
  }

  async function handleApply() {
    for (const f of allFeatures.filter(f => f.nextStep)) onFeatureAction?.(f.id, 'next_step', true);
    onMutated?.();
  }

  async function handleReset() {
    for (const f of allFeatures.filter(f => f.nextStep)) onFeatureAction?.(f.id, 'next_step', false);
    onMutated?.();
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
  <div class="feature-list">
    {#each portfolio.products as product (product.id)}
      <div class="product">
        <h4 class="product-title">{product.title}</h4>
        <ul class="features">
          {#each product.features as f (f.id)}
            <li class="feature-item"
              class:next-step={f.nextStep}
              class:discarded={f.discarded}
              class:major={f.majorFeature}
            >
              <button
                class="feature"
                class:active={selectedFeature === f.extId}
                data-testid="sidebar-feature"
                on:click={() => pick(f.extId)}
              >
                <span class="feature-name">{f.title}</span>
                <span class="feature-count">{f.rollup.total} Tickets</span>
              </button>
              {#if onFeatureAction}
                <div class="action-overlay" role="group" aria-label="Feature-Aktionen">
                  <button
                    class="action-btn next-btn"
                    class:active={f.nextStep}
                    title={f.nextStep ? 'Nächster Schritt entfernen' : 'Als nächsten Schritt markieren'}
                    on:click|stopPropagation={() => onFeatureAction(f.id, 'next_step', !f.nextStep)}
                    aria-pressed={f.nextStep}
                  >▶</button>
                  <button
                    class="action-btn discard-btn"
                    class:active={f.discarded}
                    title={f.discarded ? 'Verwerfen rückgängig' : 'Feature verwerfen'}
                    on:click|stopPropagation={() => onFeatureAction(f.id, 'discard', !f.discarded)}
                    aria-pressed={f.discarded}
                  >🗑</button>
                  <button
                    class="action-btn major-btn"
                    class:active={f.majorFeature}
                    title={f.majorFeature ? 'Major-Flag entfernen' : 'Als Major-Feature markieren'}
                    on:click|stopPropagation={() => onFeatureAction(f.id, 'major', !f.majorFeature)}
                    aria-pressed={f.majorFeature}
                  >★</button>
                </div>
              {/if}
            </li>
          {/each}
          {#if product.features.length === 0}
            <li class="empty">Keine Features</li>
          {/if}
        </ul>
      </div>
    {/each}
  </div>

  <div class="sidebar-footer">
    <SuggestionBar
      features={allFeatures}
      {isRolling}
      onroll={handleRoll}
      onapply={handleApply}
      onreset={handleReset}
    />
  </div>
</aside>

<style>
  .cockpit-sidebar {
    width: 220px;
    flex: 0 0 220px;
    border-right: 1px solid var(--admin-border, #2a2e37);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .feature-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0.5rem 0.25rem;
  }
  .sidebar-footer {
    flex: 0 0 auto;
    padding: 0.5rem;
    border-top: 1px solid var(--admin-border, #2a2e37);
  }
  .product-title {
    margin: 0.75rem 0.5rem 0.25rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--admin-text-mute, #9ca3af);
  }
  .features { list-style: none; margin: 0; padding: 0; }

  .feature-item {
    position: relative;
    border-radius: 6px;
  }
  .feature-item.next-step { border-left: 3px solid #10b981; }
  .feature-item.discarded { opacity: 0.45; }
  .feature-item.discarded .feature-name { text-decoration: line-through; }
  .feature-item.major { border: 1px solid #d97706; border-radius: 6px; }
  .feature-item.major.next-step {
    border-left: 3px solid #10b981;
    border-top: 1px solid #d97706;
    border-right: 1px solid #d97706;
    border-bottom: 1px solid #d97706;
  }

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

  .action-overlay {
    position: absolute;
    top: 50%;
    right: 0.25rem;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s ease;
    pointer-events: none;
  }
  .feature-item:hover .action-overlay {
    opacity: 1;
    pointer-events: auto;
  }
  .action-btn {
    padding: 0.1rem 0.25rem;
    border-radius: 4px;
    border: 1px solid transparent;
    background: rgba(14, 16, 20, 0.85);
    color: #9ca3af;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1.4;
    transition: all 0.1s ease;
  }
  .action-btn:hover { background: #2a2e37; color: #e5e7eb; }
  .next-btn.active { color: #10b981; border-color: #10b981; }
  .discard-btn.active { color: #ef4444; border-color: #ef4444; }
  .major-btn.active { color: #f59e0b; border-color: #d97706; }

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
    .cockpit-sidebar { display: none; width: auto; flex: none; }
    .cockpit-sidebar.drawer-open {
      display: flex;
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
