---
title: Cockpit-Sidebar → Globaler PortalSidekick — Implementierungsplan
ticket_id: T000953
domains: [website, infra, db]
status: completed
pr_number: 1887
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cockpit-Sidebar → Globaler PortalSidekick — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die `CockpitSidebar.svelte` aus dem `/admin/cockpit`-Layout entfernen, ihre Funktionalität als neue `'cockpit'`-View in den globalen `PortalSidekick` integrieren, und Item 04 im Sidekick-Menü von einem `href`-Link auf echte View-Navigation umstellen.

**Architecture:** Eine neue Svelte-5-Runes-Komponente `CockpitSidekickView.svelte` übernimmt eigenes Datenfetching, Filter/Collapse/LocalStorage-Logik und Feature-Aktionen. Kommunikation mit `Cockpit.svelte` erfolgt über den bestehenden `cockpitStore` + zwei Custom Window Events (`cockpit:feature-selected`, `cockpit:portfolio-mutated`). `Cockpit.svelte` verliert die Sidebar und lauscht stattdessen auf diese Events, um `loadFeature()` / `loadPortfolio()` auszulösen.

**Tech Stack:** Svelte 5 (Runes: `$state`, `$derived`, `$effect`, `$props`), TypeScript, Vitest + `@testing-library/svelte`, bestehende `cockpitStore.ts`-API.

## Global Constraints

- Svelte 5 Runes-Syntax in allen neuen/geänderten `.svelte`-Dateien im `assistant/`-Verzeichnis (kein `$:`, kein `on:event`, kein `export let` — stattdessen `$props()`, `$state()`, `$derived()`, `$effect()`, `onclick=`, `onchange=`).
- `Cockpit.svelte` verwendet noch Svelte 4 Syntax (`$:`, `on:click`, `export let`) — diese Datei NICHT auf Runes migrieren; nur minimal chirurgisch ändern.
- `SuggestionBar.svelte` verwendet Svelte 4 Syntax — nicht migrieren; nur importieren und als Slot nutzen.
- Keine Brand-Domain-Literale (`*.mentolder.de`, `*.korczewski.de`) in Code-Snippets.
- LocalStorage-Schlüssel exakt wie in `CockpitSidebar.svelte`: `cockpit:activeOnly`, `cockpit:collapsed`.
- S1-Budgets: alle betroffenen Dateien sind nicht gebaselined → wirksame Schwelle = statisches Extension-Limit (`.svelte` = 500 lt. gates.yaml — ACHTUNG: 500, nicht 600 — gegenüber Tabelle in der Referenz: `.svelte` zählt 500).

> **Budget-Anmerkung:** `.svelte`-Dateien haben laut `gates.yaml` Limit 500 Zeilen (steht in der `s1.limits`-Tabelle in `plan-quality-gates.md`). Alle betroffenen Dateien sind nicht gebaselined. Aktuelle Stände:
> - `PortalSidekick.svelte`: 429 Zeilen → Budget ca. +71, Ziel: max. +10 Netto
> - `SidekickHome.svelte`: 354 Zeilen → Budget ca. +146, Ziel: ca. +4 Netto
> - `Cockpit.svelte`: 167 Zeilen → Budget ca. +333, Ziel: ca. −10 (schrumpft)
> - `CockpitSidekickView.svelte` (neu): 0 Zeilen → Limit 500, Ziel: ca. 280–340 Zeilen
> - `CockpitSidebar.svelte`: wird gelöscht → kein Budget-Thema

---

## File Structure

| Datei | Aktion | Verantwortlichkeit nach Änderung |
|-------|--------|----------------------------------|
| `website/src/components/assistant/CockpitSidekickView.svelte` | ERSTELLEN | Feature-Liste, Filter/Collapse, Feature-Aktionen, SuggestionBar, eigenes Fetching |
| `website/src/components/PortalSidekick.svelte` | ÄNDERN | `'cockpit'` in `type View`, titleMap, Render-Branch, Import |
| `website/src/components/assistant/SidekickHome.svelte` | ÄNDERN | Item 04: `id:'cockpit'`, kein `href`, Typ erweitern |
| `website/src/lib/assistant/sidekick-nudge.ts` | ÄNDERN | `'cockpit'` zu `SidekickView`-Union + `KNOWN_VIEWS` |
| `website/src/components/admin/Cockpit.svelte` | ÄNDERN | CockpitSidebar entfernen, Window-Event-Listener, Layout vereinfachen |
| `website/src/components/admin/CockpitSidebar.svelte` | LÖSCHEN | — |
| `website/src/components/admin/CockpitSidebar.test.ts` | LÖSCHEN | — |
| `website/src/components/admin/CockpitShell.integration.test.ts` | ÄNDERN | Sidebar-abhängige Tests entfernen, Event-Bridge testen |

