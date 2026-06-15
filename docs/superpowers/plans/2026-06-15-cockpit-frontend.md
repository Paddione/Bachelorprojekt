---
title: "Projekt-Cockpit — P3 Frontend (Shell, Karten, Linsen, Editieren)"
ticket_id: T000751
domains: [website, test]
status: active
pr_number: null
file_locks: [website/src/components/admin/Cockpit.svelte, website/src/components/admin/FeatureCard.svelte, website/src/components/admin/PortfolioGrid.svelte, website/src/components/admin/EmptyStateCockpit.svelte, website/src/components/admin/TicketRow.svelte, website/src/components/admin/FeatureWorkbench.svelte, website/src/components/admin/TicketDrawer.svelte, website/src/components/admin/BulkBar.svelte, website/src/lib/stores/cockpitStore.ts]
shared_changes: false
batch_id: cockpit-2026-06-15
parent_feature: projekt-cockpit
depends_on_plans: [docs/superpowers/plans/2026-06-15-cockpit-foundation.md]
---

# Projekt-Cockpit — P3 Frontend

> **Batch:** `cockpit-2026-06-15` · Sub-Plan **3 von 4** · Master: `docs/superpowers/plans/2026-06-15-projekt-cockpit.md`
> **Abhängigkeit:** **P1 Foundation** (`cockpit-types.ts`-Contract). Branch/rebase auf `main` ERST nachdem P1 gemerged ist. Läuft **parallel zu P2 (API)** — Komponenten bauen gegen den Contract (mocken die API in Unit-Tests). **`Cockpit.svelte` gehört diesem Plan**; der Tabelle-Modus-Zweig bleibt als Platzhalter (P4 verdrahtet ihn). Komponenten werden in `cockpit.astro` gemountet, das P4 erstellt.

**Goal:** Replace the flat `/admin/tickets` view with a brand-scoped, admin-gated **Projekt-Cockpit** that rolls up leaf-ticket progress per Feature/Produkt, offers two lenses (Überblick/Werkbank) and two modes (Karten/Tabelle), and supports inline / drawer / drag&drop / bulk editing — without growing the frozen `admin.ts` or `tickets.astro`.

**Architecture:** A new recursive-CTE view `tickets.v_cockpit_rollup` aggregates leaf counts per container; a pure DB module `cockpit-db.ts` queries it and reuses existing mutation helpers; five thin API routes under `api/admin/cockpit/` expose portfolio/feature/reorder/reparent/batch; a Svelte island (`Cockpit.svelte` + sub-components) backed by a pure `cockpitStore.ts` renders the UI; `cockpit.astro` does SSR auth + brand guard; `/admin/tickets` redirects into the cockpit's Tabelle mode. Backend/contract ships first so each stage leaves an independently-green state.

**Tech Stack:** Astro (SSR), Svelte islands, PostgreSQL 16 (recursive CTE views), Vitest (pg-mem with `vi.hoisted`), Playwright (`website` project), go-task quality gates (S1–S4 + freshness).

---

## Conventions used throughout this plan

- **All paths absolute** under the worktree root `/home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit/`. Commands assume `cd /home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit` first; the `website/` subdir is the pnpm workspace.
- **Brand guard (S3):** every endpoint resolves the brand via the established local const `const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';` and passes `BRAND()` into every query. **No `*.mentolder.de` / `*.korczewski.de` literals anywhere.** This matches `website/src/pages/api/admin/tickets/[id].ts`.
- **Auth guard:** `const session = await getSession(request.headers.get('cookie')); if (!session || !isAdmin(session)) return new Response(null, { status: 403 });` — `isAdmin` lives in `website/src/lib/auth.ts`.
- **S1 budgets (verified against `docs/code-quality/baseline.json` + `wc -l`):**
  - `website/src/lib/tickets/admin.ts` — Ist 677, **Baseline 677 → Budget 0. DO NOT TOUCH.** No cockpit logic here.
  - `website/src/pages/admin/tickets.astro` — Ist 359, **nicht-baselined → wirksame Schwelle = 400 (Astro), Budget 41.** Only a redirect change is allowed.
  - `website/src/lib/tickets-db.ts` — Ist **1094**, **baselined at 1106** (`S1:website/src/lib/tickets-db.ts`) → headroom **12 lines**. The ~55-line rollup view must therefore **NOT** be appended inline (1094 + 55 ≈ 1149 > 1106 → **S1 ratchet FAIL**). Instead the view DDL lives in a new module `tickets/cockpit-schema.ts`; `tickets-db.ts` gains only an import + a one-line `await ensureCockpitViews(pool)` call (→ ≤ 1096 ≤ 1106 ✓). Never hand-edit baseline.json.
  - All **new** `.ts` files: limit 600. New `.svelte`: limit 500. New `.astro`: limit 400. Plan keeps every new file with growth reserve under its limit; split into sub-components if any approaches ~80 %.
- **S2:** `cockpit-db.ts` imports only `pool`/`ensureSchemaOnce` from `website-db.ts` and existing helpers from `admin.ts` (type-only where possible) — **no imports from API routes or UI**. `cockpitStore.ts` imports nothing from DB/API/UI — pure store.
- **pg-mem DML tests** must mock the pool with `vi.hoisted(() => …)` before the test body (pattern: `website/src/pages/api/admin/ki/providers.test.ts`).
- **Migration (S4):** `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` mirrors the bootstrap view verbatim and is referenced both by the bootstrap (`tickets-db.ts`) and operationally applied to **both** brand DBs.

---

## Stage C — Cockpit shell, portfolio cards & lenses + store

The overview UI and state management. After Stage C, the page loads, renders portfolio cards with health/rollup, toggles lenses/modes, and persists state in localStorage + URL.

### Task 13: `cockpitStore.ts` — pure store (lens/mode/selection/optimistic)

