<script lang="ts">
  import { onMount } from 'svelte';
  import { cockpitStore, selectFeature } from '../../lib/stores/cockpitStore';
  import SuggestionBar from '../admin/SuggestionBar.svelte';
  import type { PortfolioPayload, FeatureNode } from '../../lib/tickets/cockpit-types';
  import type { Suggestion } from '../../lib/tickets/suggest-prompt';

  let portfolio = $state<PortfolioPayload | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let filter = $state('');
  let activeOnly = $state(true);
  let collapsed = $state(new Set<string>());

  let isRolling = $state(false);
  let suggestions = $state<Suggestion[]>([]);

  const LS_ACTIVE = 'cockpit:activeOnly';
  const LS_COLLAPSED = 'cockpit:collapsed';

  onMount(() => {
    try {
      const a = localStorage.getItem(LS_ACTIVE);
      if (a !== null) activeOnly = a === '1';
      const c = localStorage.getItem(LS_COLLAPSED);
      if (c) collapsed = new Set(JSON.parse(c) as string[]);
    } catch { /* keep defaults */ }
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

  async function loadPortfolio() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/cockpit/portfolio');
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      portfolio = await res.json() as PortfolioPayload;
    } catch (e) {
      error = String((e as Error).message);
    } finally {
      loading = false;
    }
  }

  const selectedFeature = $derived($cockpitStore.selectedFeature);

  const q = $derived(filter.trim().toLowerCase());

  const displayedProducts = $derived(
    (portfolio?.products ?? [])
      .map((p) => ({
        ...p,
        features: p.features.filter((f: FeatureNode) => {
          const matchText = !q || f.title.toLowerCase().includes(q) || f.extId.toLowerCase().includes(q);
          const openWork = (f.rollup.open ?? 0) + (f.rollup.inProgress ?? 0) +
            (f.rollup.blocked ?? 0) + (f.rollup.awaitingDeploy ?? 0);
          const matchActive = !activeOnly || f.synthetic ||
            openWork > 0 || f.extId === selectedFeature;
          return matchText && matchActive;
        }),
      }))
      .filter((p) => p.features.length > 0)
  );

  const allFeatures = $derived(portfolio?.products?.flatMap((p) => p.features) ?? []);
  const totalShown = $derived(displayedProducts.reduce((n, p) => n + p.features.length, 0));

  function pickFeature(extId: string) {
    selectFeature(extId);
    if (window.location.pathname !== '/admin/cockpit') {
      window.location.href = `/admin/cockpit?feature=${encodeURIComponent(extId)}`;
    } else {
      window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId } }));
    }
  }

  async function featureAction(featureId: string, action: string, value?: boolean | string) {
    try {
      const res = await fetch('/api/admin/cockpit/feature-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId, action, value }),
      });
      if (!res.ok) throw new Error(`feature-action ${res.status}`);
      window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    } catch (e) {
      error = String((e as Error).message);
    }
  }

  async function batchFeatureAction(
    actions: { featureId: string; action: string; value?: boolean | string }[]
  ) {
    try {
      const res = await fetch('/api/admin/cockpit/feature-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      if (!res.ok) throw new Error(`feature-actions ${res.status}`);
      window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    } catch (e) {
      error = String((e as Error).message);
    }
  }

  async function handleRoll(detail: { provider: string; model: string }) {
    isRolling = true;
    try {
      const res = await fetch('/api/admin/cockpit/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: detail.provider, model: detail.model }),
      });
      if (!res.ok) throw new Error(`suggest ${res.status}`);
      const data = await res.json().catch(() => ({})) as { suggestions?: Suggestion[] };
      suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    } catch { suggestions = []; }
    finally { isRolling = false; }
  }

  async function handleApply() {
    const targets = allFeatures
      .filter((f) => f.nextStep)
      .map((f) => ({ featureId: f.id, action: 'next_step' as const, value: true }));
    if (targets.length > 0) await batchFeatureAction(targets);
  }

  async function handleReset() {
    const targets = allFeatures
      .filter((f) => f.nextStep)
      .map((f) => ({ featureId: f.id, action: 'next_step' as const, value: false }));
    if (targets.length > 0) await batchFeatureAction(targets);
  }

  $effect(() => {
    loadPortfolio();
    const onMutated = () => loadPortfolio();
    window.addEventListener('cockpit:portfolio-mutated', onMutated);
    return () => window.removeEventListener('cockpit:portfolio-mutated', onMutated);
  });
</script>

