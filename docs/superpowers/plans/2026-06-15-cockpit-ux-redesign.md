---
title: Cockpit UX Redesign Implementation Plan
ticket_id: T000786
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cockpit UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-tab Projekt-Cockpit (`/admin/cockpit`) with a tabelle-first, sidebar-navigated, fully-responsive PM cockpit — no lens/mode mental model.

**Architecture:** A persistent sidebar tree (product headings + clickable feature nodes) filters a single ticket table. The table owns a toolbar (search + status chips + `+ Ticket`), the rows, and a sticky bulk bar. A create modal and a detail drawer slide over. On `< 768px` the sidebar collapses into a hamburger drawer, the table drops the ID/created columns, the modal becomes a bottom-sheet, and the drawer goes full-screen. The `cockpitStore` loses `lens`/`mode`/`currentProduct`; it keeps `selectedFeature`, `activeTicket`, selection, optimistic edits, loading, and error. No API or DB changes.

**Tech Stack:** Astro 5 + Svelte 5 (runes for new components, classic stores for the shared store), Vitest + `@testing-library/svelte`, Playwright (live-prod E2E). CSS scoped per `.svelte`; dark-mode `--admin-*` tokens.

---

## Important context for the implementer

**Read these files before starting (Task 0 covers this):** the existing cockpit lives flat under `website/src/components/admin/` (NOT in a `cockpit/` subfolder, despite the spec's directory sketch — keep files flat to avoid churning every import path). The spec's `cockpit/` path block is illustrative only.

**Current files and their fates:**

| File | Lines | Fate |
|------|-------|------|
| `website/src/components/admin/Cockpit.svelte` | 106 | **Rewrite** (drop lens/mode, mount sidebar + table) |
| `website/src/components/admin/TicketsTab.svelte` | 615 | **Delete** (split → CockpitTable + TicketCreateModal) |
| `website/src/components/admin/TicketsTableBody.svelte` | 329 | **Delete** (unused by cockpit; legacy `/admin/tickets` markup) |
| `website/src/components/admin/FeatureWorkbench.svelte` | 141 | **Delete** (logic → CockpitTable) |
| `website/src/components/admin/PortfolioGrid.svelte` | 42 | **Delete** (card view gone) |
| `website/src/components/admin/FeatureCard.svelte` | 66 | **Delete** (only PortfolioGrid used it → orphan) |
| `website/src/components/admin/TicketQuickEdit.svelte` | 264 | **Delete** (only TicketsTab used it → orphan; create/edit now in modal + drawer) |
| `website/src/components/admin/EmptyStateCockpit.svelte` | 11 | **Keep** (reused) |
| `website/src/components/admin/TicketRow.svelte` | 69 | **Extend** (responsive columns: hide ID/created on mobile, priority left-border) |
| `website/src/components/admin/BulkBar.svelte` | 68 | **Keep unchanged** (used by CockpitTable) |
| `website/src/components/admin/TicketDrawer.svelte` | 70 | **Extend** (status transitions + inline description edit + mobile full-screen) |
| `website/src/lib/stores/cockpitStore.ts` | 99 | **Simplify** (remove lens/mode/currentProduct) |
| `website/src/lib/tickets/cockpit-types.ts` | 66 | **Extend** (add optional `description`, `createdAt`, `component` to `TicketRow`) |
| `website/src/pages/admin/cockpit.astro` | 23 | **Keep** (no change needed) |

**New files:**

| File | Purpose | Target lines (S1) |
|------|---------|-------------------|
| `website/src/components/admin/CockpitSidebar.svelte` | Tree (product headings + feature nodes) + hamburger drawer | ≤ 230 |
| `website/src/components/admin/CockpitTable.svelte` | Toolbar (search + status chips + `+ Ticket`) + table + bulk bar | ≤ 300 |
| `website/src/components/admin/TicketCreateModal.svelte` | Create form as modal / bottom-sheet | ≤ 260 |
| `website/src/lib/tickets/cockpit-table-actions.ts` | Pure async helpers: transition / patch / reorder / batch / create | ≤ 180 |

### S1 line-budget analysis (verified against `docs/code-quality/baseline.json`)

Only **one** cockpit file is baselined: `S1:website/src/components/admin/TicketsTab.svelte = 615`. Everything else is non-baselined → governed by the static extension limit (`.svelte` = 500, `.ts` = 600).

- **TicketsTab.svelte**: Ist 615 · Baseline 615 → **deleted**. Removing the file removes its baseline key. The baseline key-count assertion in `freshness:check` fails only on *growth* (added keys), so a net **−1 key** is safe. `freshness:regenerate` rewrites `baseline.json` without the dead key; commit it.
- **Cockpit.svelte**: Ist 106 · non-baselined · limit 500 → ample budget after rewrite (target ≤ 160).
- **cockpitStore.ts**: Ist 99 · non-baselined · limit 600 → shrinks; safe.
- **cockpit-types.ts**: Ist 66 · non-baselined · limit 600 → +~3 lines; safe.
- **TicketRow.svelte**: Ist 69 · non-baselined · limit 500 → +~40 lines; safe.
- **TicketDrawer.svelte**: Ist 70 · non-baselined · limit 500 → +~80 lines; safe.
- **New components**: each cut with ≥ 40 % headroom under 500. To keep `CockpitTable.svelte` lean, all fetch/mutation logic lives in the pure helper module `cockpit-table-actions.ts` (S2-safe: it imports only types, never UI/store).
- **S4 (orphans)** only scans `k3d/*.yaml` + `scripts/*.{sh,mjs}` — Svelte deletions don't trip S4, but we still delete `FeatureCard.svelte` / `TicketQuickEdit.svelte` to avoid dead code, plus their test files.

### Test inventory of cockpit components (verify before editing)

```
website/src/lib/stores/cockpitStore.test.ts          (44)  → rewrite (drop lens/mode tests)
website/src/components/admin/Cockpit.test.ts          (65)  → rewrite (no lens/mode toggles)
website/src/components/admin/CockpitShell.integration.test.ts (18) → rewrite (no lens persistence)
website/src/components/admin/FeatureWorkbench.test.ts (62)  → port logic → CockpitTable.test.ts, then delete
website/src/components/admin/PortfolioGrid.test.ts    (30)  → delete
website/src/components/admin/FeatureCard.test.ts      (?)   → delete (FeatureCard removed)
website/src/components/admin/TicketRow.test.ts        (32)  → extend (responsive cols)
website/src/components/admin/TicketDrawer.test.ts     (31)  → extend (transitions + inline edit)
website/src/components/admin/BulkBar.test.ts          (26)  → keep
website/src/components/admin/EmptyStateCockpit.test.ts(10)  → keep
```
New: `CockpitSidebar.test.ts`, `CockpitTable.test.ts`, `TicketCreateModal.test.ts`, `cockpit-table-actions.test.ts`.

> **Note:** Spec mentions `TicketsTab.test.ts` — it does **not** exist in the repo. The create-form coverage currently lives only inside `TicketsTab.svelte` (no test). New coverage goes into `TicketCreateModal.test.ts`.

---

## Phase 1 — Vorbereitung (read + verify, no code changes)

### Task 0: Orient in the existing cockpit

**Files:** (read-only)

- [ ] **Step 1: Read the components being rewritten/deleted**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
sed -n '1,120p' website/src/components/admin/Cockpit.svelte
sed -n '1,99p' website/src/lib/stores/cockpitStore.ts
sed -n '1,141p' website/src/components/admin/FeatureWorkbench.svelte
sed -n '1,70p' website/src/components/admin/TicketRow.svelte
sed -n '1,70p' website/src/components/admin/TicketDrawer.svelte
sed -n '1,615p' website/src/components/admin/TicketsTab.svelte
```
Expected: confirm the API call patterns — transition `POST /api/admin/tickets/:id/transition` (body `{status}` in TicketsTableBody, `{newStatus}` in FeatureWorkbench — **see Step 3**), priority patch `PATCH /api/admin/tickets/:id` body `{priority}`, reorder `POST /api/admin/cockpit/reorder` body `{updates:[{ticketId,planningRank}]}`, batch `POST /api/admin/cockpit/batch` body `{ticketIds,mutation}`, create `POST /api/admin/tickets` body `{type,title,description?,priority,component?}`.

- [ ] **Step 2: Confirm the transition payload contract**

Run:
```bash
sed -n '1,80p' website/src/pages/api/admin/tickets/\[id\]/transition.ts
```
Expected: read which key the endpoint accepts (`status` vs `newStatus`). **Use whatever the endpoint actually reads** in `cockpit-table-actions.ts`. If it accepts `status`, use `{ status }`; the FeatureWorkbench `{newStatus}` form may be stale. Record the answer in a code comment in the helper module.

- [ ] **Step 3: Confirm the baseline + gates state**

Run:
```bash
jq -r '.["S1:website/src/components/admin/TicketsTab.svelte"]' docs/code-quality/baseline.json
git branch --show-current
```
Expected: `{"metric":615,...}` and `feature/cockpit-ux-redesign`. No commit in this task.

---

## Phase 2 — Store-Migration (cockpitStore simplification)

### Task 1: Simplify `cockpitStore.ts` (remove lens/mode/currentProduct)

**Files:**
- Modify: `website/src/lib/stores/cockpitStore.ts`
- Test: `website/src/lib/stores/cockpitStore.test.ts`

- [ ] **Step 1: Rewrite the store test for the new shape**

Replace the entire contents of `website/src/lib/stores/cockpitStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('cockpitStore', () => {
  it('starts with no selected feature and no active ticket', async () => {
    const m = await import('./cockpitStore');
    const s = get(m.cockpitStore);
    expect(s.selectedFeature).toBeNull();
    expect(s.activeTicket).toBeNull();
    expect(s.selectedTickets.size).toBe(0);
  });
  it('selectFeature sets selectedFeature and persists to localStorage', async () => {
    const m = await import('./cockpitStore');
    m.selectFeature('F-AUTH');
    expect(get(m.cockpitStore).selectedFeature).toBe('F-AUTH');
    expect(localStorage.getItem('cockpit:feature')).toBe('F-AUTH');
  });
  it('selectFeature(null) clears the persisted value', async () => {
    const m = await import('./cockpitStore');
    m.selectFeature('F-AUTH');
    m.selectFeature(null);
    expect(get(m.cockpitStore).selectedFeature).toBeNull();
    expect(localStorage.getItem('cockpit:feature')).toBeNull();
  });
  it('setActiveTicket sets and clears the drawer target', async () => {
    const m = await import('./cockpitStore');
    m.setActiveTicket('t1');
    expect(get(m.cockpitStore).activeTicket).toBe('t1');
    m.setActiveTicket(null);
    expect(get(m.cockpitStore).activeTicket).toBeNull();
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

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd website && pnpm vitest run src/lib/stores/cockpitStore.test.ts`
Expected: FAIL — `selectFeature`/`setActiveTicket` undefined or `selectedFeature` not present.

- [ ] **Step 3: Rewrite `cockpitStore.ts`**

Replace the entire contents of `website/src/lib/stores/cockpitStore.ts`:

```ts
import { writable, derived, get } from 'svelte/store';

export interface OptimisticEdit {
  ticketId: string; field: string; oldValue: unknown; newValue: unknown;
}
export interface CockpitState {
  selectedFeature: string | null;
  activeTicket: string | null;
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
  selectedFeature: ls('cockpit:feature'),
  activeTicket: null,
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
  if (s.selectedFeature) u.searchParams.set('feature', s.selectedFeature);
  else u.searchParams.delete('feature');
  // legacy 4-tab params are dropped so old links normalise cleanly
  u.searchParams.delete('lens');
  u.searchParams.delete('mode');
  u.searchParams.delete('produkt');
  window.history.replaceState({}, '', u);
}

export function initStoreFromUrl(p: URLSearchParams): void {
  cockpitStore.update((s) => ({
    ...s,
    selectedFeature: p.get('feature') ?? s.selectedFeature,
  }));
}

export function selectFeature(extId: string | null): void {
  cockpitStore.update((s) => {
    const n = { ...s, selectedFeature: extId, selectedTickets: new Set<string>() };
    setLs('cockpit:feature', extId); syncUrl(n); return n;
  });
}
export function setActiveTicket(id: string | null): void {
  cockpitStore.update((s) => ({ ...s, activeTicket: id }));
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

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd website && pnpm vitest run src/lib/stores/cockpitStore.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/stores/cockpitStore.ts website/src/lib/stores/cockpitStore.test.ts
git commit -m "refactor(cockpit): simplify store — drop lens/mode/currentProduct"
```

---

### Task 2: Extend `cockpit-types.ts` with table/detail fields

**Files:**
- Modify: `website/src/lib/tickets/cockpit-types.ts`

- [ ] **Step 1: Add optional fields to `TicketRow`**

In `website/src/lib/tickets/cockpit-types.ts`, the `TicketRow` interface (currently lines 37-48) gains three optional fields. Replace the interface with:

```ts
export interface TicketRow {
  id: string;
  extId: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  parentId?: string;
  planningRank?: number;
  estimateMinutes?: number;
  timeLoggedMinutes?: number;
  description?: string;
  component?: string;
  createdAt?: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors referencing `cockpit-types.ts`. (Pre-existing unrelated errors elsewhere are out of scope — only check the file you touched is clean.)

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets/cockpit-types.ts
git commit -m "feat(cockpit): extend TicketRow type with description/component/createdAt"
```

---

## Phase 3 — Pure action helpers (extracted to keep CockpitTable lean)

### Task 3: Create `cockpit-table-actions.ts`

**Files:**
- Create: `website/src/lib/tickets/cockpit-table-actions.ts`
- Test: `website/src/lib/tickets/cockpit-table-actions.test.ts`

> **Why a separate module:** keeps `CockpitTable.svelte` under its 500-line `.svelte` limit and makes mutation logic unit-testable without rendering. S2-safe: imports only the `cockpit-types` types, never the store or any UI.

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/tickets/cockpit-table-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actions from './cockpit-table-actions';

beforeEach(() => vi.restoreAllMocks());

describe('cockpit-table-actions', () => {
  it('transitionTicket POSTs to the transition endpoint and returns true on 200', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const ok = await actions.transitionTicket('t1', 'done');
    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition',
      expect.objectContaining({ method: 'POST' }));
  });
  it('transitionTicket returns false on non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    expect(await actions.transitionTicket('t1', 'done')).toBe(false);
  });
  it('patchPriority PATCHes the ticket', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.patchPriority('t1', 'hoch');
    expect(spy).toHaveBeenCalledWith('/api/admin/tickets/t1',
      expect.objectContaining({ method: 'PATCH' }));
  });
  it('reorderTickets POSTs planningRank updates', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.reorderTickets([{ id: 'a' }, { id: 'b' }] as any);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(spy).toHaveBeenCalledWith('/api/admin/cockpit/reorder', expect.anything());
    expect(body.updates).toEqual([
      { ticketId: 'a', planningRank: 0 }, { ticketId: 'b', planningRank: 1 }]);
  });
  it('runBatch POSTs ticketIds + mutation', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.runBatch(['t1', 't2'], { status: 'done' });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(spy).toHaveBeenCalledWith('/api/admin/cockpit/batch', expect.anything());
    expect(body).toEqual({ ticketIds: ['t1', 't2'], mutation: { status: 'done' } });
  });
  it('createTicket POSTs the form payload and returns the parsed body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'new1' }), { status: 200 }));
    const r = await actions.createTicket({ type: 'task', title: 'X', priority: 'mittel' });
    expect(r.ok).toBe(true);
    expect(r.body).toEqual({ id: 'new1' });
  });
  it('createTicket returns ok:false + error on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));
    const r = await actions.createTicket({ type: 'task', title: 'X', priority: 'mittel' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets/cockpit-table-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper module**

Create `website/src/lib/tickets/cockpit-table-actions.ts`:

```ts
// Pure async mutation helpers for the Projekt-Cockpit table.
// S2-safe: imports types only — never the store, never UI components.
// NOTE: the transition endpoint reads `status` (verified in Task 0 Step 2);
// if it ever reads `newStatus`, change ONLY the body key below.
import type { TicketRow } from './cockpit-types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function transitionTicket(id: string, status: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}/transition`, {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ status }),
  });
  return res.ok;
}

export async function patchPriority(id: string, priority: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ priority }),
  });
  return res.ok;
}