---

### Task 1: `CockpitSidekickView.svelte` erstellen (rot → grün)

**Files:**
- Create: `website/src/components/assistant/CockpitSidekickView.svelte`
- Create: `website/src/components/assistant/CockpitSidekickView.test.ts`

**Interfaces:**
- Consumes: `cockpitStore`, `selectFeature` aus `../../lib/stores/cockpitStore`
- Consumes: `SuggestionBar` aus `../admin/SuggestionBar.svelte`
- Consumes: `PortfolioPayload`, `FeatureNode`, `ProductNode` aus `../../lib/tickets/cockpit-types`
- Consumes: `Suggestion` aus `../../lib/tickets/suggest-prompt`
- Produces: dispatcht `cockpit:feature-selected` (detail: `{ extId: string }`) und `cockpit:portfolio-mutated` (kein detail) auf `window`

- [ ] **Step 1: Testdatei anlegen (red)**

Erstelle `website/src/components/assistant/CockpitSidekickView.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CockpitSidekickView from './CockpitSidekickView.svelte';
import { selectFeature } from '../../lib/stores/cockpitStore';

const portfolio = {
  products: [{
    id: 'p1', extId: 'p1', title: 'Produkt Alpha',
    rollup: { total: 4, done: 0, blocked: 0, inProgress: 1, awaitingDeploy: 0, open: 3, pctDone: 0 },
    features: [
      { id: 'f1', extId: 'F-AUTH', title: 'Auth', priority: 'hoch', health: 'amber' as const,
        rollup: { total: 4, done: 0, blocked: 0, inProgress: 1, awaitingDeploy: 0, open: 3, pctDone: 0 },
        nextStep: false, discarded: false, majorFeature: false, synthetic: false },
      { id: 'f2', extId: 'F-CRM', title: 'CRM', priority: 'mittel', health: 'green' as const,
        rollup: { total: 2, done: 2, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 0, pctDone: 100 },
        nextStep: false, discarded: false, majorFeature: false, synthetic: false },
    ],
  }],
};

beforeEach(() => {
  selectFeature(null);
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/admin/cockpit/portfolio')) {
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('CockpitSidekickView', () => {
  it('rendert Produkt-Überschrift und Feature-Zeilen nach Fetch', async () => {
    const { findByText, getAllByTestId } = render(CockpitSidekickView);
    expect(await findByText('Produkt Alpha')).toBeTruthy();
    const feats = getAllByTestId('csv-feature');
    expect(feats).toHaveLength(2);
  });

  it('zeigt nur Features mit offener Arbeit wenn activeOnly=true (Standard)', async () => {
    const { findByText, queryByText } = render(CockpitSidekickView);
    await findByText('Auth');
    // CRM hat open=0, pctDone=100 — sollte ausgeblendet sein
    expect(queryByText('CRM')).toBeNull();
  });

  it('zeigt alle Features wenn activeOnly=false', async () => {
    const { findByText, getByTestId } = render(CockpitSidekickView);
    await findByText('Auth');
    await fireEvent.click(getByTestId('csv-active-only'));
    expect(await findByText('CRM')).toBeTruthy();
  });

  it('filtert Features per Suchfeld', async () => {
    const { findByText, getByTestId, queryByText } = render(CockpitSidekickView);
    await findByText('Auth');
    await fireEvent.click(getByTestId('csv-active-only')); // alle zeigen
    await waitFor(() => expect(queryByText('CRM')).toBeTruthy());
    await fireEvent.input(getByTestId('csv-filter'), { target: { value: 'Auth' } });
    expect(queryByText('CRM')).toBeNull();
  });

  it('dispatcht cockpit:feature-selected wenn Feature angeklickt (auf /admin/cockpit)', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/admin/cockpit', href: 'http://localhost/admin/cockpit' },
      writable: true,
    });
    const events: CustomEvent[] = [];
    window.addEventListener('cockpit:feature-selected', (e) => events.push(e as CustomEvent));
    const { findByText } = render(CockpitSidekickView);
    await fireEvent.click(await findByText('Auth'));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].detail.extId).toBe('F-AUTH');
    window.removeEventListener('cockpit:feature-selected', (e) => events.push(e as CustomEvent));
  });

  it('dispatcht cockpit:portfolio-mutated nach Feature-Aktion', async () => {
    const mutatedEvents: Event[] = [];
    window.addEventListener('cockpit:portfolio-mutated', (e) => mutatedEvents.push(e));
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (String(url).includes('feature-action') && opts?.method === 'POST') {
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));
    const { findAllByTestId } = render(CockpitSidekickView);
    // Warten bis Actions sichtbar (activeOnly aus — Feature mit nextStep=false)
    const nextBtns = await findAllByTestId('csv-action-next');
    await fireEvent.click(nextBtns[0]);
    await waitFor(() => expect(mutatedEvents.length).toBeGreaterThan(0));
    window.removeEventListener('cockpit:portfolio-mutated', (e) => mutatedEvents.push(e));
  });

  it('collapsed state persistiert in localStorage', async () => {
    const { findByTestId } = render(CockpitSidekickView);
    const toggle = await findByTestId('csv-product-toggle');
    await fireEvent.click(toggle);
    const raw = localStorage.getItem('cockpit:collapsed');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as string[];
    expect(parsed).toContain('p1');
  });

  it('activeOnly persistiert in localStorage', async () => {
    const { findByTestId } = render(CockpitSidekickView);
    await findByTestId('csv-active-only');
    await fireEvent.click(await findByTestId('csv-active-only'));
    expect(localStorage.getItem('cockpit:activeOnly')).toBe('0');
  });

  it('refetcht Portfolio bei cockpit:portfolio-mutated Event', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/admin/cockpit/portfolio')) callCount++;
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));
    const { findByText } = render(CockpitSidekickView);
    await findByText('Produkt Alpha');
    const before = callCount;
    window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    await waitFor(() => expect(callCount).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 2: Test ausführen — muss FAIL sein**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/components/assistant/CockpitSidekickView.test.ts 2>&1 | tail -20
```

