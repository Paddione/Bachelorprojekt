---
title: Sidekick Pipeline — In-Drawer Pipeline View (SP3)
ticket_id: T000921
domains: [website]
status: active
plan_ref: docs/superpowers/specs/2026-06-16-sidekick-pipeline-states-design.md
date: 2026-06-16
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Sidekick Pipeline In-Drawer View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on SP1 (T000919) being merged** — imports `PIPELINE_LANES`/`STATUS_BUCKETS` from `factory-floor.ts`.

**Goal:** Make the Sidekick beneficial for stateful ticketing: a new admin-only `pipeline` view in the Sidekick drawer that shows the ticket lifecycle lanes front→back (Planung → Kommissioniert → Laderampe → In Arbeit → QS-Abnahme → Fertig) with per-lane counts and a mini-bar, and a drill-down lifecycle stepper that marks where a ticket sits.

**Architecture:** One new component `PipelineSidekickView.svelte` wired into the existing Sidekick drawer via the documented 5-step seam. It reads the pipeline from the existing `GET /api/factory-floor` (lanes: `planningCount`, `staged`, `loadingDock`, `hall`, `shipped`) plus `GET /api/admin/qa-queue` for the QS-Abnahme lane (FloorPayload has no qa lane — FactoryFloor sources QS the same way). Lane order and the status→lane mapping come from the SP1 SSOT (`PIPELINE_LANES`, `STATUS_BUCKETS`), so the strip is front→back by construction. Live refresh subscribes to the existing `GET /api/factory-floor/stream` (SSE) with a fetch-on-open fallback. The view is admin-gated (`helpContext==='admin'`), matching `tickets`/`inbox`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest, Astro/Svelte website workspace.

---

## File Ownership & Scope

This sub-plan owns **exclusively within its wave** (Wave 2, alongside SP4 which touches only FactoryFloor files — zero overlap):

- `website/src/components/assistant/PipelineSidekickView.svelte` — **create** (the new view).
- `website/src/components/PortalSidekick.svelte` — modify (View union, titleMap, drawer-body branch, import).
- `website/src/components/assistant/SidekickHome.svelte` — modify (one admin-gated menu item).
- `website/src/styles/sidekick-panels.css` — modify (append `.drawer`-scoped styles for the new view).
- `website/src/lib/assistant/sidekick-nudge.ts` — modify (add `pipeline` to the deep-link `SidekickView` union + `KNOWN_VIEWS`).