<div class="csv-root">
  {#if loading && !portfolio}
    <p class="csv-loading">Lädt …</p>
  {:else if error}
    <p class="csv-error">{error}</p>
  {:else if portfolio}
    <div class="csv-filters">
      <input
        class="csv-filter-input"
        data-testid="csv-filter"
        type="search"
        placeholder="Feature suchen…"
        bind:value={filter}
        aria-label="Features filtern"
      />
      <label class="csv-active-label">
        <input
          type="checkbox"
          data-testid="csv-active-only"
          bind:checked={activeOnly}
          onchange={persistActive}
        />
        nur mit offener Arbeit
      </label>
    </div>

    <div class="csv-list">
      {#each displayedProducts as product (product.id)}
        {@const isExpanded = !(collapsed.has(product.id) && !q)}
        <div class="csv-product">
          <button
            class="csv-product-title"
            data-testid="csv-product-toggle"
            aria-expanded={isExpanded}
            onclick={() => toggleCollapse(product.id)}
          >
            <span class="csv-caret">{isExpanded ? '▾' : '▸'}</span>
            {product.title}
            <span class="csv-product-count">{product.features.length}</span>
          </button>
          {#if isExpanded}
            <ul class="csv-features">
              {#each product.features as f (f.id)}
                <li
                  class="csv-feature-item"
                  class:csv-next-step={f.nextStep}
                  class:csv-discarded={f.discarded}
                  class:csv-major={f.majorFeature}
                >
                  <button
                    class="csv-feature-btn"
                    class:csv-active={selectedFeature === f.extId}
                    data-testid="csv-feature"
                    onclick={() => pickFeature(f.extId)}
                  >
                    <span class="csv-feature-name">{f.title}</span>
                    <span class="csv-feature-count">
                      {#if f.rollup.awaitingDeploy > 0}
                        <span class="csv-ad-warn" title="Wartet auf Deploy: {f.rollup.awaitingDeploy}">⚠</span>
                      {/if}
                      {f.rollup.done}/{f.rollup.total}
                    </span>
                  </button>
                  {#if !f.synthetic}
                    <div class="csv-action-overlay" role="group" aria-label="Feature-Aktionen">
                      <button
                        class="csv-action-btn"
                        class:csv-action-active={f.nextStep}
                        data-testid="csv-action-next"
                        title={f.nextStep ? 'Nächsten Schritt entfernen' : 'Als nächsten Schritt markieren'}
                        onclick={(e) => { e.stopPropagation(); featureAction(f.id, 'next_step', !f.nextStep); }}
                        aria-pressed={f.nextStep}
                      >▶</button>
                      <button
                        class="csv-action-btn"
                        class:csv-action-active={f.discarded}
                        data-testid="csv-action-discard"
                        title={f.discarded ? 'Verwerfen rückgängig' : 'Feature verwerfen'}
                        onclick={(e) => { e.stopPropagation(); featureAction(f.id, 'discard', !f.discarded); }}
                        aria-pressed={f.discarded}
                      >🗑</button>
                      <button
                        class="csv-action-btn"
                        class:csv-action-active={f.majorFeature}
                        data-testid="csv-action-major"
                        title={f.majorFeature ? 'Major-Flag entfernen' : 'Als Major-Feature markieren'}
                        onclick={(e) => { e.stopPropagation(); featureAction(f.id, 'major', !f.majorFeature); }}
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
        <p class="csv-empty">Keine passenden Features</p>
      {/if}
    </div>

    <div class="csv-footer">
      <SuggestionBar
        features={allFeatures.filter((f) => !f.synthetic)}
        {suggestions}
        {isRolling}
        onroll={handleRoll}
        onapply={handleApply}
        onreset={handleReset}
      />
    </div>
  {/if}
</div>

<style>
  .csv-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .csv-loading, .csv-error {
    padding: 1rem;
    font-size: 0.85rem;
  }
  .csv-error { color: #ef4444; }
  .csv-filters {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid var(--admin-border, #2a2e37);
  }
  .csv-filter-input {
    width: 100%;
    background: var(--admin-bg, #1c1f26);
    border: 1px solid var(--admin-border, #2a2e37);
    color: inherit;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.82rem;
  }
  .csv-active-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--admin-text-mute, #9ca3af);
    cursor: pointer;
  }
  .csv-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0.5rem 0.25rem;
  }
  .csv-product-title {
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
  .csv-product-title:hover { color: var(--admin-text, #e5e7eb); }
  .csv-caret { font-size: 0.6rem; opacity: 0.7; }
  .csv-product-count {
    margin-left: auto;
    background: var(--admin-bg, #1c1f26);
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.66rem;
  }
  .csv-features { list-style: none; margin: 0; padding: 0; }
  .csv-feature-item {
    position: relative;
    border-radius: 6px;
  }
  .csv-feature-item.csv-next-step { border-left: 3px solid #10b981; }
  .csv-feature-item.csv-discarded { opacity: 0.45; }
  .csv-feature-item.csv-discarded .csv-feature-name { text-decoration: line-through; }
  .csv-feature-item.csv-major { border: 1px solid #d97706; border-radius: 6px; }
  .csv-feature-item.csv-major.csv-next-step {
    border-left: 3px solid #10b981;
    border-top: 1px solid #d97706;
    border-right: 1px solid #d97706;
    border-bottom: 1px solid #d97706;
  }
  .csv-feature-btn {
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
  .csv-feature-btn:hover { background: var(--admin-surface-hover, #1e2129); }
  .csv-feature-btn.csv-active {
    background: var(--admin-primary, #818cf8);
    color: var(--admin-bg, #0b0d12);
    font-weight: 600;
  }
  .csv-feature-count { font-size: 0.7rem; opacity: 0.7; white-space: nowrap; }
  .csv-ad-warn { color: #f59e0b; margin-right: 2px; font-size: 0.65rem; }
  .csv-empty { padding: 0.5rem; font-size: 0.8rem; opacity: 0.5; }
  .csv-action-overlay {
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
  .csv-feature-item:hover .csv-action-overlay {
    opacity: 1;
    pointer-events: auto;
  }
  .csv-action-btn {
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
  .csv-action-btn:hover { background: #2a2e37; color: #e5e7eb; }
  .csv-action-btn.csv-action-active { color: #10b981; border-color: #10b981; }
  .csv-footer {
    flex: 0 0 auto;
    padding: 0.5rem;
    border-top: 1px solid var(--admin-border, #2a2e37);
  }
</style>
