<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureNode } from '../../lib/tickets/cockpit-types';
  import type { Suggestion } from '../../lib/tickets/suggest-prompt';
  import SuggestionBar from './SuggestionBar.svelte';

  export let portfolio: PortfolioPayload;
  export let selectedFeature: string | null = null;
  export let onSelectFeature: (extId: string) => void;
  export let onFeatureAction: ((featureId: string, action: string, value?: boolean | string) => void) | undefined = undefined;
  export let onBatchFeatureAction: ((actions: { featureId: string; action: string; value?: boolean | string }[]) => void) | undefined = undefined;
  export let onMutated: (() => void) | undefined = undefined;

  let drawerOpen = false;
  let isRolling = false;
  // Last AI roll result — surfaced in the SuggestionBar so the model's
  // value/blocker reasoning + impact is visible instead of silently discarded.
  let suggestions: Suggestion[] = [];

  // Scaling controls for the 130+ feature list: search, active-only, per-product collapse.
  let filter = '';
  let activeOnly = true;
  let collapsed = new Set<string>();

  const LS_ACTIVE = 'cockpit:activeOnly';
  const LS_COLLAPSED = 'cockpit:collapsed';
  onMount(() => {
    try {
      const a = localStorage.getItem(LS_ACTIVE);
      if (a !== null) activeOnly = a === '1';
      const c = localStorage.getItem(LS_COLLAPSED);
      if (c) collapsed = new Set(JSON.parse(c) as string[]);
    } catch { /* localStorage unavailable — keep defaults */ }
  });
  function persistActive() {
    try { localStorage.setItem(LS_ACTIVE, activeOnly ? '1' : '0'); } catch { /* ignore */ }
  }
  function toggleCollapse(id: string) {
    const n = new Set(collapsed);
    if (n.has(id)) n.delete(id); else n.add(id);
    collapsed = n;
    try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...n])); } catch { /* ignore */ }
  }

  $: allFeatures = portfolio.products?.flatMap((p) => p.features) ?? [];
  $: q = filter.trim().toLowerCase();

  // Inline the filter so Svelte tracks q/activeOnly/selectedFeature as direct
  // dependencies of this reactive statement — it does NOT trace into helper functions.
  $: displayedProducts = (portfolio.products ?? [])
    .map((p) => ({
      ...p,
      features: p.features.filter((f: FeatureNode) => {
        const matchText = !q || f.title.toLowerCase().includes(q) || f.extId.toLowerCase().includes(q);
        const openWork = (f.rollup.open ?? 0) + (f.rollup.inProgress ?? 0) + (f.rollup.blocked ?? 0);
        // Always keep synthetic aggregate buckets (Alle Tickets / Ohne Feature)
        // and the selected feature visible even if there is no open work.
        const matchActive = !activeOnly || f.synthetic || openWork > 0 || f.extId === selectedFeature;
        return matchText && matchActive;
      }),
    }))
    .filter((p) => p.features.length > 0);
  $: totalShown = displayedProducts.reduce((n, p) => n + p.features.length, 0);

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
      const data = await res.json().catch(() => ({}));
      suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      onMutated?.();
    } catch { suggestions = []; /* errors surfaced via parent toast */ }
    finally { isRolling = false; }
  }

  async function handleApply() {
    const targets = allFeatures.filter(f => f.nextStep).map(f => ({ featureId: f.id, action: 'next_step' as const, value: true }));
    if (targets.length > 0) onBatchFeatureAction?.(targets);
  }

  async function handleReset() {
    const targets = allFeatures.filter(f => f.nextStep).map(f => ({ featureId: f.id, action: 'next_step' as const, value: false }));
    if (targets.length > 0) onBatchFeatureAction?.(targets);
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
  <div class="filters">
    <input
      class="feature-filter"
      data-testid="feature-filter"
      type="search"
      placeholder="Feature suchen…"
      bind:value={filter}
      aria-label="Features filtern"
    />
    <label class="active-toggle">
      <input type="checkbox" data-testid="feature-active-only"
        bind:checked={activeOnly} on:change={persistActive} />
      nur mit offener Arbeit
    </label>
  </div>

  <div class="feature-list">
    {#each displayedProducts as product (product.id)}
      <!-- Collapse is ignored while searching so matches always surface. -->
      {@const expanded = !(collapsed.has(product.id) && !q)}
      <div class="product">
        <button
          class="product-title"
          data-testid="product-toggle"
          aria-expanded={expanded}
          on:click={() => toggleCollapse(product.id)}
        >
          <span class="caret">{expanded ? '▾' : '▸'}</span>
          {product.title}
          <span class="product-count">{product.features.length}</span>
        </button>
        {#if expanded}
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
                {#if onFeatureAction && !f.synthetic}
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
          </ul>
        {/if}
      </div>
    {/each}
    {#if totalShown === 0}
      <p class="empty">Keine passenden Features</p>
    {/if}
  </div>

  <div class="sidebar-footer">
    <SuggestionBar
      features={allFeatures.filter((f) => !f.synthetic)}
      {suggestions}
      {isRolling}
      onroll={handleRoll}
      onapply={handleApply}
      onreset={handleReset}
    />
  </div>
</aside>

<style>
  .cockpit-sidebar {
    width: 240px;
    flex: 0 0 240px;
    border-right: 1px solid var(--admin-border, #2a2e37);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .filters {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid var(--admin-border, #2a2e37);
  }
  .feature-filter {
    width: 100%;
    background: var(--admin-bg, #1c1f26);
    border: 1px solid var(--admin-border, #2a2e37);
    color: inherit;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.82rem;
  }
  .active-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--admin-text-mute, #9ca3af);
    cursor: pointer;
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
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.4rem 0 0.2rem;
    padding: 0.2rem 0.4rem;
    background: none;
    border: none;
    color: var(--admin-text-mute, #9ca3af);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: left;
    cursor: pointer;
  }
  .product-title:hover { color: var(--admin-text, #e5e7eb); }
  .caret { font-size: 0.6rem; opacity: 0.7; }
  .product-count {
    margin-left: auto;
    background: var(--admin-bg, #1c1f26);
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.66rem;
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
  .empty { padding: 0.5rem; font-size: 0.8rem; opacity: 0.5; }

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