It does **not** touch `TicketSidekickView.svelte` (SP2), `factory-floor.ts` (SP1 — imported only), or any FactoryFloor component (SP4). It imports `PIPELINE_LANES`/`STATUS_BUCKETS` from `factory-floor.ts` (SP1's re-export); it does not re-declare ordering. No `awaiting_deploy` lane (not on main) — the strip iterates `PIPELINE_LANES`, which has 6 linear lanes on main.

## File Structure

| File | Role | Change |
|------|------|--------|
| `website/src/components/assistant/PipelineSidekickView.svelte` (new) | The pipeline lane strip + drill-down stepper | create |
| `website/src/components/PortalSidekick.svelte` | Drawer host / view switch | add `pipeline` to `View` + `titleMap` + drawer branch + import |
| `website/src/components/assistant/SidekickHome.svelte` | Drawer menu | add one `show: isAdmin` item for `pipeline` |
| `website/src/styles/sidekick-panels.css` | Drawer sub-view styles | append `.drawer` pipeline styles |
| `website/src/lib/assistant/sidekick-nudge.ts` | Deep-link view allowlist | add `pipeline` to union + `KNOWN_VIEWS` |

## Pre-flight: S1 line budgets (effective threshold per touched file)

| File | wc -l (origin/main) | baseline | ext limit | effective threshold | budget |
|------|---------------------|----------|-----------|---------------------|--------|
| `website/src/components/assistant/PipelineSidekickView.svelte` | 0 (new) | nicht-baselined | 600 (.svelte) | 600 | new, target ≤ ~220 lines |
| `website/src/components/PortalSidekick.svelte` | 407 | nicht-baselined | 600 (.svelte) | 600 | +193 (need ≈ +6) |
| `website/src/components/assistant/SidekickHome.svelte` | 345 | nicht-baselined | 600 (.svelte) | 600 | +255 (need ≈ +1) |
| `website/src/styles/sidekick-panels.css` | 1894 | nicht-baselined | (verify .css S1 rule) | n/a | append ≈ 50 lines |
| `website/src/lib/assistant/sidekick-nudge.ts` | 61 | nicht-baselined | 600 (.ts) | 600 | +539 (need ≈ +1) |

**How SP3 stays within budget:**
- `PipelineSidekickView.svelte` is new (~200 lines incl. template + script) — under its 600 limit with reserve.
- `PortalSidekick.svelte`: extend the `View` union line in place (+0), one `titleMap` entry (+1), a 3-line drawer `{:else if}` branch, one import line → ≈ +6, far under +193.
- `SidekickHome.svelte`: one item object + minimal `no:` renumber → ≈ +1.
- `sidekick-panels.css` is **not** S1-line-baselined on main (returns `none` at 1894 lines → CSS is not line-capped, or the cap is far above). Confirm the `.css` rule in `scripts/` during Task 4; the ~50 appended lines are negligible regardless. Keep them scoped under `.drawer`.
- `sidekick-nudge.ts`: extend the union line + the `KNOWN_VIEWS` set in place → ≈ +1.

No baseline entries are added (every touched code file stays under its static limit; none is currently baselined).

---

### Task 1: Write the failing view test (red)

**Files:**
- Create: `website/src/components/assistant/PipelineSidekickView.test.ts`

- [ ] **Step 1: Write the render + mapping test**

Create `website/src/components/assistant/PipelineSidekickView.test.ts`. Mock `fetch` to return a minimal `FloorPayload` (for `/api/factory-floor`) and a small qa list (for `/api/admin/qa-queue`), and mock `EventSource` (the view opens the SSE stream on mount — mirror the `FactoryFloor`/`PortalSidekick` test setup). Assert the lanes render in `PIPELINE_LANES` front→back order and that a ticket's lifecycle position maps to the right lane. Pattern mirrors `website/src/components/PortalSidekick.test.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import PipelineSidekickView from './PipelineSidekickView.svelte';
import { PIPELINE_LANES } from '../../lib/factory-floor';

// Minimal payloads
const FLOOR = {
  planningCount: { total: 3, ready: 1 }, staged: [{ extId: 'T1' }], loadingDock: [{ extId: 'T2' }, { extId: 'T3' }],
  hall: [{ extId: 'T4', phase: 'scout', phaseProgress: [] }], shipped: [{ extId: 'T5' }], attention: { blocked: [] },
  metrics: { shippedToday: 1, avgCycleH: null }, control: {},
};
const QA = [{ extId: 'T6' }];

beforeEach(() => {
  vi.stubGlobal('EventSource', class { close() {} addEventListener() {} onmessage = null; });
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('qa-queue') ? QA : FLOOR) })));
});