Expected: FAIL (Modul nicht gefunden / nicht definiert — verify test fails before implementation).

- [ ] **Step 3: `CockpitSidekickView.svelte` implementieren**

Erstelle `website/src/components/assistant/CockpitSidekickView.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { cockpitStore, selectFeature } from '../../lib/stores/cockpitStore';
  import SuggestionBar from '../admin/SuggestionBar.svelte';
  import type { PortfolioPayload, FeatureNode } from '../../lib/tickets/cockpit-types';
  import type { Suggestion } from '../../lib/tickets/suggest-prompt';

  // ── State ──────────────────────────────────────────────────────────────────
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

  // ── LocalStorage hydration ─────────────────────────────────────────────────
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

  // ── Data fetching ──────────────────────────────────────────────────────────
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

  // ── Derived: filtered product/feature tree ─────────────────────────────────
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

  // ── Feature selection ──────────────────────────────────────────────────────
  function pickFeature(extId: string) {
    selectFeature(extId);
    if (window.location.pathname !== '/admin/cockpit') {
      window.location.href = `/admin/cockpit?feature=${encodeURIComponent(extId)}`;
    } else {
      window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId } }));
    }
  }

  // ── Feature actions ────────────────────────────────────────────────────────
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

  // ── SuggestionBar handlers ─────────────────────────────────────────────────
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

  // ── Effects ────────────────────────────────────────────────────────────────
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
                        title={f.nextStep ? 'Nächster Schritt entfernen' : 'Als nächsten Schritt markieren'}
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
    background: var(--admin-primary, #6ea8fe);
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
```

- [ ] **Step 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/components/assistant/CockpitSidekickView.test.ts 2>&1 | tail -30
```

Erwartetes Ergebnis: alle Tests `PASS`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-cockpit-sidekick-global
git add website/src/components/assistant/CockpitSidekickView.svelte \
        website/src/components/assistant/CockpitSidekickView.test.ts
git commit -m "feat(cockpit-sidekick): add CockpitSidekickView component [T000953]"
```