export async function patchTitle(id: string, title: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ title }),
  });
  return res.ok;
}

export async function patchDescription(id: string, description: string): Promise<boolean> {
  const res = await fetch(`/api/admin/tickets/${id}`, {
    method: 'PATCH', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ description }),
  });
  return res.ok;
}

export async function reorderTickets(ordered: TicketRow[]): Promise<boolean> {
  const updates = ordered.map((t, i) => ({ ticketId: t.id, planningRank: i }));
  const res = await fetch('/api/admin/cockpit/reorder', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ updates }),
  });
  return res.ok;
}

export async function runBatch(
  ticketIds: string[], mutation: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/admin/cockpit/batch', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({ ticketIds, mutation }),
  });
  return res.ok;
}

export interface CreatePayload {
  type: string; title: string; priority: string;
  description?: string; component?: string; parentId?: string;
}
export interface CreateResult { ok: boolean; body?: unknown; error?: string; }

export async function createTicket(p: CreatePayload): Promise<CreateResult> {
  const res = await fetch('/api/admin/tickets', {
    method: 'POST', headers: JSON_HEADERS, credentials: 'same-origin',
    body: JSON.stringify({
      type: p.type, title: p.title.trim(), priority: p.priority,
      description: p.description?.trim() || undefined,
      component: p.component?.trim() || undefined,
      parentId: p.parentId || undefined,
    }),
  });
  let body: unknown; try { body = await res.json(); } catch { body = undefined; }
  if (!res.ok) {
    const err = (body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    return { ok: false, error: err };
  }
  return { ok: true, body };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd website && pnpm vitest run src/lib/tickets/cockpit-table-actions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets/cockpit-table-actions.ts website/src/lib/tickets/cockpit-table-actions.test.ts
git commit -m "feat(cockpit): add pure table action helpers (transition/patch/reorder/batch/create)"
```

---

## Phase 4 — CockpitSidebar (tree + hamburger drawer)

### Task 4: Create `CockpitSidebar.svelte`

**Files:**
- Create: `website/src/components/admin/CockpitSidebar.svelte`
- Test: `website/src/components/admin/CockpitSidebar.test.ts`

**Contract:** props `portfolio: PortfolioPayload`, `selectedFeature: string | null`, `onSelectFeature: (extId: string) => void`. Product nodes are headings (not clickable filters); feature nodes are buttons that call `onSelectFeature` and show `(N Tickets)` from `feature.rollup.total`. A `☰` toggle button (only meaningful on mobile via CSS) opens a `.drawer-open` overlay; selecting a feature closes the drawer. `data-testid="cockpit-sidebar"`, hamburger `data-testid="sidebar-hamburger"`, each feature `data-testid="sidebar-feature"`.

- [ ] **Step 1: Write the failing test**

Create `website/src/components/admin/CockpitSidebar.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CockpitSidebar from './CockpitSidebar.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'System-Tests',
  rollup: { total: 7, done: 0, blocked: 0, inProgress: 0, open: 7, pctDone: 0 },
  features: [
    { id: 'f1', extId: 'F-AUTH', title: 'Auth', priority: 'mittel', health: 'amber' as const,
      rollup: { total: 4, done: 0, blocked: 0, inProgress: 0, open: 4, pctDone: 0 } },
    { id: 'f2', extId: 'F-CRM', title: 'CRM', priority: 'mittel', health: 'green' as const,
      rollup: { total: 5, done: 0, blocked: 0, inProgress: 0, open: 5, pctDone: 0 } },
  ],
}]};