describe('PipelineSidekickView', () => {
  it('renders the linear lanes in SSOT front→back order', async () => {
    const { findAllByTestId } = render(PipelineSidekickView, { props: { onClose: () => {} } });
    const rows = await findAllByTestId('pipeline-lane');
    const labels = rows.map((r) => r.getAttribute('data-lane'));
    const expected = PIPELINE_LANES.filter((l) => !l.side).map((l) => l.key);
    expect(labels).toEqual(expected); // planning, staged, loadingDock, hall, qa, shipped
  });
});
```

- [ ] **Step 2: Run to confirm red**

Run: `pnpm --dir website exec vitest run PipelineSidekickView`
Expected: FAIL — the component does not exist yet (import error).

- [ ] **Step 3: Commit the failing test**

```bash
git add website/src/components/assistant/PipelineSidekickView.test.ts
git commit -m "test(website): Sidekick pipeline view render test (failing) [T000921]"
```

---

### Task 2: Build the PipelineSidekickView component (green)

**Files:**
- Create: `website/src/components/assistant/PipelineSidekickView.svelte`

- [ ] **Step 1: Implement the lane strip + drill-down**

Create `website/src/components/assistant/PipelineSidekickView.svelte`:
- Import `PIPELINE_LANES`, `STATUS_BUCKETS`, and types from `../../lib/factory-floor` (SP1 SSOT). Import `PhaseStepper` from `../factory/PhaseStepper.svelte` for in-Hall tickets.
- On mount: `fetch('/api/factory-floor')` and `fetch('/api/admin/qa-queue')` (both `credentials: 'same-origin'`). Build per-lane counts:
  - `planning` ← `floor.planningCount.total` (+ `.ready` as a sub-hint)
  - `staged` ← `floor.staged.length`
  - `loadingDock` ← `floor.loadingDock.length`
  - `hall` ← `floor.hall.length`
  - `qa` ← `qaItems.length`
  - `shipped` ← `floor.shipped.length` (or `floor.metrics.shippedToday`)
- Render one row per `PIPELINE_LANES.filter((l) => !l.side)` in order, each with `data-testid="pipeline-lane"` and `data-lane={lane.key}`, the German `lane.label`, the count, and a mini-bar width ∝ count. This guarantees front→back order from the SSOT.
- Drill-down: clicking a lane expands its tickets; for a Hall ticket render `<PhaseStepper segments={item.phaseProgress} />`. A per-ticket lifecycle stepper marks lanes `✓` (before current), `●` (current = `laneIndexOf(STATUS_BUCKETS[status])`), `○` (after), iterating the same `PIPELINE_LANES` (side:false).
- Error handling: a failed fetch sets a friendly inline error state (no drawer crash); SSE disconnect → silent reconnect / fall back to the on-open fetch (mirror `FactoryFloor.svelte`'s EventSource handling, `SSE_RECONNECT_MS` from `factory-constants`).
- `let { onClose }: { onClose: () => void } = $props();` (match the sibling views' contract).

- [ ] **Step 2: Run the view test (green)**

Run: `pnpm --dir website exec vitest run PipelineSidekickView`
Expected: PASS — lanes render in SSOT order with `data-lane` keys `planning, staged, loadingDock, hall, qa, shipped`.

- [ ] **Step 3: Add the scoped styles**

Append `.drawer`-scoped styles for the new view to `website/src/styles/sidekick-panels.css` (NOT a scoped `<style>` block — see the file header: Svelte 5 + Vite drop scoped CSS for conditionally-mounted drawer sub-views). Use the existing tokens (`--brass`, `--ink-800`, `--line`). Keep additions minimal.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/assistant/PipelineSidekickView.svelte website/src/styles/sidekick-panels.css
git commit -m "feat(website): Sidekick pipeline lane strip + drill-down stepper [T000921]"
```

---

### Task 3: Wire the view into the Sidekick drawer (the 5-step seam)

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte`
- Modify: `website/src/components/assistant/SidekickHome.svelte`
- Modify: `website/src/lib/assistant/sidekick-nudge.ts`

- [ ] **Step 1: PortalSidekick — union, title, branch, import**

In `website/src/components/PortalSidekick.svelte`:
- Add `'pipeline'` to the `View` union (line ~15).
- Add `pipeline: 'Pipeline'` to `titleMap` (line ~55-61).
- Import the new component near the other view imports: `import PipelineSidekickView from './assistant/PipelineSidekickView.svelte';`
- Add a drawer-body branch after the `tickets` branch (line ~261): `{:else if view === 'pipeline'} <PipelineSidekickView onClose={closeDrawer} />`.

- [ ] **Step 2: SidekickHome — one admin-gated menu item**

In `website/src/components/assistant/SidekickHome.svelte`, add an item to the `items` array (after `inbox`), `show: isAdmin`:
`{ id: 'pipeline', no: '03', title: 'Pipeline', sub: 'Ticket-Status vorne→hinten', show: isAdmin }`
and adjust the inline `no:` numbering of the following items so the sequence stays contiguous for both admin and non-admin (the non-admin numbering is unaffected since this item is admin-only — keep the `isAdmin ? 'NN' : 'MM'` pattern consistent).

- [ ] **Step 3: sidekick-nudge — deep-link allowlist**

In `website/src/lib/assistant/sidekick-nudge.ts`, add `'pipeline'` to the `SidekickView` union (line ~6-7) and to the `KNOWN_VIEWS` set (line ~9-11) so `parseNavigateEvent` accepts a `sidekick:navigate` to the pipeline view.

- [ ] **Step 4: Verify wiring + existing Sidekick tests**

Run: `pnpm --dir website exec vitest run PortalSidekick sidekick-nudge PipelineSidekickView`
Expected: PASS — existing PortalSidekick + nudge tests still pass (additive change), pipeline view test passes.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/PortalSidekick.svelte website/src/components/assistant/SidekickHome.svelte website/src/lib/assistant/sidekick-nudge.ts
git commit -m "feat(website): wire pipeline view into Sidekick drawer (admin) [T000921]"
```