---

### Task 2: `sidekick-nudge.ts` um `'cockpit'` erweitern (rot → grün)

**Files:**
- Modify: `website/src/lib/assistant/sidekick-nudge.ts`

**Interfaces:**
- Produces: `SidekickView` Typ enthält `'cockpit'`; `KNOWN_VIEWS` kennt `'cockpit'`

- [ ] **Step 1: Bestehenden Test prüfen**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/lib/assistant/sidekick-nudge.test.ts 2>&1 | tail -10
```

Erwartetes Ergebnis: alle Tests `PASS` (Baseline vor Änderung).

- [ ] **Step 2: `sidekick-nudge.ts` anpassen**

Datei: `website/src/lib/assistant/sidekick-nudge.ts`, Zeilen 6–11:

```typescript
export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'pipeline' | 'agent-guide' | 'cockpit';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'tickets', 'inbox', 'pipeline', 'agent-guide', 'cockpit',
]);
```

- [ ] **Step 3: Test nach Änderung ausführen**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/lib/assistant/sidekick-nudge.test.ts 2>&1 | tail -10
```

Erwartetes Ergebnis: alle Tests `PASS`.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-cockpit-sidekick-global
git add website/src/lib/assistant/sidekick-nudge.ts
git commit -m "feat(cockpit-sidekick): add 'cockpit' to SidekickView union [T000953]"
```

---

### Task 3: `PortalSidekick.svelte` und `SidekickHome.svelte` verdrahten

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte`
- Modify: `website/src/components/assistant/SidekickHome.svelte`

**Interfaces:**
- Consumes: `CockpitSidekickView` aus `./assistant/CockpitSidekickView.svelte`
- Item 04 in `SidekickHome` hat keine `href` mehr und navigiert zur `'cockpit'`-View

Wichtig: `SidekickHome.svelte` hat Zeile 41 mit Item-id `'projekttickets'` und `href: '/admin/tickets'`. Dieses Item wird komplett ersetzt durch `id: 'cockpit'`, kein `href`, `sub: 'Container & Features'`. Die `type View` Definition in `SidekickHome.svelte` (Zeile 4) enthält `'projekttickets'` nicht — das ist kein echtes View-Ziel, sondern ein `href`-Link-Item. Da nun `id: 'cockpit'` ein echtes View-Item wird, muss die lokale `View`-Type um `'cockpit'` ergänzt werden.

- [ ] **Step 1: `PortalSidekick.svelte` ändern**

Zeile 17: `type View` ergänzen:
```typescript
type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'pipeline' | 'agent-guide' | 'mediaviewer' | 'grilling' | 'cockpit';
```

Nach Zeile 12 (letzte bestehende import-Zeile in der Gruppe der View-Imports) einfügen:
```typescript
  import CockpitSidekickView from './assistant/CockpitSidekickView.svelte';
```

`titleMap` (Zeile 68 ff.) um `cockpit` ergänzen — nach `grilling`:
```typescript
    cockpit: 'Projekt-Cockpit',
```

In `drawer-body` (nach dem `{:else if view === 'grilling'}` Block, vor `{/if}`):
```svelte
    {:else if view === 'cockpit'}
      <CockpitSidekickView />
```

- [ ] **Step 2: `SidekickHome.svelte` ändern**

Zeile 4: lokale `type View` ergänzen (füge `'cockpit'` hinzu — ersetzt das bisherige Fallback-Pattern):
```typescript
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'pipeline' | 'agent-guide' | 'mediaviewer' | 'grilling' | 'cockpit';
```

Zeile 41: Item-Eintrag für `'projekttickets'` ersetzen durch:
```typescript
    { id: 'cockpit',       no: '04', title: 'Projekttickets', sub: 'Container & Features', badge: pendingContainerCount > 0 ? pendingContainerCount : undefined, show: isAdmin },
```

(Das bisherige Item hatte `href: '/admin/tickets'` und `id: 'projekttickets'` — beide entfernen, `id` auf `'cockpit'` setzen, `href` weglassen. Die bestehende `{#if item.href}...<a>...{:else}...<button>...{/if}`-Verzweigung bleibt unverändert; da kein `href` vorhanden, rendert das Item automatisch als `<button>` der `onNavigate(item.id)` aufruft.)