describe('CockpitSidebar', () => {
  it('renders product heading and feature nodes with ticket counts', () => {
    const { getByText, getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    expect(getByText('System-Tests')).toBeTruthy();
    expect(getAllByTestId('sidebar-feature')).toHaveLength(2);
    expect(getByText(/4 Tickets/)).toBeTruthy();
  });
  it('calls onSelectFeature with the feature extId on click', async () => {
    const onSelectFeature = vi.fn();
    const { getByText } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature });
    await fireEvent.click(getByText('Auth'));
    expect(onSelectFeature).toHaveBeenCalledWith('F-AUTH');
  });
  it('marks the selected feature active', () => {
    const { getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: 'F-CRM', onSelectFeature: () => {} });
    const active = getAllByTestId('sidebar-feature').filter(
      (el) => el.classList.contains('active'));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('CRM');
  });
  it('hamburger toggles the drawer-open class', async () => {
    const { getByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    const aside = getByTestId('cockpit-sidebar');
    expect(aside.classList.contains('drawer-open')).toBe(false);
    await fireEvent.click(getByTestId('sidebar-hamburger'));
    expect(aside.classList.contains('drawer-open')).toBe(true);
  });
  it('selecting a feature auto-closes the drawer', async () => {
    const { getByTestId, getByText } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    await fireEvent.click(getByTestId('sidebar-hamburger'));
    expect(getByTestId('cockpit-sidebar').classList.contains('drawer-open')).toBe(true);
    await fireEvent.click(getByText('Auth'));
    expect(getByTestId('cockpit-sidebar').classList.contains('drawer-open')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd website && pnpm vitest run src/components/admin/CockpitSidebar.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `CockpitSidebar.svelte`**

Create `website/src/components/admin/CockpitSidebar.svelte`:

```svelte
<script lang="ts">
  import type { PortfolioPayload } from '../../lib/tickets/cockpit-types';
  export let portfolio: PortfolioPayload;
  export let selectedFeature: string | null = null;
  export let onSelectFeature: (extId: string) => void;

  let drawerOpen = false;

  function pick(extId: string) {
    onSelectFeature(extId);
    drawerOpen = false; // auto-close on mobile after selection
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
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd website && pnpm vitest run src/components/admin/CockpitSidebar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Confirm S1 budget**

Run: `wc -l website/src/components/admin/CockpitSidebar.svelte`
Expected: ≤ 230 (well under the 500 `.svelte` limit). If somehow > 400, move the `<style>` block to a sibling and re-check — but it should be ~190.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/CockpitSidebar.svelte website/src/components/admin/CockpitSidebar.test.ts
git commit -m "feat(cockpit): add CockpitSidebar tree with mobile hamburger drawer"
```

---

## Phase 5 — TicketRow responsive columns

### Task 5: Extend `TicketRow.svelte` for responsive columns

**Files:**
- Modify: `website/src/components/admin/TicketRow.svelte`
- Test: `website/src/components/admin/TicketRow.test.ts`

**Goal:** keep the existing API (checkbox / drag handle / title button / status+priority selects, all callback props) but add: a priority left-border in ampel colour, and CSS classes (`ticket-col-id`, `ticket-col-created`) so the parent's media query can hide ID/created on mobile. Add an optional `createdAt` display.

- [ ] **Step 1: Extend the test (append, keep existing assertions working)**

Read the current test first: `cat website/src/components/admin/TicketRow.test.ts`. Then **append** these cases inside the existing `describe('TicketRow', ...)` block (or add a new `describe` at end of file):

```ts
import { render } from '@testing-library/svelte';
// (reuse the file's existing imports; only add what's missing)

describe('TicketRow responsive', () => {
  const base = { id: 't1', extId: 'T000412', title: 'OIDC Token', status: 'open',
    priority: 'hoch', type: 'task', createdAt: '2026-06-10T00:00:00Z' };

  it('renders the ext id inside a .ticket-col-id element', () => {
    const { container } = render(TicketRow, { ticket: base });
    const idCol = container.querySelector('.ticket-col-id');
    expect(idCol).toBeTruthy();
    expect(idCol!.textContent).toContain('T000412');
  });
  it('applies a priority class for the left border', () => {
    const { container } = render(TicketRow, { ticket: base });
    expect(container.querySelector('.row.prio-hoch')).toBeTruthy();
  });
  it('renders created date inside a .ticket-col-created element', () => {
    const { container } = render(TicketRow, { ticket: base });
    expect(container.querySelector('.ticket-col-created')).toBeTruthy();
  });
});
```

> If `TicketRow` is imported at the top of the existing test, reuse that import — do not double-import.

- [ ] **Step 2: Run it, verify the new cases fail**

Run: `cd website && pnpm vitest run src/components/admin/TicketRow.test.ts`
Expected: the three new cases FAIL (`.ticket-col-id` / `.prio-hoch` / `.ticket-col-created` not present); existing cases still PASS.

- [ ] **Step 3: Update `TicketRow.svelte`**

Replace the markup + style of `website/src/components/admin/TicketRow.svelte` (keep the `<script>` block exactly as-is, only add the `relDate` helper). New `<script>` tail, markup, and style:

In the `<script>`, add after the existing handlers (before `</script>`):

```ts
  function relDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days <= 0) return 'heute';
    if (days === 1) return 'gestern';
    return `vor ${days}T`;
  }
```

Replace the markup block (`<div class="row" ...> … </div>`) with:

```svelte
<div class="row prio-{ticket.priority}" class:selected aria-busy={busy}>
  <input type="checkbox" data-testid="row-checkbox" checked={selected}
    on:change={handleSelectToggle} aria-label={`Select ${ticket.title}`} />
  <span class="handle" draggable="true" role="button" tabindex="0" aria-label="Reorder (Shift+Up/Down)"
    on:dragstart={handleDragStart}>⋮⋮</span>
  <code class="ext ticket-col-id">{ticket.extId}</code>
  <button class="title-link" on:click={handleOpenDrawer}>{ticket.title}</button>
  <select data-testid="status-select" value={ticket.status} on:change={handleStatus} disabled={busy}>
    {#each STATUSES as s}<option value={s}>{s}</option>{/each}
  </select>
  <select data-testid="priority-select" value={ticket.priority} on:change={handlePriority} disabled={busy}>
    {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
  </select>
  <span class="created ticket-col-created">{relDate(ticket.createdAt)}</span>
</div>
```

Replace the `<style>` block with:

```svelte
<style>
  .row { display: grid;
    grid-template-columns: auto auto auto 1fr auto auto auto; gap: 0.5rem;
    align-items: center; padding: 0.4rem 0.5rem; border-bottom: 1px solid #2a2e37;
    border-left: 3px solid transparent; }
  .row.selected { background: rgba(110,168,254,0.12); }
  .row.prio-niedrig { border-left-color: #10b981; }
  .row.prio-mittel  { border-left-color: #f59e0b; }
  .row.prio-hoch    { border-left-color: #f97316; }
  .row.prio-kritisch{ border-left-color: #ef4444; }
  .handle { cursor: grab; opacity: 0.5; }
  .title-link { background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0; }
  .ext { opacity: 0.6; font-size: 0.75rem; font-family: var(--font-mono, monospace); }
  .created { opacity: 0.6; font-size: 0.72rem; white-space: nowrap; }

  @media (max-width: 767px) {
    .row { grid-template-columns: auto auto 1fr auto; }
    .ticket-col-id, .ticket-col-created { display: none; }
    .row :global([data-testid="priority-select"]) { display: none; }
  }
</style>
```

> Mobile keeps checkbox + handle + title + status (priority is conveyed by the left border per spec). The `:global()` on the priority select is needed because the `data-testid` selector targets a child element.

- [ ] **Step 4: Run it, verify all pass**

Run: `cd website && pnpm vitest run src/components/admin/TicketRow.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/TicketRow.svelte website/src/components/admin/TicketRow.test.ts
git commit -m "feat(cockpit): TicketRow responsive columns + priority left-border"
```

---

## Phase 6 — CockpitTable (toolbar + table + bulk bar)

### Task 6: Create `CockpitTable.svelte`

**Files:**
- Create: `website/src/components/admin/CockpitTable.svelte`
- Test: `website/src/components/admin/CockpitTable.test.ts`

**Contract:** props
- `feature: FeatureNode | null`
- `tickets: TicketRow[]`
- `features: FeatureNode[]` (for the bulk reparent select)
- `onMutated?: () => void`
- `onOpenDrawer?: (detail: { ticket: TicketRow }) => void`
- `onOpenCreate?: () => void`

Owns: search input (live filter on title), status filter chips (`Alle | Offen | In Arbeit | Review | Blockiert | Erledigt` → status values `'' | open | in_progress | in_review | blocked | done`), a `+ Ticket` button (calls `onOpenCreate`), the rows (one `TicketRow` each, with optimistic status/priority via `cockpit-table-actions`), keyboard reorder (Shift+Arrow) + drag reorder (ported from FeatureWorkbench), and the existing `BulkBar`. `data-testid="cockpit-table"`, search `data-testid="table-search"`, each chip `data-testid="status-chip"`, `+ Ticket` `data-testid="open-create"`.

- [ ] **Step 1: Write the failing test**

Create `website/src/components/admin/CockpitTable.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CockpitTable from './CockpitTable.svelte';

const feature = { id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
  rollup: { total: 2, done: 0, blocked: 0, inProgress: 0, open: 2, pctDone: 0 } };
const tickets = [
  { id: 't1', extId: 'T1', title: 'Alpha', status: 'open', priority: 'mittel', type: 'task' },
  { id: 't2', extId: 'T2', title: 'Beta', status: 'in_progress', priority: 'hoch', type: 'task' },
];

beforeEach(() => vi.restoreAllMocks());

describe('CockpitTable', () => {
  it('renders a row per ticket', () => {
    const { getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    expect(getAllByTestId('row-checkbox')).toHaveLength(2);
  });
  it('filters rows live by search term', async () => {
    const { getByTestId, getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    await fireEvent.input(getByTestId('table-search'), { target: { value: 'alpha' } });
    expect(getAllByTestId('row-checkbox')).toHaveLength(1);
  });
  it('filters by status chip', async () => {
    const { getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    const chips = getAllByTestId('status-chip');
    const inArbeit = chips.find((c) => /in arbeit/i.test(c.textContent ?? ''))!;
    await fireEvent.click(inArbeit);
    expect(getAllByTestId('row-checkbox')).toHaveLength(1); // only the in_progress ticket
  });
  it('calls onOpenCreate when + Ticket is clicked', async () => {
    const onOpenCreate = vi.fn();
    const { getByTestId } = render(CockpitTable, { feature, tickets, features: [feature], onOpenCreate });
    await fireEvent.click(getByTestId('open-create'));
    expect(onOpenCreate).toHaveBeenCalled();
  });
  it('optimistically transitions status then POSTs', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.change(getAllByTestId('status-select')[0], { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition', expect.objectContaining({ method: 'POST' })));
  });
  it('bulk-changes status via batch endpoint', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId, getByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.click(getAllByTestId('row-checkbox')[0]);
    await fireEvent.click(getAllByTestId('row-checkbox')[1]);
    await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/cockpit/batch', expect.objectContaining({ method: 'POST' })));
  });
  it('reorders via keyboard Shift+ArrowDown and POSTs reorder', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.keyDown(getAllByTestId('row-checkbox')[0], { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/cockpit/reorder', expect.objectContaining({ method: 'POST' })));
  });
  it('opens the drawer via row title click', async () => {
    const onOpenDrawer = vi.fn();
    const { getByText } = render(CockpitTable, { feature, tickets, features: [feature], onOpenDrawer });
    await fireEvent.click(getByText('Alpha'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd website && pnpm vitest run src/components/admin/CockpitTable.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `CockpitTable.svelte`**

Create `website/src/components/admin/CockpitTable.svelte`:

```svelte
<script lang="ts">
  import type { FeatureNode, TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, toggleTicketSelection, applyOptimistic, clearSelection } from '../../lib/stores/cockpitStore';
  import * as actions from '../../lib/tickets/cockpit-table-actions';
  import TicketRow from './TicketRow.svelte';
  import BulkBar from './BulkBar.svelte';

  export let feature: FeatureNode | null = null;
  export let tickets: TicketRowT[] = [];
  export let features: FeatureNode[] = [];
  export let onMutated: (() => void) | undefined = undefined;
  export let onOpenDrawer: ((detail: { ticket: TicketRowT }) => void) | undefined = undefined;
  export let onOpenCreate: (() => void) | undefined = undefined;

  let busy: Record<string, boolean> = {};
  let dragId: string | null = null;
  let search = '';
  let statusFilter = ''; // '' = Alle

  const CHIPS: { label: string; value: string }[] = [
    { label: 'Alle', value: '' },
    { label: 'Offen', value: 'open' },
    { label: 'In Arbeit', value: 'in_progress' },
    { label: 'Review', value: 'in_review' },
    { label: 'Blockiert', value: 'blocked' },
    { label: 'Erledigt', value: 'done' },
  ];

  $: selectedIds = [...$cockpitStore.selectedTickets];
  $: visible = tickets.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function patchStatus(id: string, status: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    if (await actions.transitionTicket(id, status)) { onMutated?.(); }
    else { t.status = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }

  async function patchPriority(id: string, priority: string) {
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.priority; t.priority = priority; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'priority', priority, old);
    if (await actions.patchPriority(id, priority)) { onMutated?.(); }
    else { t.priority = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }

  async function persistOrder() {
    const snapshot = [...tickets];
    if (await actions.reorderTickets(tickets)) { onMutated?.(); }
    else { tickets = snapshot; }
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
  function onDragStart(id: string) { dragId = id; }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = tickets.findIndex((t) => t.id === dragId);
    const to = tickets.findIndex((t) => t.id === targetId);
    const [moved] = tickets.splice(from, 1);
    tickets.splice(to, 0, moved);
    tickets = [...tickets]; dragId = null; persistOrder();
  }
  async function runBatch(mutation: Record<string, unknown>, ids: string[]) {
    if (await actions.runBatch(ids, mutation)) { clearSelection(); onMutated?.(); }
  }
</script>

<section class="cockpit-table" data-testid="cockpit-table">
  <div class="toolbar">
    <input class="search" data-testid="table-search" type="search"
      placeholder="Suche…" bind:value={search} aria-label="Tickets durchsuchen" />
    <div class="chips" role="group" aria-label="Status-Filter">
      {#each CHIPS as c}
        <button class="chip" class:active={statusFilter === c.value}
          data-testid="status-chip" on:click={() => (statusFilter = c.value)}>{c.label}</button>
      {/each}
    </div>
    <button class="create" data-testid="open-create" on:click={() => onOpenCreate?.()}>+ Ticket</button>
  </div>

  <div class="rows">
    {#each visible as t (t.id)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div role="listitem" on:keydown={(e) => onRowKey(e, t.id)}
           on:dragover|preventDefault on:drop={() => onDrop(t.id)}>
        <TicketRow ticket={t} busy={busy[t.id]}
          selected={$cockpitStore.selectedTickets.has(t.id)}
          onStatusChange={(d) => patchStatus(d.id, d.status)}
          onPriorityChange={(d) => patchPriority(d.id, d.priority)}
          onSelectToggle={(d) => toggleTicketSelection(d.id)}
          onDragStart={(d) => onDragStart(d.id)}
          onOpenDrawer={(d) => onOpenDrawer?.(d)} />
      </div>
    {/each}
    {#if visible.length === 0}<p class="empty">Keine Tickets</p>{/if}
  </div>

  <BulkBar selectedIds={selectedIds} {features}
    onBulkStatus={(d) => runBatch({ status: d.status }, d.ids)}
    onBulkPriority={(d) => runBatch({ priority: d.priority }, d.ids)}
    onBulkReparent={(d) => runBatch({ parentId: d.parentId }, d.ids)}
    onBulkEnqueue={(d) => runBatch({ enqueue: true }, d.ids)}
    onClear={clearSelection} />
</section>

<style>
  .cockpit-table { display: flex; flex-direction: column; gap: 0.5rem; min-height: 0; }
  .toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .search { flex: 1 1 180px; min-width: 140px; background: var(--admin-bg, #1c1f26);
    border: 1px solid var(--admin-border, #2a2e37); color: inherit; border-radius: 6px; padding: 0.4rem 0.6rem; }
  .chips { display: flex; gap: 0.25rem; overflow-x: auto; }
  .chip { background: transparent; border: 1px solid var(--admin-border, #2a2e37);
    color: var(--admin-text-mute, #9ca3af); border-radius: 999px; padding: 0.25rem 0.65rem;
    font-size: 0.78rem; cursor: pointer; white-space: nowrap; }
  .chip.active { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12); border-color: transparent; font-weight: 600; }
  .create { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12);
    border: none; border-radius: 6px; padding: 0.4rem 0.8rem; cursor: pointer; font-weight: 600; white-space: nowrap; }
  .rows { display: flex; flex-direction: column; }
  .empty { opacity: 0.6; padding: 0.5rem; }
</style>
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd website && pnpm vitest run src/components/admin/CockpitTable.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Confirm S1 budget**

Run: `wc -l website/src/components/admin/CockpitTable.svelte`
Expected: ≤ 300 (under 500 limit). If > 400, move `persistOrder/moveBy/onDrop` reorder glue into a small `cockpit-reorder.ts` helper — but it should land ~210.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/CockpitTable.svelte website/src/components/admin/CockpitTable.test.ts
git commit -m "feat(cockpit): add CockpitTable (toolbar + search/status filters + bulk + reorder)"
```

---

## Phase 7 — TicketCreateModal

### Task 7: Create `TicketCreateModal.svelte`

**Files:**
- Create: `website/src/components/admin/TicketCreateModal.svelte`
- Test: `website/src/components/admin/TicketCreateModal.test.ts`

**Contract:** props
- `open: boolean`
- `features: FeatureNode[]` (for the Feature select)
- `defaultFeatureId?: string | null` (prefill from sidebar selection)
- `onClose: () => void`
- `onCreated?: (detail: { id?: string }) => void`

Fields per spec: Feature (select), Typ (task/bug/feature/project), Titel (required), Beschreibung (textarea), Priorität (niedrig/mittel/hoch/kritisch), Komponente (input). Submit disabled while title empty or in-flight. On success: call `onCreated` then `onClose`. Uses `actions.createTicket`. `data-testid="create-modal"`, title input `data-testid="create-title"`, submit `data-testid="create-submit"`.

- [ ] **Step 1: Write the failing test**

Create `website/src/components/admin/TicketCreateModal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketCreateModal from './TicketCreateModal.svelte';

const features = [
  { id: 'f1', extId: 'F1', title: 'Auth', priority: 'mittel', health: 'green' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } },
];

beforeEach(() => vi.restoreAllMocks());

describe('TicketCreateModal', () => {
  it('renders nothing when open=false', () => {
    const { queryByTestId } = render(TicketCreateModal,
      { open: false, features, onClose: () => {} });
    expect(queryByTestId('create-modal')).toBeNull();
  });
  it('renders the form when open=true', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    expect(getByTestId('create-modal')).toBeTruthy();
    expect(getByTestId('create-title')).toBeTruthy();
  });
  it('disables submit while the title is empty', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    expect((getByTestId('create-submit') as HTMLButtonElement).disabled).toBe(true);
  });
  it('POSTs the payload and calls onCreated + onClose on success', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'new1' }), { status: 200 }));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose, onCreated });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'Neues Ticket' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });
  it('shows an error and stays open on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));
    const onClose = vi.fn();
    const { getByTestId, getByText } = render(TicketCreateModal,
      { open: true, features, onClose });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'X' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(getByText('boom')).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd website && pnpm vitest run src/components/admin/TicketCreateModal.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `TicketCreateModal.svelte`**

Create `website/src/components/admin/TicketCreateModal.svelte`:

```svelte
<script lang="ts">
  import type { FeatureNode } from '../../lib/tickets/cockpit-types';
  import { createTicket } from '../../lib/tickets/cockpit-table-actions';

  export let open = false;
  export let features: FeatureNode[] = [];
  export let defaultFeatureId: string | null = null;
  export let onClose: () => void;
  export let onCreated: ((detail: { id?: string }) => void) | undefined = undefined;

  let parentId = '';
  let type = 'task';
  let title = '';
  let description = '';
  let priority = 'mittel';
  let component = '';
  let creating = false;
  let error: string | null = null;

  $: if (open && defaultFeatureId && !parentId) parentId = defaultFeatureId;
  $: canCreate = title.trim().length > 0 && !creating;

  function close() {
    onClose();
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canCreate) return;
    creating = true; error = null;
    const r = await createTicket({ type, title, priority, description, component,
      parentId: parentId || undefined });
    creating = false;
    if (!r.ok) { error = r.error ?? 'Fehler'; return; }
    title = ''; description = ''; component = '';
    onCreated?.({ id: (r.body as { id?: string } | undefined)?.id });
    close();
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="backdrop" role="presentation" on:click={close}></div>
  <div class="create-modal" data-testid="create-modal" role="dialog" aria-modal="true" aria-label="Ticket erstellen">
    <header><h3>Neues Ticket</h3>
      <button class="close" aria-label="Schließen" on:click={close}>×</button></header>

    <form on:submit={submit}>
      <label>Feature
        <select bind:value={parentId}>
          <option value="">— kein Feature —</option>
          {#each features as f (f.id)}<option value={f.id}>{f.title}</option>{/each}
        </select>
      </label>
      <label>Typ
        <select bind:value={type}>
          <option value="task">Aufgabe</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="project">Projekt</option>
        </select>
      </label>
      <label>Titel *
        <input data-testid="create-title" type="text" bind:value={title}
          placeholder="Kurzer Titel…" required />
      </label>
      <label>Beschreibung
        <textarea bind:value={description} rows="3" placeholder="Details…"></textarea>
      </label>
      <label>Priorität
        <select bind:value={priority}>
          <option value="niedrig">Niedrig</option>
          <option value="mittel">Mittel</option>
          <option value="hoch">Hoch</option>
          <option value="kritisch">Kritisch</option>
        </select>
      </label>
      <label>Komponente
        <input type="text" bind:value={component} placeholder="z.B. website, auth…" />
      </label>

      {#if error}<p class="error">{error}</p>{/if}

      <footer>
        <button type="button" on:click={close}>Abbrechen</button>
        <button type="submit" class="primary" data-testid="create-submit" disabled={!canCreate}>
          {creating ? 'Wird erstellt…' : 'Erstellen →'}
        </button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 70; }
  .create-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(480px, 92vw); max-height: 90vh; overflow-y: auto; z-index: 75;
    background: var(--admin-surface, #14171d); border: 1px solid var(--admin-border, #2a2e37);
    border-radius: 12px; padding: 1rem; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  form { display: flex; flex-direction: column; gap: 0.6rem; }
  label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--admin-text-mute, #9ca3af); }
  input, select, textarea { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37);
    color: var(--admin-text, #e5e7eb); border-radius: 6px; padding: 0.4rem 0.55rem; font: inherit; }
  .error { color: #ef4444; font-size: 0.82rem; margin: 0; }
  footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
  .primary { background: var(--admin-primary, #6ea8fe); color: var(--admin-bg, #0b0d12); border: none;
    border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; font-weight: 600; }
  .primary:disabled { opacity: 0.4; cursor: not-allowed; }
  button { background: var(--admin-bg, #1c1f26); border: 1px solid var(--admin-border, #2a2e37);
    color: inherit; border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; }

  @media (max-width: 767px) {
    .create-modal { top: auto; bottom: 0; left: 0; transform: none;
      width: 100%; max-height: 85vh; border-radius: 12px 12px 0 0; }
  }
</style>
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd website && pnpm vitest run src/components/admin/TicketCreateModal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Confirm S1 budget**

Run: `wc -l website/src/components/admin/TicketCreateModal.svelte`
Expected: ≤ 260 (under 500). It should land ~190.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/TicketCreateModal.svelte website/src/components/admin/TicketCreateModal.test.ts
git commit -m "feat(cockpit): add TicketCreateModal (modal on desktop, bottom-sheet on mobile)"
```

---

## Phase 8 — TicketDrawer (status transitions + inline edit + mobile)

### Task 8: Extend `TicketDrawer.svelte`

**Files:**
- Modify: `website/src/components/admin/TicketDrawer.svelte`
- Test: `website/src/components/admin/TicketDrawer.test.ts`

**Goal (keep existing title-edit + close + Escape):** add a metadata block (Status, Priorität, Typ, Erstellt), status-transition buttons (`→ In Arbeit`, `→ Review`, `→ Erledigt`) wired to `actions.transitionTicket`, an inline-editable description, and mobile full-screen styling. Keep the existing `data-testid="ticket-drawer"`, add transition buttons `data-testid="drawer-transition"` and description field `data-testid="drawer-description"`.

- [ ] **Step 1: Extend the test**

Read the current test (`cat website/src/components/admin/TicketDrawer.test.ts`) to reuse imports/setup. Then **append** these cases (new `describe` at file end):

```ts
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketDrawer from './TicketDrawer.svelte';

describe('TicketDrawer transitions + inline edit', () => {
  const ticket = { id: 't1', extId: 'T000412', title: 'OIDC', status: 'open',
    priority: 'hoch', type: 'task', description: 'old desc' };

  it('renders status-transition buttons', () => {
    const { getAllByTestId } = render(TicketDrawer, { ticket, open: true });
    expect(getAllByTestId('drawer-transition').length).toBeGreaterThanOrEqual(3);
  });
  it('POSTs a transition when a status button is clicked', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByText } = render(TicketDrawer, { ticket: { ...ticket }, open: true });
    await fireEvent.click(getByText('→ Erledigt'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition', expect.objectContaining({ method: 'POST' })));
  });
  it('saves an inline description edit via PATCH', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByTestId } = render(TicketDrawer, { ticket: { ...ticket }, open: true });
    await fireEvent.input(getByTestId('drawer-description'), { target: { value: 'new desc' } });
    await fireEvent.blur(getByTestId('drawer-description'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1', expect.objectContaining({ method: 'PATCH' })));
  });
});
```

> `vi` is already imported in the existing test; do not re-import it. If the existing file lacks `vi`, add it to its import line.

- [ ] **Step 2: Run it, verify the new cases fail**

Run: `cd website && pnpm vitest run src/components/admin/TicketDrawer.test.ts`
Expected: new cases FAIL; existing title-edit/close cases still PASS.

- [ ] **Step 3: Update `TicketDrawer.svelte`**

Replace the entire contents of `website/src/components/admin/TicketDrawer.svelte`:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TicketRow as TicketRowT } from '../../lib/tickets/cockpit-types';
  import { transitionTicket, patchTitle, patchDescription } from '../../lib/tickets/cockpit-table-actions';
  export let ticket: TicketRowT | null;
  export let open = false;
  export let onClose: (() => void) | undefined = undefined;
  export let onMutated: ((detail: { ticketId: string }) => void) | undefined = undefined;
  const dispatch = createEventDispatcher();

  let title = '';
  let description = '';
  let saving = false;
  let error: string | null = null;
  $: if (ticket) { title = ticket.title; description = ticket.description ?? ''; }

  const TRANSITIONS = [
    { label: '→ In Arbeit', status: 'in_progress' },
    { label: '→ Review', status: 'in_review' },
    { label: '→ Erledigt', status: 'done' },
  ];

  function close() { onClose?.(); dispatch('close'); }
  function notify() {
    if (!ticket) return;
    const detail = { ticketId: ticket.id };
    onMutated?.(detail); dispatch('mutated', detail);
  }

  async function saveTitle() {
    if (!ticket) return;
    const old = ticket.title; saving = true; error = null;
    if (await patchTitle(ticket.id, title)) { ticket = { ...ticket, title }; notify(); }
    else { title = old; error = 'Titel konnte nicht gespeichert werden.'; }
    saving = false;
  }
  async function saveDescription() {
    if (!ticket) return;
    if (description === (ticket.description ?? '')) return;
    const old = ticket.description ?? ''; saving = true; error = null;
    if (await patchDescription(ticket.id, description)) { ticket = { ...ticket, description }; notify(); }
    else { description = old; error = 'Beschreibung konnte nicht gespeichert werden.'; }
    saving = false;
  }
  async function transition(status: string) {
    if (!ticket) return;
    saving = true; error = null;
    if (await transitionTicket(ticket.id, status)) { ticket = { ...ticket, status }; notify(); }
    else { error = 'Statuswechsel fehlgeschlagen.'; }
    saving = false;
  }
  async function archive() { await transition('archived'); }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if open && ticket}
  <div class="backdrop" on:click={close} role="presentation"></div>
  <aside class="drawer" data-testid="ticket-drawer" aria-label="Ticket-Details">
    <header>
      <button class="back" aria-label="Zurück" on:click={close}>←</button>
      <h3>{ticket.extId}</h3>
      <button class="close" aria-label="Schließen" on:click={close}>×</button>
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <label class="fld">Titel
      <input bind:value={title} on:blur={saveTitle} />
    </label>

    <dl class="meta">
      <dt>Status</dt><dd>{ticket.status}</dd>
      <dt>Priorität</dt><dd>{ticket.priority}</dd>
      <dt>Typ</dt><dd>{ticket.type}</dd>
      {#if ticket.createdAt}<dt>Erstellt</dt><dd>{ticket.createdAt.slice(0, 10)}</dd>{/if}
    </dl>

    <label class="fld">Beschreibung
      <textarea data-testid="drawer-description" rows="4"
        bind:value={description} on:blur={saveDescription}></textarea>
    </label>

    <div class="transitions">
      {#each TRANSITIONS as tr}
        <button data-testid="drawer-transition" disabled={saving}
          on:click={() => transition(tr.status)}>{tr.label}</button>
      {/each}
    </div>

    <footer>
      <button on:click={archive} disabled={saving}>Archivieren</button>
      <button on:click={close}>Schließen</button>
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }
  .drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(400px, 90vw);
    background: #14171d; z-index: 50; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
    overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .back { display: none; background: none; border: none; color: inherit; font-size: 1.3rem; cursor: pointer; }
  .close { background: none; border: none; color: inherit; font-size: 1.4rem; cursor: pointer; }
  .fld { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
  input, textarea { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; padding: 0.4rem; border-radius: 4px; font: inherit; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0; font-size: 0.82rem; }
  .meta dt { color: #9ca3af; } .meta dd { margin: 0; }
  .transitions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .transitions button { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; border-radius: 6px;
    padding: 0.35rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
  .error { color: #ef4444; font-size: 0.85rem; margin: 0; }
  footer { margin-top: auto; display: flex; gap: 0.5rem; }
  footer button { background: #1c1f26; border: 1px solid #2a2e37; color: inherit; border-radius: 6px;
    padding: 0.4rem 0.8rem; cursor: pointer; }

  @media (max-width: 767px) {
    .drawer { inset: 0; width: 100%; height: 100%; }
    .back { display: inline-block; }
    .close { display: none; }
  }
</style>
```

- [ ] **Step 4: Run it, verify all pass**

Run: `cd website && pnpm vitest run src/components/admin/TicketDrawer.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Confirm S1 budget**

Run: `wc -l website/src/components/admin/TicketDrawer.svelte`
Expected: ≤ 200 (under 500).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/TicketDrawer.svelte website/src/components/admin/TicketDrawer.test.ts
git commit -m "feat(cockpit): TicketDrawer — status transitions, inline desc edit, mobile full-screen"
```

---

## Phase 9 — Cockpit.svelte shell (assemble; drop 4-tab)

### Task 9: Rewrite `Cockpit.svelte`

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte`
- Test: `website/src/components/admin/Cockpit.test.ts`
- Test: `website/src/components/admin/CockpitShell.integration.test.ts`

**Behaviour:** on mount, hydrate store from URL + load portfolio (kept). If a feature is preselected (URL/localStorage) load its tickets. Render `CockpitSidebar` + `CockpitTable` side by side; `TicketCreateModal` + `TicketDrawer` overlay. Selecting a feature in the sidebar loads `GET /api/admin/cockpit/feature?id=`. Empty portfolio → `EmptyStateCockpit`. No lens/mode toggles.

- [ ] **Step 1: Rewrite `Cockpit.test.ts`**

Replace the entire contents of `website/src/components/admin/Cockpit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolioWithFeature = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }],
}]};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Cockpit shell', () => {
  it('renders the sidebar and table (no lens/mode toggles)', () => {
    const { getByTestId, queryByRole } = render(Cockpit,
      { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    expect(getByTestId('cockpit-sidebar')).toBeTruthy();
    expect(getByTestId('cockpit-table')).toBeTruthy();
    expect(queryByRole('button', { name: /karten/i })).toBeNull();
    expect(queryByRole('button', { name: /werkbank/i })).toBeNull();
  });
  it('shows the empty state when no products', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: { products: [] }, brand: 'mentolder' });
    expect(getByTestId('cockpit-empty')).toBeTruthy();
  });
  it('loads feature tickets when a sidebar feature is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      feature: portfolioWithFeature.products[0].features[0],
      tickets: [{ id: 't1', extId: 'T1', title: 'Alpha', status: 'open', priority: 'mittel', type: 'task' }],
    }), { status: 200 }));
    const { getByText, getByTestId } = render(Cockpit,
      { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    await waitFor(() => expect(getByText('Alpha')).toBeTruthy());
    expect(getByTestId('cockpit-table')).toBeTruthy();
  });
  it('opens the create modal from the table + Ticket button', async () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    await fireEvent.click(getByTestId('open-create'));
    expect(getByTestId('create-modal')).toBeTruthy();
  });
});
```

> Note `EmptyStateCockpit` must render `data-testid="cockpit-empty"` — confirm via `cat website/src/components/admin/EmptyStateCockpit.svelte`; it already does (used by the old test).

- [ ] **Step 2: Rewrite `CockpitShell.integration.test.ts`**

Replace the entire contents of `website/src/components/admin/CockpitShell.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }],
}]};

beforeEach(() => localStorage.clear());

describe('Cockpit shell integration', () => {
  it('persists the selected feature to localStorage', async () => {
    const { getByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
  });
});
```

- [ ] **Step 3: Run both tests, verify they fail**

Run: `cd website && pnpm vitest run src/components/admin/Cockpit.test.ts src/components/admin/CockpitShell.integration.test.ts`
Expected: FAIL — `Cockpit.svelte` still renders lens/mode toggles + mounts deleted components.

- [ ] **Step 4: Rewrite `Cockpit.svelte`**

Replace the entire contents of `website/src/components/admin/Cockpit.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { PortfolioPayload, FeatureTickets, TicketRow } from '../../lib/tickets/cockpit-types';
  import { cockpitStore, selectFeature, setActiveTicket, initStoreFromUrl, setLoading, setError }
    from '../../lib/stores/cockpitStore';
  import CockpitSidebar from './CockpitSidebar.svelte';
  import CockpitTable from './CockpitTable.svelte';
  import TicketCreateModal from './TicketCreateModal.svelte';
  import TicketDrawer from './TicketDrawer.svelte';
  import EmptyStateCockpit from './EmptyStateCockpit.svelte';

  export let portfolioInitial: PortfolioPayload | null = null;
  export let brand: string;

  let portfolio: PortfolioPayload | null = portfolioInitial;
  let featureData: FeatureTickets | null = null;
  let drawerTicket: TicketRow | null = null;
  let drawerOpen = false;
  let createOpen = false;

  $: allFeatures = portfolio?.products.flatMap((p) => p.features) ?? [];
  $: currentFeatureNode = allFeatures.find((f) => f.extId === $cockpitStore.selectedFeature) ?? null;

  onMount(async () => {
    if (typeof window !== 'undefined') initStoreFromUrl(new URL(window.location.href).searchParams);
    if (!portfolio) await loadPortfolio();
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
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

  async function loadFeature(extId: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/cockpit/feature?id=${encodeURIComponent(extId)}`);
      if (!res.ok) throw new Error(`feature ${res.status}`);
      featureData = await res.json();
    } catch (e) { setError(String((e as Error).message)); }
    finally { setLoading(false); }
  }

  async function pickFeature(extId: string) {
    selectFeature(extId);
    await loadFeature(extId);
  }

  async function refetch() {
    if ($cockpitStore.selectedFeature) await loadFeature($cockpitStore.selectedFeature);
    await loadPortfolio();
  }

  function openDrawer(detail: { ticket: TicketRow }) {
    drawerTicket = detail.ticket; drawerOpen = true; setActiveTicket(detail.ticket.id);
  }
  function closeDrawer() { drawerOpen = false; setActiveTicket(null); }
</script>

<div class="cockpit-shell" data-brand={brand}>
  {#if $cockpitStore.error}<div class="toast error">{$cockpitStore.error}</div>{/if}

  {#if portfolio && portfolio.products.length === 0}
    <EmptyStateCockpit />
  {:else if portfolio}
    <div class="layout">
      <CockpitSidebar {portfolio} selectedFeature={$cockpitStore.selectedFeature}
        onSelectFeature={pickFeature} />
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
  {/if}

  <TicketCreateModal open={createOpen} features={allFeatures}
    defaultFeatureId={currentFeatureNode?.id ?? null}
    onClose={() => (createOpen = false)}
    onCreated={refetch} />

  <TicketDrawer ticket={drawerTicket} open={drawerOpen}
    onClose={closeDrawer} onMutated={refetch} />
</div>

<style>
  .cockpit-shell { display: flex; flex-direction: column; gap: 0.75rem; }
  .layout { display: flex; gap: 1rem; align-items: flex-start; min-height: 60vh; }
  .main { flex: 1 1 auto; min-width: 0; }
  .toast.error { background: #ef4444; color: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
  .loading { opacity: 0.7; font-size: 0.85rem; margin-bottom: 0.5rem; }

  @media (max-width: 767px) {
    .layout { flex-direction: column; gap: 0.5rem; }
  }
</style>
```

- [ ] **Step 5: Run both tests, verify they pass**

Run: `cd website && pnpm vitest run src/components/admin/Cockpit.test.ts src/components/admin/CockpitShell.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm S1 budget**

Run: `wc -l website/src/components/admin/Cockpit.svelte`
Expected: ≤ 160 (under 500).

- [ ] **Step 7: Commit**

```bash
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts website/src/components/admin/CockpitShell.integration.test.ts
git commit -m "feat(cockpit): rewrite shell — sidebar + table, drop 4-tab lens/mode"
```

---

## Phase 10 — Remove dead components + their tests

### Task 10: Delete the obsolete components and tests

**Files:**
- Delete: `website/src/components/admin/TicketsTab.svelte`
- Delete: `website/src/components/admin/TicketsTableBody.svelte`
- Delete: `website/src/components/admin/FeatureWorkbench.svelte` + `FeatureWorkbench.test.ts`
- Delete: `website/src/components/admin/PortfolioGrid.svelte` + `PortfolioGrid.test.ts`
- Delete: `website/src/components/admin/FeatureCard.svelte` + `FeatureCard.test.ts`
- Delete: `website/src/components/admin/TicketQuickEdit.svelte`

- [ ] **Step 1: Verify no remaining imports reference the deletees**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
grep -rn "TicketsTab\b\|TicketsTableBody\|FeatureWorkbench\|PortfolioGrid\|FeatureCard\|TicketQuickEdit" website/src --include='*.svelte' --include='*.ts' --include='*.astro' \
  | grep -v '\.test\.ts' | grep -v 'TicketsTab.svelte\|TicketsTableBody.svelte\|FeatureWorkbench.svelte\|PortfolioGrid.svelte\|FeatureCard.svelte\|TicketQuickEdit.svelte'
```
Expected: **no output** (no production code imports them anymore). If `TicketsTableBody` is referenced by a non-cockpit page (e.g. an old `/admin/tickets/*` view), STOP and re-scope — only delete files with zero production importers. (Cockpit cutover already redirects `/admin/tickets` → cockpit, so `TicketsTableBody` should be unused; confirm.)

- [ ] **Step 2: Delete the files**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
git rm \
  website/src/components/admin/TicketsTab.svelte \
  website/src/components/admin/TicketsTableBody.svelte \
  website/src/components/admin/FeatureWorkbench.svelte \
  website/src/components/admin/FeatureWorkbench.test.ts \
  website/src/components/admin/PortfolioGrid.svelte \
  website/src/components/admin/PortfolioGrid.test.ts \
  website/src/components/admin/FeatureCard.svelte \
  website/src/components/admin/FeatureCard.test.ts \
  website/src/components/admin/TicketQuickEdit.svelte
```
Expected: nine files staged for deletion.

> If `git rm` reports a path that does not exist (e.g. `FeatureCard.test.ts`), drop it from the command and continue — the grep in Step 1 already confirmed which files exist.

- [ ] **Step 3: Run the full website unit suite**

Run: `cd website && pnpm vitest run 2>&1 | tail -30`
Expected: PASS — no broken imports, no references to deleted components. If a test still imports a deleted file, delete that test too (it belonged to a removed component) and re-run.

- [ ] **Step 4: Confirm no `:latest`/host violations introduced (none expected)**

Run: `cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux && node scripts/code-quality/check.mjs 2>&1 | tail -20`
Expected: no S1/S2/S3/S4 violations attributable to this change. (Baseline still lists `TicketsTab.svelte` — fixed in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cockpit): remove obsolete TicketsTab/Workbench/Portfolio/Card/QuickEdit + tests"
```

---

## Phase 11 — Verifikation (gates + regen + E2E smoke)

### Task 11: Regenerate artifacts and run the full offline gate suite

**Files:**
- Modify (generated): `docs/code-quality/baseline.json`, `website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json`, other freshness artifacts.
- Modify (E2E): `tests/e2e/fa-29-cockpit.spec.ts`

- [ ] **Step 1: Update the E2E spec for the new UI**

The live-prod E2E in `tests/e2e/fa-29-cockpit.spec.ts` asserts the OLD UI (`portfolio-grid`, `feature-card`, lens toggles, `?mode=tabelle`). Update it to the new shell. Replace its body's UI assertions:

- Replace `[data-testid="portfolio-grid"]` waits with `[data-testid="cockpit-sidebar"]` and `[data-testid="cockpit-table"]`.
- Remove the `toggles lens to Werkbank` test (no lenses).
- For `redirects /admin/tickets to cockpit`: keep the redirect assertion but relax the URL match to `/\/admin\/cockpit/` (the `?mode=tabelle` query is gone; the cutover redirect in `website/src/pages/admin/tickets.astro` still points at `/admin/cockpit?mode=tabelle` — that param is now ignored by the store and harmless, OR update the redirect target to `/admin/cockpit` in the same task; see Step 2).
- For data-dependent tests: drive feature selection via `[data-testid="sidebar-feature"]` instead of `[data-testid="feature-card"]`, then assert `[data-testid="cockpit-table"]` and `[data-testid="status-select"]`/`[data-testid="bulk-status"]` as before.

Concretely, rewrite the file to:

```ts
// tests/e2e/fa-29-cockpit.spec.ts [T000752 → cockpit-ux-redesign]
// Projekt-Cockpit E2E — verifies /admin/cockpit loads (sidebar + table),
// feature selection filters tickets, inline status edit + bulk edit work.
// Requires E2E_ADMIN_USER + E2E_ADMIN_PASS. Runs against live prod (WEBSITE_URL).
import { test, expect } from '@playwright/test';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

test.describe('FA-29 Projekt-Cockpit', () => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS nicht gesetzt — überspringe Auth-Test');

  async function login(page: any) {
    await page.goto(`${WEBSITE_URL}/admin/cockpit`);
    const userField = page.locator('input[name="username"]');
    if (await userField.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await userField.fill(ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(/\/admin\/cockpit/);
    }
  }

  test('loads sidebar and table', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-testid="cockpit-sidebar"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="cockpit-table"]')).toBeVisible({ timeout: 15_000 });
  });

  test('redirects /admin/tickets to cockpit', async ({ page }) => {
    await login(page);
    await page.goto(`${WEBSITE_URL}/admin/tickets`);
    await page.waitForURL(/\/admin\/cockpit/);
    await expect(page).toHaveURL(/\/admin\/cockpit/);
  });

  test('opens the create modal', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="open-create"]').click();
    await expect(page.locator('[data-testid="create-modal"]')).toBeVisible({ timeout: 10_000 });
  });

  test.describe('data-dependent (requires seeded portfolio)', () => {
    async function hasFeatures(page: any) {
      return (await page.locator('[data-testid="sidebar-feature"]').count()) > 0;
    }

    test('selecting a feature filters the table + inline-edits a status', async ({ page }) => {
      await login(page);
      if (!(await hasFeatures(page))) { test.skip(true, 'Keine Features — überspringe'); return; }
      await page.locator('[data-testid="sidebar-feature"]').first().click();
      await expect(page.locator('[data-testid="cockpit-table"]')).toBeVisible({ timeout: 10_000 });
      const statusSelect = page.locator('[data-testid="status-select"]').first();
      if (!(await statusSelect.count())) { test.skip(true, 'Kein Status-Select — überspringe'); return; }
      const resp = page.waitForResponse(/\/api\/admin\/tickets\/.+\/transition/);
      await statusSelect.selectOption('done');
      await resp;
    });

    test('bulk-edits status', async ({ page }) => {
      await login(page);
      if (!(await hasFeatures(page))) { test.skip(true, 'Keine Features — überspringe'); return; }
      await page.locator('[data-testid="sidebar-feature"]').first().click();
      const checkboxes = page.locator('[data-testid="row-checkbox"]');
      if (!(await checkboxes.count())) { test.skip(true, 'Keine Row-Checkboxes — überspringe'); return; }
      await checkboxes.first().check();
      const resp = page.waitForResponse(/\/api\/admin\/cockpit\/batch/);
      const bulkStatus = page.locator('[data-testid="bulk-status"]');
      if (await bulkStatus.count()) { await bulkStatus.selectOption('done'); await resp; }
    });
  });
});
```

- [ ] **Step 2: Simplify the redirect target (optional but clean)**

In `website/src/pages/admin/tickets.astro`, change the redirect to drop the now-meaningless query param:

```astro
---
// Cockpit cutover: /admin/tickets redirects to the Projekt-Cockpit.
return Astro.redirect('/admin/cockpit');
---
```

- [ ] **Step 3: Run the full offline test suite**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
task test:all
```
Expected: PASS (BATS units, kustomize structure, Taskfile dry-run, **Vitest website**). If the test-inventory step warns about drift, that is fixed in Step 4.

- [ ] **Step 4: Regenerate freshness artifacts (baseline, test-inventory, repo-index)**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
task freshness:regenerate
task test:inventory
```
Expected: `docs/code-quality/baseline.json` no longer contains `S1:website/src/components/admin/TicketsTab.svelte`; `website/src/data/test-inventory.json` reflects the new/removed test files; `repo-index.json` updated.

- [ ] **Step 5: Verify the gate check is green**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
task freshness:check
```
Expected: PASS — freshness + `quality:check` (S1–S4 ratchet) + baseline key-count assertion all green. The baseline lost a key (TicketsTab) → net key count **decreased**, which the assertion permits (it fails only on growth). If it complains about *new* baseline keys, ensure none of the new `.svelte`/`.ts` files exceeded their static limit (re-run `wc -l` on each — all were budgeted ≤ 300).

- [ ] **Step 6: Confirm the website builds (catches Svelte/Astro compile errors the unit tests miss)**

Run:
```bash
cd website && pnpm build 2>&1 | tail -20
```
Expected: build succeeds. If it fails on a stale import to a deleted component, fix the import and re-run Steps 3–6.

- [ ] **Step 7: Commit the regenerated artifacts + E2E + redirect**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
git add docs/code-quality/baseline.json docs/code-quality/repo-index.json \
  website/src/data/test-inventory.json \
  tests/e2e/fa-29-cockpit.spec.ts website/src/pages/admin/tickets.astro
git add -A docs/generated 2>/dev/null || true
git commit -m "test(cockpit): update E2E + regenerate freshness artifacts for cockpit-ux-redesign"
```

> If `freshness:regenerate` touched conflict-magnet files (`docs/generated/**`, `docs/code-quality/repo-index.json`, `k3d/docs-content-built/architecture/index.html`), commit them here; on later rebase use `git checkout --ours` per CLAUDE.md.

- [ ] **Step 8: Push the branch**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-cockpit-ux
git push -u origin feature/cockpit-ux-redesign
```
Expected: branch pushed; ready to open a PR (the executing skill handles PR + auto-merge).

---

## Done-criteria checklist (final self-check before handing off)

- [ ] `/admin/cockpit` renders sidebar (tree) + ticket table; no lens/mode toggles anywhere.
- [ ] Clicking a feature in the sidebar filters the table to that feature's tickets.
- [ ] Toolbar search live-filters by title; status chips filter by status; `+ Ticket` opens the create modal.
- [ ] Create modal works (modal on desktop, bottom-sheet under 768px); on success table refreshes.
- [ ] Row click opens the detail drawer; drawer has status-transition buttons + inline title/description edit; full-screen on mobile.
- [ ] Bulk bar appears on selection and runs batch mutations.
- [ ] Mobile (< 768px): sidebar hidden behind ☰ hamburger; table hides ID + created columns; priority shown as left border.
- [ ] `TicketsTab`, `TicketsTableBody`, `FeatureWorkbench`, `PortfolioGrid`, `FeatureCard`, `TicketQuickEdit` deleted; no dangling imports.
- [ ] `task test:all` green; `task freshness:check` green; `task test:inventory` produces no diff; `pnpm build` succeeds.
- [ ] `baseline.json` no longer references the deleted `TicketsTab.svelte`; no new baseline keys added.

---

## Self-Review notes (author)

**Spec coverage:** Tabelle-first (Task 6) · Sidebar tree + product headings non-filterable (Task 4) · mobile hamburger drawer auto-close (Task 4) · desktop 200px sidebar (Task 4 style) · toolbar search + status chips + `+ Ticket` (Task 6) · responsive columns + priority left-border (Task 5) · bulk bar reuse (Task 6 mounts existing BulkBar) · create modal/bottom-sheet with all 6 fields (Task 7) · drawer transitions + inline edit + mobile full-screen (Task 8) · store simplification (Task 1) · file deletions incl. transitive orphans FeatureCard/TicketQuickEdit (Task 10) · test split/rewrite (Tasks 1,5,6,7,8,9,10) · verification block (Task 11). All spec sections mapped.

**Spec deviations (intentional, justified):** (1) Components kept FLAT in `components/admin/` rather than a new `cockpit/` subfolder — the spec's directory block is illustrative; flattening avoids rewriting every import and matches the verified current layout. (2) `TicketsTab.test.ts` does not exist; its create-form coverage is reborn as `TicketCreateModal.test.ts`. (3) Added the pure helper `cockpit-table-actions.ts` (not in spec's file list) purely to keep `CockpitTable.svelte` under the S1 line limit and to make mutations unit-testable — it adds no behaviour. (4) `TicketsTableBody.svelte` deletion is gated on a zero-importer check (Task 10 Step 1) since it was legacy `/admin/tickets` markup, not strictly part of the cockpit.

**Type consistency:** `transitionTicket/patchPriority/patchTitle/patchDescription/reorderTickets/runBatch/createTicket` signatures defined in Task 3 are used verbatim in Tasks 6, 8. `TicketRow` extra fields (Task 2) consumed in Tasks 5, 8. Store API (`selectFeature`, `setActiveTicket`, `selectedFeature`) defined in Task 1, used in Tasks 4, 9.