---

### Task 4: Final verification gate

**Files:**
- None modified in this task (verification only). Regenerated artifacts committed here.

- [ ] **Step 1: Confirm the .css S1 rule + line budgets**

Confirm `sidekick-panels.css` and `PortalSidekick.svelte`/`SidekickHome.svelte` stayed within their thresholds:
Run: `wc -l website/src/styles/sidekick-panels.css website/src/components/PortalSidekick.svelte website/src/components/assistant/SidekickHome.svelte website/src/components/assistant/PipelineSidekickView.svelte`
Expected: PortalSidekick ≤ ~413, SidekickHome ≤ ~347, PipelineSidekickView ≤ ~220; CSS append small. None newly baselined.

- [ ] **Step 2: Run targeted tests for changed domains**

Run: `task test:changed`
Expected: PASS — pipeline view + wiring tests pass; S1–S4 ratchet over touched files green (no new import cycle — `PipelineSidekickView` imports the pure SSOT re-export + PhaseStepper; no brand-domain literal — hostnames come from props/config, not literals; new component + test referenced/auto-discovered, not orphaned).

- [ ] **Step 3: Regenerate test inventory (a test file was added)**

Run: `task test:inventory`
Expected: regenerates `website/src/data/test-inventory.json` to include `PipelineSidekickView.test.ts`.

- [ ] **Step 4: Regenerate + check freshness**

Run: `task freshness:regenerate` then `task freshness:check`
Expected: PASS — freshness clean, S1–S4 ratchet green, baseline key-count unchanged.

- [ ] **Step 5: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality docs/generated
git commit -m "chore(website): regenerate test-inventory + freshness for Sidekick pipeline view [T000921]"
```

---

## Self-Review

**Spec coverage (spec §4 SP3 row + §1 seam + §7):**
- New admin-only `pipeline` view in the drawer → Task 2 + Task 3.
- Lane strip front→back from `PIPELINE_LANES` (SSOT) → Task 2 Step 1 (rows iterate `PIPELINE_LANES.filter(!side)`), asserted Task 1.
- Drill-down lifecycle stepper + `PhaseStepper` reuse for Hall tickets → Task 2 Step 1.
- Data from existing `/api/factory-floor` (+ `/api/admin/qa-queue` for the qa lane, since `FloorPayload` has no qa lane) + SSE stream → Task 2 Step 1.
- 5-step seam wired; admin-gated (`helpContext==='admin'`) → Task 3.
- CSS in `sidekick-panels.css` scoped under `.drawer` → Task 2 Step 3.

**Placeholder scan:** none in prose — no open placeholder tokens; lane/status names are quoted as code.

**Isolation:** consumes the SSOT via import; declares no ordering. Touches only SP3-owned files (disjoint from SP4's FactoryFloor files in the same wave). `qa-queue` is read-only and already admin-gated.

**Data note for the implementer:** `FloorPayload` (factory-floor.ts) provides `planningCount/staged/loadingDock/hall/shipped` but **no qa lane** — QS-Abnahme counts come from `/api/admin/qa-queue` (same source FactoryFloor uses). The `shipped` lane count may use `metrics.shippedToday` for a "today" framing or `shipped.length`; pick one and label it accordingly.