- [ ] **Step 3: TypeScript-Kompilierung prüfen**

```bash
cd /tmp/wt-cockpit-sidekick-global/website
npx tsc --noEmit 2>&1 | head -30
```

Erwartetes Ergebnis: keine Fehler (oder nur Pre-existierende Fehler aus anderen Dateien).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-cockpit-sidekick-global
git add website/src/components/PortalSidekick.svelte \
        website/src/components/assistant/SidekickHome.svelte
git commit -m "feat(cockpit-sidekick): wire CockpitSidekickView into PortalSidekick + SidekickHome item 04 [T000953]"
```

---

### Task 4: `Cockpit.svelte` bereinigen und Event-Bridge verdrahten

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte`
- Modify: `website/src/components/admin/CockpitShell.integration.test.ts`

**Interfaces:**
- `Cockpit.svelte` reagiert auf `cockpit:feature-selected` → `loadFeature(e.detail.extId)`
- `Cockpit.svelte` reagiert auf `cockpit:portfolio-mutated` → `loadPortfolio()`
- Die `<div class="layout">` schrumpft auf einfachen Container ohne Flex-Wrapper

Achtung: `Cockpit.svelte` verwendet Svelte-4-Syntax (`$:`, `on:click`, `export let`). Die Änderungen sind chirurgisch — keine Syntax-Migration.

- [ ] **Step 1: `CockpitShell.integration.test.ts` anpassen (zuerst rot machen)**

Der Test auf Zeile 23 (`await fireEvent.click(getByTestId('sidebar-feature'))`) referenziert ein Element aus `CockpitSidebar`. Dieses Element wird nach der Bereinigung nicht mehr existieren. Ersetze den Test durch Event-Bridge-Tests:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { selectFeature } from '../../lib/stores/cockpitStore';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 1, pctDone: 0 },
    nextStep: false, discarded: false, majorFeature: false }],
}]};