**Files:**
- Create: `website/src/lib/stores/cockpitStore.ts` (target ~350 lines; limit 500)
- Test: `website/src/lib/stores/cockpitStore.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/lib/stores/cockpitStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('cockpitStore', () => {
  it('defaults to ueberblick/karten', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.lens).toBe('ueberblick');
    expect(s.mode).toBe('karten');
  });
  it('setLens persists to localStorage', async () => {
    const m = await import('./cockpitStore');
    m.setLens('werkbank');
    expect(get(m.cockpitStore).lens).toBe('werkbank');
    expect(localStorage.getItem('cockpit:lens')).toBe('werkbank');
  });
  it('hydrates from URL params', async () => {
    const m = await import('./cockpitStore');
    m.initStoreFromUrl(new URLSearchParams('lens=werkbank&mode=tabelle&produkt=ABC'));
    const s = get(m.cockpitStore);
    expect(s.lens).toBe('werkbank');
    expect(s.mode).toBe('tabelle');
    expect(s.currentProduct).toBe('ABC');
  });
  it('toggles ticket selection', async () => {
    const m = await import('./cockpitStore');
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(true);
    m.toggleTicketSelection('T1');
    expect(get(m.cockpitStore).selectedTickets.has('T1')).toBe(false);
  });
  it('applies + rolls back optimistic edits', async () => {
    const m = await import('./cockpitStore');
    const rollback = m.applyOptimistic('T1', 'status', 'done', 'open');
    expect(get(m.cockpitStore).optimistic['T1:status'].newValue).toBe('done');
    rollback();
    expect(get(m.cockpitStore).optimistic['T1:status']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify FAIL.** Run: `cd website && pnpm test -- cockpitStore.test.ts` → FAIL.

- [ ] **Step 3: Implement the store**

Create `website/src/lib/stores/cockpitStore.ts`:

```typescript
import { writable, derived, get } from 'svelte/store';

export type Lens = 'ueberblick' | 'werkbank';
export type Mode = 'karten' | 'tabelle';

export interface OptimisticEdit {
  ticketId: string; field: string; oldValue: unknown; newValue: unknown;
}
export interface CockpitState {
  lens: Lens;
  mode: Mode;
  currentProduct: string | null;
  currentFeature: string | null;
  selectedTickets: Set<string>;
  optimistic: Record<string, OptimisticEdit>;
  error: string | null;
  isLoading: boolean;
}

const ls = (k: string): string | null =>
  typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
const setLs = (k: string, v: string | null): void => {
  if (typeof localStorage === 'undefined') return;
  if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
};

const initial: CockpitState = {
  lens: (ls('cockpit:lens') as Lens) ?? 'ueberblick',
  mode: (ls('cockpit:mode') as Mode) ?? 'karten',
  currentProduct: ls('cockpit:produkt'),
  currentFeature: null,
  selectedTickets: new Set<string>(),
  optimistic: {},
  error: null,
  isLoading: false,
};

export const cockpitStore = writable<CockpitState>(initial);
export const selectedCount = derived(cockpitStore, ($s) => $s.selectedTickets.size);

function syncUrl(s: CockpitState): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('lens', s.lens);
  u.searchParams.set('mode', s.mode);
  if (s.currentProduct) u.searchParams.set('produkt', s.currentProduct);
  else u.searchParams.delete('produkt');
  window.history.replaceState({}, '', u);
}

export function initStoreFromUrl(p: URLSearchParams): void {
  cockpitStore.update((s) => ({
    ...s,
    lens: (p.get('lens') as Lens) ?? s.lens,
    mode: (p.get('mode') as Mode) ?? s.mode,
    currentProduct: p.get('produkt') ?? s.currentProduct,
  }));
}

export function setLens(lens: Lens): void {
  cockpitStore.update((s) => { const n = { ...s, lens }; setLs('cockpit:lens', lens); syncUrl(n); return n; });
}
export function setMode(mode: Mode): void {
  cockpitStore.update((s) => { const n = { ...s, mode }; setLs('cockpit:mode', mode); syncUrl(n); return n; });
}
export function selectProduct(extId: string | null): void {
  cockpitStore.update((s) => {
    const n = { ...s, currentProduct: extId, currentFeature: null };
    setLs('cockpit:produkt', extId); syncUrl(n); return n;
  });
}
export function selectFeature(extId: string | null): void {
  cockpitStore.update((s) => ({ ...s, currentFeature: extId }));
}
export function toggleTicketSelection(id: string): void {
  cockpitStore.update((s) => {
    const next = new Set(s.selectedTickets);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...s, selectedTickets: next };
  });
}
export function clearSelection(): void {
  cockpitStore.update((s) => ({ ...s, selectedTickets: new Set<string>() }));
}
export function applyOptimistic(ticketId: string, field: string, newValue: unknown, oldValue: unknown): () => void {
  const key = `${ticketId}:${field}`;
  cockpitStore.update((s) => ({
    ...s, optimistic: { ...s.optimistic, [key]: { ticketId, field, oldValue, newValue } },
  }));
  return () => rollbackOptimistic(ticketId, field);
}
export function rollbackOptimistic(ticketId: string, field: string): void {
  const key = `${ticketId}:${field}`;
  cockpitStore.update((s) => { const { [key]: _drop, ...rest } = s.optimistic; return { ...s, optimistic: rest }; });
}
export function clearOptimistic(ticketId: string, field: string): void { rollbackOptimistic(ticketId, field); }
export function setError(error: string | null): void { cockpitStore.update((s) => ({ ...s, error })); }
export function setLoading(isLoading: boolean): void { cockpitStore.update((s) => ({ ...s, isLoading })); }
export { get };
```

- [ ] **Step 4: PASS.** Run: `cd website && pnpm test -- cockpitStore.test.ts` → PASS. `wc -l website/src/lib/stores/cockpitStore.ts` → <500.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/stores/cockpitStore.ts website/src/lib/stores/cockpitStore.test.ts
git commit -m "feat(cockpit): pure cockpitStore (lens/mode/selection/optimistic)"
```

---

### Task 14: `FeatureCard.svelte` — single card

**Files:**
- Create: `website/src/components/admin/FeatureCard.svelte` (target ~250 lines; limit 500)
- Test: `website/src/components/admin/FeatureCard.test.ts`

- [ ] **Step 1: Failing component tests**

Create `website/src/components/admin/FeatureCard.test.ts` (Vitest + @testing-library/svelte; follow the render/fireEvent pattern already used by existing admin component tests):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FeatureCard from './FeatureCard.svelte';

const feature = {
  id: 'f1', extId: 'f1', title: 'Feature Alpha', valueProp: 'Improves onboarding',
  priority: 'mittel', health: 'red' as const,
  rollup: { total: 11, done: 8, blocked: 1, inProgress: 0, open: 2, pctDone: 73 },
};