beforeEach(() => {
  selectFeature(null);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Cockpit shell integration', () => {
  it('lädt Feature-Tickets wenn cockpit:feature-selected Event gefeuert wird', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [{ id: 't1', extId: 'T1', title: 'Erstes Ticket',
            status: 'open', priority: 'mittel', type: 'task' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId: 'F1' } }));

    expect(await findByText('Erstes Ticket')).toBeTruthy();
  });

  it('auto-selects the first feature with tickets and shows them on open', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [{ id: 't1', extId: 'T1', title: 'Erstes Ticket',
            status: 'open', priority: 'mittel', type: 'task' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    expect(await findByText('Erstes Ticket')).toBeTruthy();
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
  });

  it('refetcht Portfolio bei cockpit:portfolio-mutated', async () => {
    let portfolioCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('portfolio')) portfolioCalls++;
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));

    render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });
    const before = portfolioCalls;
    window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    await waitFor(() => expect(portfolioCalls).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 2: Test ausführen — muss FAIL sein (Sidebar noch vorhanden)**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/components/admin/CockpitShell.integration.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: FAIL (sidebar-feature nicht gefunden, oder Event-Listener nicht verdrahtet).

- [ ] **Step 3: `Cockpit.svelte` bereinigen**

In `Cockpit.svelte`:

1. Zeile 7 (`import CockpitSidebar from './CockpitSidebar.svelte';`) entfernen.

2. In `onMount` (Zeile 36) nach dem bestehenden Code Folgendes ergänzen (Window-Event-Listener):
```javascript
    // Event-Bridge: globaler PortalSidekick ↔ Cockpit-Seite
    const onFeatureSelected = (e: Event) => {
      const extId = (e as CustomEvent<{ extId: string }>).detail?.extId;
      if (extId) loadFeature(extId);
    };
    const onPortfolioMutated = () => loadPortfolio();
    window.addEventListener('cockpit:feature-selected', onFeatureSelected);
    window.addEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
    return () => {
      window.removeEventListener('cockpit:feature-selected', onFeatureSelected);
      window.removeEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
    };
```

   Hinweis: `onMount` in Svelte 4 gibt eine Cleanup-Funktion zurück, wenn man sie aus der Callback-Funktion zurückgibt. Die aktuelle `onMount` in `Cockpit.svelte` endet mit `if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);` (kein return). Die Cleanup-Registrierung muss daher am Ende des `onMount`-Callbacks als `return () => { ... }` stehen.

   Da `onMount` async ist und keine Cleanup-Funktion direkt zurückgeben kann (async functions geben Promises zurück), müssen die Listener in einem separaten synchronen `onMount`-Aufruf registriert werden:

```javascript
  import { onMount, onDestroy } from 'svelte';
```

   Und nach dem bestehenden `onMount(() => { ... })` Block einen weiteren hinzufügen:

```javascript
  onMount(() => {
    const onFeatureSelected = (e: Event) => {
      const extId = (e as CustomEvent<{ extId: string }>).detail?.extId;
      if (extId) loadFeature(extId);
    };
    const onPortfolioMutated = () => loadPortfolio();
    window.addEventListener('cockpit:feature-selected', onFeatureSelected);
    window.addEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
    return () => {
      window.removeEventListener('cockpit:feature-selected', onFeatureSelected);
      window.removeEventListener('cockpit:portfolio-mutated', onPortfolioMutated);
    };
  });
```

3. Im Template (Zeile 127–143): `<div class="layout">` mit `CockpitSidebar` und `<main class="main">` vereinfachen. Vorher:

```svelte
    <div class="layout">
      <CockpitSidebar {portfolio} selectedFeature={$cockpitStore.selectedFeature}
        onSelectFeature={pickFeature} onFeatureAction={featureAction}
        onBatchFeatureAction={batchFeatureAction}
        onMutated={refetch} />
      <main class="main">
        {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}
        <CockpitTable
          feature={currentFeatureNode}
          tickets={featureData?.tickets ?? []}
          features={allFeatures}
          onMutated={refetch}
          onOpenDrawer={openDrawer}
          onOpenCreate={() => (createOpen = true)} />
      </main>
    </div>
```

Nachher:

```svelte
    <main class="main">
      {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}
      <CockpitTable
        feature={currentFeatureNode}
        tickets={featureData?.tickets ?? []}
        features={allFeatures}
        onMutated={refetch}
        onOpenDrawer={openDrawer}
        onOpenCreate={() => (createOpen = true)} />
    </main>
```

4. Im `<style>`-Block: `.layout`-Regel und `.main`-Regel anpassen. Die `.layout`-Regel wird nicht mehr gebraucht. `.main` erhält `width: 100%`:

```css
  .cockpit-shell { display: flex; flex-direction: column; gap: 0.75rem; }
  .main { flex: 1 1 auto; min-width: 0; width: 100%; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; }
  .retry { margin-left: auto; background: rgba(255,255,255,0.2); border: none;
    color: #fff; border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font-size: 0.8rem; white-space: nowrap; }
  .loading { opacity: 0.7; font-size: 0.85rem; margin-bottom: 0.5rem; }
```

- [ ] **Step 4: Test ausführen — muss PASS sein**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/components/admin/CockpitShell.integration.test.ts 2>&1 | tail -20
```

Erwartetes Ergebnis: alle Tests `PASS`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-cockpit-sidekick-global
git add website/src/components/admin/Cockpit.svelte \
        website/src/components/admin/CockpitShell.integration.test.ts
git commit -m "feat(cockpit-sidekick): remove CockpitSidebar from Cockpit, wire event bridge [T000953]"
```

---

### Task 5: `CockpitSidebar.svelte` und `CockpitSidebar.test.ts` löschen

**Files:**
- Delete: `website/src/components/admin/CockpitSidebar.svelte`
- Delete: `website/src/components/admin/CockpitSidebar.test.ts`

- [ ] **Step 1: Dateien löschen**

```bash
cd /tmp/wt-cockpit-sidekick-global
git rm website/src/components/admin/CockpitSidebar.svelte \
       website/src/components/admin/CockpitSidebar.test.ts
```

- [ ] **Step 2: Prüfen ob andere Dateien noch auf CockpitSidebar verweisen**

```bash
cd /tmp/wt-cockpit-sidekick-global
grep -r "CockpitSidebar" website/src/ --include="*.ts" --include="*.svelte" --include="*.astro" 2>/dev/null
```

Erwartetes Ergebnis: keine Ausgabe (kein Verweis mehr).

- [ ] **Step 3: Vitest-Gesamtlauf für Admin-Komponenten**

```bash
cd /tmp/wt-cockpit-sidekick-global
npx vitest run website/src/components/admin/ 2>&1 | tail -30
```

Erwartetes Ergebnis: alle verbliebenen Tests `PASS`, `CockpitSidebar` taucht nicht auf.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-cockpit-sidekick-global
git commit -m "chore(cockpit-sidekick): delete CockpitSidebar component and its test [T000953]"
```

---

### Task 6: Finale Verifikation

**Files:**
- Read: `website/src/data/test-inventory.json` (ggf. regenerieren)

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

```bash
cd /tmp/wt-cockpit-sidekick-global
task test:changed 2>&1 | tail -40
```

Erwartetes Ergebnis: alle Tests grün. Bei Fehlern: Fehler lesen und im entsprechenden Task beheben.

- [ ] **Step 2: Test-Inventar regenerieren**

```bash
cd /tmp/wt-cockpit-sidekick-global
task test:inventory 2>&1 | tail -10
```

Dann prüfen ob `website/src/data/test-inventory.json` geändert wurde:

```bash
git diff --stat website/src/data/test-inventory.json
```

Falls geändert: mitcommitten (CI failt sonst):

```bash
cd /tmp/wt-cockpit-sidekick-global
git add website/src/data/test-inventory.json
git commit -m "chore(cockpit-sidekick): regenerate test inventory [T000953]"
```

- [ ] **Step 3: Freshness-Artefakte regenerieren**

```bash
cd /tmp/wt-cockpit-sidekick-global
task freshness:regenerate 2>&1 | tail -15
```

Erwartetes Ergebnis: Artefakte (test-inventory, repo-index, etc.) aktualisiert. Neue/geänderte Dateien stagen:

```bash
cd /tmp/wt-cockpit-sidekick-global
git add -p
```

Falls es generierte Artefakte gibt (`docs/generated/`, `docs/code-quality/repo-index.json`):

```bash
git commit -m "chore(cockpit-sidekick): update generated freshness artifacts [T000953]" --allow-empty
```

- [ ] **Step 4: CI-Äquivalent lokal ausführen**

```bash
cd /tmp/wt-cockpit-sidekick-global
task freshness:check 2>&1 | tail -30
```

Erwartetes Ergebnis: alle Checks grün (S1–S4-Ratchet, Baseline-Assertion, Freshness).

Bei S1-Verstoß: die betroffene Datei prüfen (`wc -l <datei>`), ggf. auskommentierte Debug-Zeilen entfernen, bis das Budget eingehalten ist.

- [ ] **Step 5: OpenSpec validieren**

```bash
cd /tmp/wt-cockpit-sidekick-global
bash scripts/openspec.sh validate 2>&1 | tail -10
```

Erwartetes Ergebnis: `OK` oder keine Fehler.

---

## Spec-Coverage-Check

Abgleich der Akzeptanzkriterien aus der Spec gegen die Plan-Tasks:

| Akzeptanzkriterium | Abgedeckt in Task |
|--------------------|-------------------|
| 1. `/admin/cockpit` zeigt CockpitTable ohne linke Sidebar (volle Breite) | T4 (Cockpit.svelte: Sidebar entfernen, Layout vereinfachen) |
| 2. Globaler Sidekick → Item 04 öffnet `'cockpit'`-View (kein Redirect) | T3 (SidekickHome + PortalSidekick) |
| 3. Feature-Klick: auf `/admin/cockpit` → Event; woanders → Navigation | T1 (CockpitSidekickView: `pickFeature`-Logik) |
| 4. Feature-Aktionen (next_step, discard, major) aus Sidekick | T1 (CockpitSidekickView: `featureAction`) |
| 5. SuggestionBar rolliert und übernimmt Flags | T1 (CockpitSidekickView: `handleRoll`/`handleApply`/`handleReset`) |
| 6. Filter, Collapse, activeOnly persistieren in localStorage | T1 (CockpitSidekickView: `onMount`-Hydration + `persistActive`/`toggleCollapse`) |
| 7. `CockpitSidebar.svelte` und `CockpitSidebar.test.ts` gelöscht | T5 |
| 8. Alle bestehenden Unit-Tests grün; `task test:all` PASS | T6 |