describe('FeatureCard', () => {
  it('renders title, value prop and status chips', () => {
    const { getByText } = render(FeatureCard, { feature, onClick: () => {} });
    expect(getByText('Feature Alpha')).toBeTruthy();
    expect(getByText('Improves onboarding')).toBeTruthy();
    expect(getByText(/8.*done/i)).toBeTruthy();
    expect(getByText(/1.*blocked/i)).toBeTruthy();
  });
  it('applies red health border when blocked', () => {
    const { getByTestId } = render(FeatureCard, { feature, onClick: () => {} });
    expect(getByTestId('feature-card').className).toMatch(/health-red/);
  });
  it('calls onClick when activated', async () => {
    const onClick = vi.fn();
    const { getByTestId } = render(FeatureCard, { feature, onClick });
    await fireEvent.click(getByTestId('feature-card'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify FAIL.** Run: `cd website && pnpm test -- FeatureCard.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Create `website/src/components/admin/FeatureCard.svelte`:

```svelte
<script lang="ts">
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  export let feature: FeatureNode;
  export let onClick: () => void;
  $: r = feature.rollup;
  function activate(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    onClick();
  }
</script>

<div
  class={`feature-card health-${feature.health}`}
  data-testid="feature-card"
  role="button" tabindex="0"
  on:click={onClick} on:keydown={activate}
>
  <h4 class="title">{feature.title}</h4>
  {#if feature.valueProp}<p class="value-prop">{feature.valueProp}</p>{/if}
  <div class="bar" data-testid="progress-bar" aria-label={`${r.pctDone}% done`}>
    <span class="seg done" style={`width:${r.total ? (100 * r.done) / r.total : 0}%`}></span>
    <span class="seg blocked" style={`width:${r.total ? (100 * r.blocked) / r.total : 0}%`}></span>
  </div>
  <div class="chips">
    <span class="chip done">{r.done} done</span>
    <span class="chip blocked">{r.blocked} blocked</span>
    <span class="chip open">{r.open} open</span>
  </div>
</div>

<style>
  .feature-card { border-left: 4px solid var(--health, #888); border-radius: 8px;
    padding: 0.75rem 1rem; background: var(--admin-card-bg, #1c1f26); cursor: pointer; }
  .feature-card:focus-visible { outline: 2px solid #6ea8fe; }
  .health-green { --health: #10b981; }
  .health-amber { --health: #f59e0b; }
  .health-red   { --health: #ef4444; }
  .title { margin: 0 0 0.25rem; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value-prop { margin: 0 0 0.5rem; font-size: 0.8rem; opacity: 0.7; }
  .bar { display: flex; height: 6px; border-radius: 3px; background: #2a2e37; overflow: hidden; }
  .seg.done { background: #10b981; } .seg.blocked { background: #ef4444; }
  .chips { display: flex; gap: 0.4rem; margin-top: 0.5rem; font-size: 0.72rem; }
  .chip { padding: 0.05rem 0.4rem; border-radius: 4px; background: #2a2e37; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

Run → PASS.
```bash
git add website/src/components/admin/FeatureCard.svelte website/src/components/admin/FeatureCard.test.ts
git commit -m "feat(cockpit): FeatureCard component (progress, chips, health border)"
```

---

### Task 15: `PortfolioGrid.svelte` — product groups + card grid

**Files:**
- Create: `website/src/components/admin/PortfolioGrid.svelte` (target ~280 lines; limit 500)
- Test: `website/src/components/admin/PortfolioGrid.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/components/admin/PortfolioGrid.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PortfolioGrid from './PortfolioGrid.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'Produkt Alpha',
  rollup: { total: 5, done: 3, blocked: 2, inProgress: 0, open: 0, pctDone: 60 },
  features: [{
    id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'red' as const,
    rollup: { total: 3, done: 1, blocked: 2, inProgress: 0, open: 0, pctDone: 33 },
  }],
}]};

describe('PortfolioGrid', () => {
  it('renders product header with aggregate pill', () => {
    const { getByText } = render(PortfolioGrid, { portfolio, onSelectFeature: () => {} });
    expect(getByText('Produkt Alpha')).toBeTruthy();
    expect(getByText(/60%/)).toBeTruthy();
  });
  it('shows blocked warning when blocked > 0', () => {
    const { getByText } = render(PortfolioGrid, { portfolio, onSelectFeature: () => {} });
    expect(getByText(/2 blockiert/)).toBeTruthy();
  });
  it('calls onSelectFeature on card click', async () => {
    const onSelectFeature = vi.fn();
    const { getByTestId } = render(PortfolioGrid, { portfolio, onSelectFeature });
    await fireEvent.click(getByTestId('feature-card'));
    expect(onSelectFeature).toHaveBeenCalledWith('f1');
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/PortfolioGrid.svelte`:

```svelte
<script lang="ts">
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  import FeatureCard from './FeatureCard.svelte';
  export let portfolio: PortfolioPayload;
  export let onSelectFeature: (extId: string) => void;
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
          <FeatureCard feature={f} onClick={() => onSelectFeature(f.extId)} />
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
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/PortfolioGrid.svelte website/src/components/admin/PortfolioGrid.test.ts
git commit -m "feat(cockpit): PortfolioGrid with product groups + aggregate header"
```

---

### Task 16: `EmptyStateCockpit.svelte` — empty portfolio state

**Files:**
- Create: `website/src/components/admin/EmptyStateCockpit.svelte` (~80 lines; limit 500)
- Test: `website/src/components/admin/EmptyStateCockpit.test.ts`

- [ ] **Step 1: Failing test**

Create `website/src/components/admin/EmptyStateCockpit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EmptyStateCockpit from './EmptyStateCockpit.svelte';

describe('EmptyStateCockpit', () => {
  it('renders a calm empty message', () => {
    const { getByText } = render(EmptyStateCockpit);
    expect(getByText(/Keine Produkte/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/EmptyStateCockpit.svelte`:

```svelte
<div class="empty-state" data-testid="cockpit-empty">
  <p class="headline">Keine Produkte noch</p>
  <p class="sub">Lege ein Projekt oder Feature an, um dein Portfolio im Cockpit zu sehen.</p>
</div>

<style>
  .empty-state { text-align: center; padding: 3rem 1rem; opacity: 0.8; }
  .headline { font-size: 1.1rem; margin: 0 0 0.5rem; }
  .sub { font-size: 0.85rem; opacity: 0.7; margin: 0; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/EmptyStateCockpit.svelte website/src/components/admin/EmptyStateCockpit.test.ts
git commit -m "feat(cockpit): empty-state component"
```

---

### Task 17: `Cockpit.svelte` — shell (lens/mode toggles, loader, mounts)

**Files:**
- Create: `website/src/components/admin/Cockpit.svelte` (target ~300 lines now; grows in Stages D/E; limit 500 — split if it nears 80 %)
- Test: `website/src/components/admin/Cockpit.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/components/admin/Cockpit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { setLens } from '../../lib/stores/cockpitStore';

vi.mock('../../lib/stores/cockpitStore', async (orig) => {
  const mod = await (orig as any)();
  return { ...mod, setLens: vi.fn(mod.setLens) };
});

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P', rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
  features: [],
}]};

describe('Cockpit', () => {
  it('renders lens and mode toggles', () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    expect(getByRole('button', { name: /überblick/i })).toBeTruthy();
    expect(getByRole('button', { name: /werkbank/i })).toBeTruthy();
    expect(getByRole('button', { name: /karten/i })).toBeTruthy();
    expect(getByRole('button', { name: /tabelle/i })).toBeTruthy();
  });
  it('mounts PortfolioGrid in ueberblick lens', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    expect(getByTestId('portfolio-grid')).toBeTruthy();
  });
  it('calls setLens on toggle', async () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByRole('button', { name: /werkbank/i }));
    expect(setLens).toHaveBeenCalledWith('werkbank');
  });
  it('shows empty state when no products', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: { products: [] }, brand: 'mentolder' });
    expect(getByTestId('cockpit-empty')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/Cockpit.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, setLens, setMode, selectFeature, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
  import PortfolioGrid from './PortfolioGrid.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';

  export let portfolioInitial: PortfolioPayload | null = null;
  export let brand: string;

  let portfolio: PortfolioPayload | null = portfolioInitial;

  onMount(async () => {
    if (typeof window !== 'undefined') initStoreFromUrl(new URL(window.location.href).searchParams);
    if (!portfolio) await loadPortfolio();
  });

  async function loadPortfolio() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/cockpit/portfolio');
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      portfolio = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }

  function openFeature(extId: string) {
    selectFeature(extId);
    setLens('werkbank');
  }
</script>

<div class="cockpit-shell" data-brand={brand}>
  <div class="toolbar">
    <div class="seg" role="group" aria-label="Linse">
      <button class:active={$cockpitStore.lens === 'ueberblick'} on:click={() => setLens('ueberblick')}>Überblick</button>
      <button class:active={$cockpitStore.lens === 'werkbank'} on:click={() => setLens('werkbank')}>Werkbank</button>
    </div>
    <div class="seg" role="group" aria-label="Modus">
      <button class:active={$cockpitStore.mode === 'karten'} on:click={() => setMode('karten')}>Karten</button>
      <button class:active={$cockpitStore.mode === 'tabelle'} on:click={() => setMode('tabelle')}>Tabelle</button>
    </div>
  </div>

  {#if $cockpitStore.error}<div class="toast error">{$cockpitStore.error}</div>{/if}
  {#if $cockpitStore.isLoading}<div class="loading">Lädt …</div>{/if}

  {#if portfolio && portfolio.products.length === 0}
    <EmptyStateCockpit />
  {:else if portfolio}
    {#if $cockpitStore.mode === 'tabelle'}
      <!-- Table mode wiring added in Stage F (Task 27). -->
      <div data-testid="table-mode-placeholder"></div>
    {:else if $cockpitStore.lens === 'werkbank' && $cockpitStore.currentFeature}
      <!-- FeatureWorkbench mounted in Stage D (Task 19). -->
      <div data-testid="workbench-placeholder"></div>
    {:else}
      <PortfolioGrid {portfolio} onSelectFeature={openFeature} />
    {/if}
  {/if}
</div>

<style>
  .cockpit-shell { display: flex; flex-direction: column; gap: 1rem; }
  .toolbar { display: flex; gap: 1rem; }
  .seg button { padding: 0.35rem 0.8rem; background: #2a2e37; border: none; color: inherit; cursor: pointer; }
  .seg button.active { background: #6ea8fe; color: #0b0d12; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; }
  .loading { opacity: 0.7; font-size: 0.85rem; }
</style>
```

> Executor note: Stage D replaces `workbench-placeholder` with `<FeatureWorkbench>` and Stage F replaces `table-mode-placeholder` with the existing table component. Keep those as named placeholders so the wiring tasks have a clear seam.

- [ ] **Step 4: PASS + Step 5: Commit**

Run: `cd website && pnpm test -- Cockpit.test.ts` → PASS.
```bash
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts
git commit -m "feat(cockpit): Cockpit shell (lens/mode toggles + portfolio loader)"
```

---

### Task 18: Store↔shell integration test (persistence)

**Files:**
- Create: `website/src/components/admin/CockpitShell.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create the file:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P', rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
  features: [],
}]};

beforeEach(() => localStorage.clear());

describe('Cockpit persistence', () => {
  it('persists lens to localStorage on toggle', async () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByRole('button', { name: /werkbank/i }));
    expect(localStorage.getItem('cockpit:lens')).toBe('werkbank');
  });
});
```

- [ ] **Step 2: Run + verify pass.** Run: `cd website && pnpm test -- CockpitShell.integration.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/CockpitShell.integration.test.ts
git commit -m "test(cockpit): shell↔store persistence integration"
```

---

## Stage D — Drill-in: inline edit + detail drawer (editing part 1)

After Stage D, opening a feature shows a ticket list with inline status/priority edits (optimistic + rollback) and a full-field drawer reusing existing endpoints.

### Task 19: `TicketRow.svelte` — row with inline status/priority + checkbox + drag handle

**Files:**
- Create: `website/src/components/admin/TicketRow.svelte` (target ~250 lines; limit 500)
- Test: `website/src/components/admin/TicketRow.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/components/admin/TicketRow.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TicketRow from './TicketRow.svelte';

const ticket = { id: 't1', extId: 't1', title: 'Task One', status: 'open', priority: 'mittel', type: 'task' };

describe('TicketRow', () => {
  it('renders title, extId and dropdowns', () => {
    const { getByText, getAllByRole } = render(TicketRow, { ticket, selected: false });
    expect(getByText('Task One')).toBeTruthy();
    expect(getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
  it('dispatches statusChange on status select', async () => {
    const { component, getByTestId } = render(TicketRow, { ticket, selected: false });
    const handler = vi.fn(); component.$on('statusChange', handler);
    await fireEvent.change(getByTestId('status-select'), { target: { value: 'done' } });
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail).toEqual({ id: 't1', status: 'done' });
  });
  it('dispatches selectToggle on checkbox', async () => {
    const { component, getByTestId } = render(TicketRow, { ticket, selected: false });
    const handler = vi.fn(); component.$on('selectToggle', handler);
    await fireEvent.click(getByTestId('row-checkbox'));
    expect(handler).toHaveBeenCalled();
  });
  it('dispatches openDrawer on title click', async () => {
    const { component, getByText } = render(TicketRow, { ticket, selected: false });
    const handler = vi.fn(); component.$on('openDrawer', handler);
    await fireEvent.click(getByText('Task One'));
    expect(handler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/TicketRow.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  export let ticket: TicketRowT;
  export let selected = false;
  export let busy = false;
  const dispatch = createEventDispatcher();

  const STATUSES = ['triage', 'backlog', 'planning', 'in_progress', 'in_review', 'blocked', 'done'];
  const PRIORITIES = ['niedrig', 'mittel', 'hoch'];

  function onStatus(e: Event) {
    dispatch('statusChange', { id: ticket.id, status: (e.target as HTMLSelectElement).value });
  }
  function onPriority(e: Event) {
    dispatch('priorityChange', { id: ticket.id, priority: (e.target as HTMLSelectElement).value });
  }
</script>

<div class="row" class:selected aria-busy={busy}>
  <input type="checkbox" data-testid="row-checkbox" checked={selected}
    on:change={() => dispatch('selectToggle', { id: ticket.id })} aria-label={`Select ${ticket.title}`} />
  <span class="handle" draggable="true" aria-label="Reorder (Shift+Up/Down)"
    on:dragstart={(e) => dispatch('dragStart', { id: ticket.id, event: e })}>⋮⋮</span>
  <button class="title-link" on:click={() => dispatch('openDrawer', { ticket })}>{ticket.title}</button>
  <code class="ext">{ticket.extId}</code>
  <select data-testid="status-select" value={ticket.status} on:change={onStatus} disabled={busy}>
    {#each STATUSES as s}<option value={s}>{s}</option>{/each}
  </select>
  <select data-testid="priority-select" value={ticket.priority} on:change={onPriority} disabled={busy}>
    {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
  </select>
</div>

<style>
  .row { display: grid; grid-template-columns: auto auto 1fr auto auto auto; gap: 0.5rem;
    align-items: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid #2a2e37; }
  .row.selected { background: rgba(110,168,254,0.12); }
  .handle { cursor: grab; opacity: 0.5; }
  .title-link { background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0; }
  .ext { opacity: 0.6; font-size: 0.75rem; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/TicketRow.svelte website/src/components/admin/TicketRow.test.ts
git commit -m "feat(cockpit): TicketRow with inline status/priority, checkbox, drag handle"
```

---

### Task 20: `FeatureWorkbench.svelte` — drill-in list + optimistic inline edits

**Files:**
- Create: `website/src/components/admin/FeatureWorkbench.svelte` (target ~320 lines; limit 500)
- Test: `website/src/components/admin/FeatureWorkbench.test.ts`

- [ ] **Step 1: Failing tests** (mock `fetch`)

Create `website/src/components/admin/FeatureWorkbench.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import FeatureWorkbench from './FeatureWorkbench.svelte';

const feature = { id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber' as const,
  rollup: { total: 2, done: 0, blocked: 0, inProgress: 0, open: 2, pctDone: 0 } };
const tickets = [
  { id: 't1', extId: 't1', title: 'A', status: 'open', priority: 'mittel', type: 'task' },
  { id: 't2', extId: 't2', title: 'B', status: 'open', priority: 'mittel', type: 'task' },
];

beforeEach(() => { vi.restoreAllMocks(); });

describe('FeatureWorkbench', () => {
  it('renders feature header and a row per ticket', () => {
    const { getByText, getAllByTestId } = render(FeatureWorkbench, { feature, tickets });
    expect(getByText('F1')).toBeTruthy();
    expect(getAllByTestId('row-checkbox')).toHaveLength(2);
  });
  it('optimistically applies status then calls transition endpoint', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(FeatureWorkbench, { feature, tickets });
    await fireEvent.change(getAllByTestId('status-select')[0], { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/tickets\/t1\/transition/), expect.anything()));
  });
  it('rolls back status when transition fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    const { getAllByTestId } = render(FeatureWorkbench, { feature, tickets });
    const sel = getAllByTestId('status-select')[0] as HTMLSelectElement;
    await fireEvent.change(sel, { target: { value: 'done' } });
    await waitFor(() => expect(sel.value).toBe('open'));
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/FeatureWorkbench.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode, TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, toggleTicketSelection, applyOptimistic } from '../../lib/stores/cockpitStore';
  import TicketRow from './TicketRow.svelte';
  export let feature: FeatureNode;
  export let tickets: TicketRowT[];
  const dispatch = createEventDispatcher();
  let busy: Record<string, boolean> = {};

  async function patchStatus(id: string, status: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    try {
      const res = await fetch(`/api/admin/tickets/${id}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus: status }),
      });
      if (!res.ok) throw new Error(`transition ${res.status}`);
      dispatch('mutated', { featureExtId: feature.extId });
    } catch {
      t.status = old; tickets = [...tickets]; rollback();
    } finally { busy[id] = false; busy = { ...busy }; }
  }

  async function patchPriority(id: string, priority: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.priority; t.priority = priority; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'priority', priority, old);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error(`patch ${res.status}`);
      dispatch('mutated', { featureExtId: feature.extId });
    } catch {
      t.priority = old; tickets = [...tickets]; rollback();
    } finally { busy[id] = false; busy = { ...busy }; }
  }
</script>

<section class="workbench" data-testid="feature-workbench">
  <header class="head">
    <button class="back" on:click={() => dispatch('back')}>← Zurück</button>
    <h3>{feature.title}</h3>
    <span class={`health-dot health-${feature.health}`}></span>
    {#if feature.rollup.blocked > 0}<span class="warn">⚠ {feature.rollup.blocked} blockiert</span>{/if}
  </header>
  <div class="list">
    {#each tickets as t (t.id)}
      <TicketRow ticket={t} busy={busy[t.id]}
        selected={$cockpitStore.selectedTickets.has(t.id)}
        on:statusChange={(e) => patchStatus(e.detail.id, e.detail.status)}
        on:priorityChange={(e) => patchPriority(e.detail.id, e.detail.priority)}
        on:selectToggle={(e) => toggleTicketSelection(e.detail.id)}
        on:openDrawer={(e) => dispatch('openDrawer', e.detail)} />
    {/each}
    {#if tickets.length === 0}<p class="empty">Keine Tickets</p>{/if}
  </div>
</section>

<style>
  .head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .back { background: none; border: none; color: inherit; cursor: pointer; }
  .health-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .health-green { background: #10b981; } .health-amber { background: #f59e0b; } .health-red { background: #ef4444; }
  .warn { color: #ef4444; font-size: 0.8rem; }
  .empty { opacity: 0.6; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/FeatureWorkbench.svelte website/src/components/admin/FeatureWorkbench.test.ts
git commit -m "feat(cockpit): FeatureWorkbench drill-in with optimistic inline edits"
```

---

### Task 21: `TicketDrawer.svelte` — full-field panel (reuse existing endpoints)

**Files:**
- Create: `website/src/components/admin/TicketDrawer.svelte` (target ~350 lines; limit 500 — if comment/link/attachment forms push it near 80 %, extract `CommentForm.svelte` etc.)
- Test: `website/src/components/admin/TicketDrawer.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/components/admin/TicketDrawer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketDrawer from './TicketDrawer.svelte';

const ticket = { id: 't1', extId: 't1', title: 'Task One', status: 'open', priority: 'mittel', type: 'task' };
beforeEach(() => vi.restoreAllMocks());

describe('TicketDrawer', () => {
  it('hidden when open=false', () => {
    const { queryByTestId } = render(TicketDrawer, { ticket, open: false });
    expect(queryByTestId('ticket-drawer')).toBeNull();
  });
  it('renders fields when open', () => {
    const { getByDisplayValue } = render(TicketDrawer, { ticket, open: true });
    expect(getByDisplayValue('Task One')).toBeTruthy();
  });
  it('PATCHes title on save', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByDisplayValue, getByText } = render(TicketDrawer, { ticket, open: true });
    await fireEvent.input(getByDisplayValue('Task One'), { target: { value: 'New Title' } });
    await fireEvent.click(getByText(/speichern/i));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/tickets\/t1$/), expect.objectContaining({ method: 'PATCH' })));
  });
  it('dispatches close on close button', async () => {
    const { component, getByLabelText } = render(TicketDrawer, { ticket, open: true });
    const handler = vi.fn(); component.$on('close', handler);
    await fireEvent.click(getByLabelText(/schließen/i));
    expect(handler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/TicketDrawer.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  export let ticket: TicketRowT | null;
  export let open = false;
  const dispatch = createEventDispatcher();

  let title = ''; let saving = false; let error: string | null = null;
  $: if (ticket) title = ticket.title;

  async function save() {
    if (!ticket) return;
    const old = ticket.title; saving = true; error = null;
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      dispatch('mutated', { ticketId: ticket.id });
    } catch (e) { title = old; error = String((e as Error).message); }
    finally { saving = false; }
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') dispatch('close'); }
</script>

<svelte:window on:keydown={onKey} />

{#if open && ticket}
  <div class="backdrop" on:click={() => dispatch('close')}></div>
  <aside class="drawer" data-testid="ticket-drawer" aria-label="Ticket-Details">
    <header>
      <h3>{ticket.extId}</h3>
      <button class="close" aria-label="Schließen" on:click={() => dispatch('close')}>×</button>
    </header>
    {#if error}<p class="error">{error}</p>{/if}
    <label>Titel<input bind:value={title} /></label>
    <!-- Comments / Links / Attachments reuse existing endpoints
         (/comments, /links, /attachments) — added via sub-forms if needed. -->
    <footer>
      <button class="primary" on:click={save} disabled={saving}>Speichern</button>
      <button on:click={() => dispatch('close')}>Abbrechen</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(420px, 90vw);
    background: #14171d; z-index: 50; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  input { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; padding: 0.4rem; border-radius: 4px; }
  .error { color: #ef4444; font-size: 0.85rem; }
  footer { margin-top: auto; display: flex; gap: 0.5rem; }
  .primary { background: #6ea8fe; color: #0b0d12; border: none; padding: 0.4rem 0.9rem; border-radius: 4px; cursor: pointer; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/TicketDrawer.svelte website/src/components/admin/TicketDrawer.test.ts
git commit -m "feat(cockpit): TicketDrawer full-field panel (reuses existing edit endpoints)"
```

---

### Task 22: Wire Workbench + Drawer into `Cockpit.svelte`

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte` (replace the `workbench-placeholder`; add drawer + feature loader)
- Test: append to `website/src/components/admin/Cockpit.test.ts`

- [ ] **Step 1: Failing test** (append)

```typescript
import { waitFor } from '@testing-library/svelte';
import { vi as _vi } from 'vitest';

describe('Cockpit drill-in', () => {
  it('loads feature tickets and mounts workbench in werkbank lens', async () => {
    _vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      feature: { id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber',
        rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 } },
      tickets: [],
    }), { status: 200 }));
    const portfolio = { products: [{ id: 'p1', extId: 'p1', title: 'P',
      rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
      features: [{ id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber',
        rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }] }] };
    const { getByText, getByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    await waitFor(() => expect(getByTestId('feature-workbench')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement the wiring**

In `website/src/components/admin/Cockpit.svelte`:
1. Import `FeatureWorkbench` and `TicketDrawer`, plus `selectFeature` (already imported) and types.
2. Add state + loader:

```svelte
  import FeatureWorkbench from './FeatureWorkbench.svelte';
  import TicketDrawer from './TicketDrawer.svelte';
  import type { FeatureTickets, TicketRow } from '../../lib/tickets/cockpit-types';

  let featureData: FeatureTickets | null = null;
  let drawerTicket: TicketRow | null = null;
  let drawerOpen = false;

  async function openFeature(extId: string) {
    selectFeature(extId); setLens('werkbank');
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/cockpit/feature?id=${encodeURIComponent(extId)}`);
      if (!res.ok) throw new Error(`feature ${res.status}`);
      featureData = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }
  async function refetchFeature() {
    if (featureData) await openFeature(featureData.feature.extId);
    await loadPortfolio();
  }
```

3. Replace the `workbench-placeholder` branch:

```svelte
    {:else if $cockpitStore.lens === 'werkbank' && $cockpitStore.currentFeature && featureData}
      <FeatureWorkbench feature={featureData.feature} tickets={featureData.tickets}
        on:back={() => { selectFeature(null); setLens('ueberblick'); }}
        on:mutated={refetchFeature}
        on:openDrawer={(e) => { drawerTicket = e.detail.ticket; drawerOpen = true; }} />
```

4. Add the drawer at the end of the shell `<div>`:

```svelte
  <TicketDrawer ticket={drawerTicket} open={drawerOpen}
    on:close={() => (drawerOpen = false)} on:mutated={refetchFeature} />
```

5. Keep `wc -l` under 500 — if it exceeds, extract the loader functions into a small `cockpit-actions.ts` helper imported by the component.

- [ ] **Step 4: PASS + Step 5: Commit**

Run: `cd website && pnpm test -- Cockpit.test.ts` → PASS. `wc -l website/src/components/admin/Cockpit.svelte` → <500.
```bash
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts
git commit -m "feat(cockpit): wire FeatureWorkbench + TicketDrawer into shell with refetch"
```

---

## Stage E — Drag & drop (reorder/reparent) + bulk editing (editing part 2)

After Stage E, tickets reorder via drag/keyboard, reparent onto feature cards, and multi-select bulk edits run through the batch endpoint — all optimistic with rollback. The reorder/reparent/batch **endpoints already exist** (Stage B) and the DB helpers already exist (Stage A); Stage E is the UI wiring + BulkBar.

### Task 23: `BulkBar.svelte` — multi-select action bar

**Files:**
- Create: `website/src/components/admin/BulkBar.svelte` (target ~180 lines; limit 500)
- Test: `website/src/components/admin/BulkBar.test.ts`

- [ ] **Step 1: Failing tests**

Create `website/src/components/admin/BulkBar.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BulkBar from './BulkBar.svelte';

describe('BulkBar', () => {
  it('hidden when no selection', () => {
    const { queryByTestId } = render(BulkBar, { selectedIds: [] });
    expect(queryByTestId('bulk-bar')).toBeNull();
  });
  it('shows count when selection present', () => {
    const { getByText } = render(BulkBar, { selectedIds: ['a', 'b', 'c'] });
    expect(getByText(/3 .* ausgewählt/i)).toBeTruthy();
  });
  it('dispatches bulkStatus on status change', async () => {
    const { component, getByTestId } = render(BulkBar, { selectedIds: ['a', 'b'] });
    const handler = vi.fn(); component.$on('bulkStatus', handler);
    await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
    expect(handler.mock.calls[0][0].detail).toEqual({ ids: ['a', 'b'], status: 'done' });
  });
  it('dispatches clear on Escape', async () => {
    const { component, getByTestId } = render(BulkBar, { selectedIds: ['a'] });
    const handler = vi.fn(); component.$on('clear', handler);
    await fireEvent.keyDown(getByTestId('bulk-bar'), { key: 'Escape' });
    expect(handler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement**

Create `website/src/components/admin/BulkBar.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  export let selectedIds: string[] = [];
  export let features: FeatureNode[] = [];
  const dispatch = createEventDispatcher();
  const STATUSES = ['triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'done'];
  const PRIORITIES = ['niedrig', 'mittel', 'hoch'];

  function onStatus(e: Event) { dispatch('bulkStatus', { ids: selectedIds, status: (e.target as HTMLSelectElement).value }); }
  function onPriority(e: Event) { dispatch('bulkPriority', { ids: selectedIds, priority: (e.target as HTMLSelectElement).value }); }
  function onParent(e: Event) { dispatch('bulkReparent', { ids: selectedIds, parentId: (e.target as HTMLSelectElement).value }); }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') dispatch('clear'); }
</script>

{#if selectedIds.length > 0}
  <div class="bulk-bar" data-testid="bulk-bar" role="toolbar" tabindex="0" on:keydown={onKey}>
    <span>{selectedIds.length} Tickets ausgewählt</span>
    <select data-testid="bulk-status" on:change={onStatus}>
      <option value="" selected>Status …</option>
      {#each STATUSES as s}<option value={s}>{s}</option>{/each}
    </select>
    <select data-testid="bulk-priority" on:change={onPriority}>
      <option value="" selected>Priorität …</option>
      {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
    </select>
    <select data-testid="bulk-parent" on:change={onParent}>
      <option value="" selected>Verschieben nach …</option>
      {#each features as f}<option value={f.id}>{f.title}</option>{/each}
    </select>
    <button on:click={() => dispatch('bulkEnqueue', { ids: selectedIds })}>Zur Fabrik</button>
    <button class="clear" on:click={() => dispatch('clear')}>Auswahl aufheben</button>
  </div>
{/if}

<style>
  .bulk-bar { position: sticky; bottom: 0; display: flex; gap: 0.5rem; align-items: center;
    padding: 0.5rem 0.75rem; background: #1c1f26; border-top: 1px solid #2a2e37; }
  .clear { margin-left: auto; }
</style>
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/BulkBar.svelte website/src/components/admin/BulkBar.test.ts
git commit -m "feat(cockpit): BulkBar multi-select action bar"
```

---

### Task 24: Reorder + keyboard fallback in Workbench (→ `reorder` endpoint)

**Files:**
- Modify: `website/src/components/admin/FeatureWorkbench.svelte` (drop handlers + Shift+Up/Down + reorder fetch)
- Test: append to `website/src/components/admin/FeatureWorkbench.test.ts`

- [ ] **Step 1: Failing test** (append)

```typescript
import { waitFor as wf } from '@testing-library/svelte';

it('reorders via keyboard Shift+ArrowDown and POSTs reorder', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  const { getAllByTestId } = render(FeatureWorkbench, { feature, tickets: [...tickets] });
  const rows = getAllByTestId('row-checkbox');
  await fireEvent.keyDown(rows[0], { key: 'ArrowDown', shiftKey: true });
  await wf(() => expect(spy).toHaveBeenCalledWith(
    '/api/admin/cockpit/reorder', expect.objectContaining({ method: 'POST' })));
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement** — add to `FeatureWorkbench.svelte`:

```svelte
  async function persistOrder() {
    const updates = tickets.map((t, i) => ({ ticketId: t.id, planningRank: i }));
    const snapshot = [...tickets];
    try {
      const res = await fetch('/api/admin/cockpit/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error(`reorder ${res.status}`);
      dispatch('mutated', { featureExtId: feature.extId });
    } catch { tickets = snapshot; }
  }
  function moveBy(id: string, delta: number) {
    const i = tickets.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= tickets.length) return;
    [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
    tickets = [...tickets];
    persistOrder();
  }
  function onRowKey(e: KeyboardEvent, id: string) {
    if (!e.shiftKey) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); moveBy(id, -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveBy(id, 1); }
  }
  // drag reorder
  let dragId: string | null = null;
  function onDragStart(id: string) { dragId = id; }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = tickets.findIndex((t) => t.id === dragId);
    const to = tickets.findIndex((t) => t.id === targetId);
    const [moved] = tickets.splice(from, 1);
    tickets.splice(to, 0, moved);
    tickets = [...tickets]; dragId = null; persistOrder();
  }
```

Bind in the `{#each}` (wrap each `TicketRow` in a keydown/drop handler):

```svelte
    {#each tickets as t (t.id)}
      <div role="listitem" on:keydown={(e) => onRowKey(e, t.id)}
           on:dragover|preventDefault on:drop={() => onDrop(t.id)}>
        <TicketRow ticket={t} busy={busy[t.id]}
          selected={$cockpitStore.selectedTickets.has(t.id)}
          on:dragStart={(e) => onDragStart(e.detail.id)}
          on:statusChange={(e) => patchStatus(e.detail.id, e.detail.status)}
          on:priorityChange={(e) => patchPriority(e.detail.id, e.detail.priority)}
          on:selectToggle={(e) => toggleTicketSelection(e.detail.id)}
          on:openDrawer={(e) => dispatch('openDrawer', e.detail)} />
      </div>
    {/each}
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/FeatureWorkbench.svelte website/src/components/admin/FeatureWorkbench.test.ts
git commit -m "feat(cockpit): reorder via drag + Shift+Arrow keyboard (POST reorder)"
```

---

### Task 25: Reparent drop-zone on FeatureCard (→ `reparent` endpoint)

**Files:**
- Modify: `website/src/components/admin/FeatureCard.svelte` (accept drop when dragging)
- Modify: `website/src/components/admin/PortfolioGrid.svelte` (forward reparent event)
- Test: append to `website/src/components/admin/FeatureCard.test.ts`

- [ ] **Step 1: Failing test** (append to FeatureCard.test.ts)

```typescript
it('dispatches reparent on drop', async () => {
  const { component, getByTestId } = render(FeatureCard, { feature, onClick: () => {} });
  const handler = vi.fn(); component.$on('reparent', handler);
  await fireEvent.drop(getByTestId('feature-card'),
    { dataTransfer: { getData: () => 't9' } });
  expect(handler.mock.calls[0][0].detail).toEqual({ ticketId: 't9', newParentId: 'f1' });
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement** — in `FeatureCard.svelte` add to `<script>` and the card element:

```svelte
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  function onDrop(e: DragEvent) {
    const ticketId = e.dataTransfer?.getData('text/plain') || (e.dataTransfer as any)?.getData?.('');
    if (ticketId) dispatch('reparent', { ticketId, newParentId: feature.id });
  }
```
Add `on:dragover|preventDefault on:drop|preventDefault={onDrop}` to the `.feature-card` div. In `TicketRow.svelte`'s `dragStart`, set `e.dataTransfer?.setData('text/plain', ticket.id)`.

In `PortfolioGrid.svelte`, forward the event: `<FeatureCard … on:reparent />` and add `export let onReparent: (ticketId: string, newParentId: string) => void` invoked via `on:reparent={(e) => onReparent(e.detail.ticketId, e.detail.newParentId)}`.

In `Cockpit.svelte`, pass `onReparent` to `PortfolioGrid`:

```svelte
      <PortfolioGrid {portfolio} onSelectFeature={openFeature}
        onReparent={async (ticketId, newParentId) => {
          await fetch('/api/admin/cockpit/reparent', { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, newParentId }) });
          await loadPortfolio();
        }} />
```

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/FeatureCard.svelte website/src/components/admin/PortfolioGrid.svelte website/src/components/admin/Cockpit.svelte website/src/components/admin/FeatureCard.test.ts
git commit -m "feat(cockpit): reparent drag-drop onto feature cards (POST reparent)"
```

---

### Task 26: Wire BulkBar into Workbench (→ `batch` endpoint)

**Files:**
- Modify: `website/src/components/admin/FeatureWorkbench.svelte` (mount BulkBar; batch handlers)
- Test: append to `website/src/components/admin/FeatureWorkbench.test.ts`

- [ ] **Step 1: Failing test** (append)

```typescript
it('bulk-changes status via batch endpoint', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response('{"ok":true,"results":[]}', { status: 200 }));
  const { getAllByTestId, getByTestId } = render(FeatureWorkbench, { feature, tickets: [...tickets] });
  await fireEvent.click(getAllByTestId('row-checkbox')[0]);
  await fireEvent.click(getAllByTestId('row-checkbox')[1]);
  await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
  await wf(() => expect(spy).toHaveBeenCalledWith(
    '/api/admin/cockpit/batch', expect.objectContaining({ method: 'POST' })));
});
```

- [ ] **Step 2: Verify FAIL.**

- [ ] **Step 3: Implement** — in `FeatureWorkbench.svelte`:

```svelte
  import BulkBar from './BulkBar.svelte';
  import { clearSelection } from '../../lib/stores/cockpitStore';
  export let features: FeatureNode[] = [];   // sibling features for reparent dropdown

  $: selectedIds = [...$cockpitStore.selectedTickets];

  async function runBatch(mutation: Record<string, unknown>, ids: string[]) {
    const res = await fetch('/api/admin/cockpit/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketIds: ids, mutation }),
    });
    if (res.ok) { clearSelection(); dispatch('mutated', { featureExtId: feature.extId }); }
  }
```

Mount at the bottom of the `<section>`:

```svelte
  <BulkBar selectedIds={selectedIds} {features}
    on:bulkStatus={(e) => runBatch({ status: e.detail.status }, e.detail.ids)}
    on:bulkPriority={(e) => runBatch({ priority: e.detail.priority }, e.detail.ids)}
    on:bulkReparent={(e) => runBatch({ parentId: e.detail.parentId }, e.detail.ids)}
    on:bulkEnqueue={(e) => runBatch({ enqueue: true }, e.detail.ids)}
    on:clear={clearSelection} />
```

In `Cockpit.svelte`, pass sibling features to the workbench: compute `features` from `featureData.feature`'s product (or pass the flattened feature list from `portfolio`).

- [ ] **Step 4: PASS + Step 5: Commit**

Run → PASS. `wc -l website/src/components/admin/FeatureWorkbench.svelte` → <500 (split helpers if needed).
```bash
git add website/src/components/admin/FeatureWorkbench.svelte website/src/components/admin/Cockpit.svelte website/src/components/admin/FeatureWorkbench.test.ts
git commit -m "feat(cockpit): wire BulkBar to batch endpoint with optimistic clear"
```

---


---

## Verification (scoped sub-plan gate)

This sub-plan merges independently — it must be green on its own.

- [ ] Scoped unit tests: `cd website && pnpm test -- "Cockpit|FeatureCard|PortfolioGrid|cockpitStore|TicketRow|FeatureWorkbench|TicketDrawer|BulkBar"`
- [ ] `task test:all` → exit 0
- [ ] `task freshness:regenerate` then `task freshness:check` → exit 0 (S1–S4 ratchet incl. `tickets-db.ts` ≤ 1106, `admin.ts` = 677)
- [ ] If test files were added: `task test:inventory` + commit `website/src/data/test-inventory.json`
- [ ] Confirm only this sub-plan's `file_locks` files changed
