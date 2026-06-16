---
title: Sidekick Pipeline — FactoryFloor Direction Fix (SP4)
ticket_id: T000922
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

# Sidekick Pipeline FactoryFloor Direction Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on SP1 (T000919) being merged** — imports `PHASE_ORDER` and the ordered SSOT from `factory-floor.ts` and activates the order test SP1 created.

**Goal:** Make the Factory-Floor desktop board run front→back. Today the desktop macro-lane DOM order is `Hall · Staged · Laderampe · Shipped · QS-Abnahme` — so `done` (ShippedColumn) renders **before** `qa_review` (QS-Abnahme), the inverse of the lifecycle. Reorder to `Staged · Laderampe · Hall · QS-Abnahme · Shipped`, derive the phase columns from the SP1 SSOT, and lock the order with a regression test.

**Architecture:** Test-first. A render/order test asserts the desktop lanes appear front→back (it FAILS on the current order: `done` before `qa`, `backlog` after `hall`). Then `FactoryFloor.svelte` reorders the macro-lane children in the `kanban-container` and derives the in-Hall `STATIONS` from `PHASE_ORDER` (imported from `factory-floor.ts`, the SP1 re-export of the SSOT); `MOBILE_COL_INDEX` moves to `<script module>` and is exported so the test can import it. `MobileTabBar.svelte` exposes its `TABS` array (already front→back on main — the export + assertion prevents future drift). `ConveyorBelt.svelte` already iterates the `stations` prop it receives, so it needs no change — verified only.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Astro/Svelte website workspace.

---

## File Ownership & Scope

This sub-plan owns **exclusively within its wave** (Wave 2, alongside SP3 which touches disjoint Sidekick files — no overlap):

- `website/src/components/FactoryFloor.svelte` — modify (reorder macro-lanes, derive STATIONS, export MOBILE_COL_INDEX).
- `website/src/components/factory/MobileTabBar.svelte` — modify (export TABS from `<script module>`).
- `website/src/components/factory/ConveyorBelt.svelte` — verify only (no change expected).

**Cross-wave edit (safe):** `website/src/lib/factory-floor.order.test.ts` was created by SP1 (Wave 1) and is merged before this Wave-2 plan runs; SP4 edits it to add the activated component-order assertions where SP1 left `it.todo` markers. Because SP1 → SP4 is a strict dependency (sequential, not concurrent), this is not a same-wave file collision. SP4 imports from `factory-floor.ts` (SP1) but does **not** modify it. It does **not** touch any SP2 or SP3 file. No `awaiting_deploy` on main — not introduced.

## File Structure

| File | Role | Change |
|------|------|--------|
| `website/src/components/FactoryFloor.svelte` | Desktop + mobile factory board | Reorder macro-lane DOM front→back; derive `STATIONS` from `PHASE_ORDER`; move + export `MOBILE_COL_INDEX` |
| `website/src/components/factory/MobileTabBar.svelte` | Mobile lane tab bar | Move `TABS` to `<script module>` and export (order already correct) |
| `website/src/components/factory/ConveyorBelt.svelte` | Hall conveyor (phase columns) | None — already iterates the `stations` prop; verify only |
| `website/src/lib/factory-floor.order.test.ts` | SP1 order test | Add the component-order assertions where SP1 left `it.todo` markers |

## Pre-flight: S1 line budgets (effective threshold per touched file)

| File | wc -l (origin/main) | baseline | ext limit | effective threshold | budget |
|------|---------------------|----------|-----------|---------------------|--------|
| `website/src/components/FactoryFloor.svelte` | 486 | nicht-baselined | 600 (.svelte) | 600 | +114 |
| `website/src/components/factory/MobileTabBar.svelte` | 91 | nicht-baselined | 600 (.svelte) | 600 | +509 |
| `website/src/components/factory/ConveyorBelt.svelte` | 54 | nicht-baselined | 600 (.svelte) | 600 | no change |
| `website/src/lib/factory-floor.order.test.ts` | (SP1 new) | nicht-baselined | 600 (.ts) | 600 | large reserve |

**How SP4 stays within budget:**
- `FactoryFloor.svelte`: reordering the macro-lane children is **moving existing blocks**, not adding (line-neutral). Deriving `STATIONS` from `PHASE_ORDER` replaces a 3-line array literal with a 1-line `.map` (slight shrink). Moving `MOBILE_COL_INDEX`/`STATIONS` into a `<script module>` block adds ~2 wrapper lines + `export`. Net ≈ neutral; verify `wc -l ≤ ~490`, far under the 600 budget.
- `MobileTabBar.svelte`: moving `TABS` into `<script module>` + `export` ≈ +2 lines.
- `ConveyorBelt.svelte`: no change.
- `factory-floor.order.test.ts`: replace 3 `it.todo` lines with ~3 small assertion blocks + a render check (~+20 lines) — large reserve under 600.

No baseline entries added (all files stay under their static limits).

---

### Task 1: Export the order-bearing constants (enable assertions)

**Files:**
- Modify: `website/src/components/factory/MobileTabBar.svelte`
- Modify: `website/src/components/FactoryFloor.svelte`

- [ ] **Step 1: Export `TABS` from MobileTabBar**

In `website/src/components/factory/MobileTabBar.svelte`, move the `const TABS = [...] as const;` declaration (currently in the instance `<script lang="ts">`) into a `<script module lang="ts">` block and `export` it, so a `.ts` test can import it. Keep the array contents and order unchanged (`staged, backlog, scout, design, plan, implement, verify, deploy, qs, done` — already front→back). The instance script and template keep using it unchanged.

- [ ] **Step 2: Derive `STATIONS` from the SSOT + export `MOBILE_COL_INDEX`**

In `website/src/components/FactoryFloor.svelte`, replace the hand-written `STATIONS` literal with a derivation, in a `<script module lang="ts">` block, and export both constants:

```typescript
import { PHASE_ORDER } from '../lib/factory-floor';
import type { Phase } from '../lib/factory-floor';
export const STATIONS: { key: Phase; label: string }[] =
  PHASE_ORDER.map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));
export const MOBILE_COL_INDEX: Record<string, number> =
  { staged: 0, backlog: 1, scout: 2, design: 3, plan: 4, implement: 5, verify: 6, deploy: 7, qs: 8, done: 9 };
```

(The derived labels — Scout/Design/Plan/Implement/Verify/Deploy — match the previous literal exactly. `MOBILE_COL_INDEX` keeps its values and is exported so the order test can assert it against the SSOT-derived sequence.)

- [ ] **Step 3: Type-check + commit**

Run: `pnpm --dir website exec tsc --noEmit -p tsconfig.json` → PASS (no errors referencing the two components).

```bash
git add website/src/components/factory/MobileTabBar.svelte website/src/components/FactoryFloor.svelte
git commit -m "refactor(website): export factory order constants, derive STATIONS from SSOT [T000922]"
```

---

### Task 2: Write the failing front-to-back order test (red)

**Files:**
- Modify: `website/src/lib/factory-floor.order.test.ts` (SP1-created; cross-wave edit, safe — SP1 merged first)

- [ ] **Step 1: Add the component-order assertions where SP1 left `it.todo`**

In `website/src/lib/factory-floor.order.test.ts`, replace the three `it.todo('SP4: …')` markers with real assertions. The mobile assertions pass immediately (mobile is already front→back); the **desktop macro-lane DOM-order assertion is the one that fails now** (current order renders `floor-shipped` before `floor-qa` and `floor-hall` before `floor-loadingdock`).

```typescript
import { TABS } from '../components/factory/MobileTabBar.svelte';
import { MOBILE_COL_INDEX, STATIONS } from '../components/FactoryFloor.svelte';
import { PHASE_ORDER } from './factory-floor';
import { render } from '@testing-library/svelte';
import FactoryFloor from '../components/FactoryFloor.svelte';

const EXPECTED_MOBILE_SEQUENCE = ['staged', 'backlog', ...PHASE_ORDER, 'qs', 'done'];
const MOCK_FLOOR = { /* minimal FloorPayload: hall:[], staged:[], loadingDock:[], shipped:[], planningCount:{total:0,ready:0}, attention:{blocked:[]}, metrics:{shippedToday:0,avgCycleH:null}, control:{} */ };

it('MobileTabBar.TABS matches the SSOT-derived front→back sequence', () => {
  expect(TABS.map((t) => t.key)).toEqual(EXPECTED_MOBILE_SEQUENCE);
});
it('MOBILE_COL_INDEX matches the SSOT-derived front→back sequence', () => {
  expect(Object.entries(MOBILE_COL_INDEX).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(EXPECTED_MOBILE_SEQUENCE);
});
it('STATIONS (Hall phase columns) equal PHASE_ORDER left→right', () => {
  expect(STATIONS.map((s) => s.key)).toEqual([...PHASE_ORDER]);
});
it('FactoryFloor desktop macro-lanes render front→back (qa before done, backlog before hall)', () => {
  // mock EventSource + fetch as PortalSidekick.test.ts does
  const { container } = render(FactoryFloor, { props: { initial: MOCK_FLOOR } });
  const order = [...container.querySelectorAll('[data-testid^="floor-"]')].map((e) => (e as HTMLElement).dataset.testid);
  expect(order.indexOf('floor-loadingdock')).toBeLessThan(order.indexOf('floor-hall')); // pre-work before in-work
  expect(order.indexOf('floor-qa')).toBeLessThan(order.indexOf('floor-shipped'));        // qa before done
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm --dir website exec vitest run factory-floor.order`
Expected: FAIL — the desktop DOM-order assertion fails because on the current code `floor-shipped` (ShippedColumn) precedes `floor-qa` (QS-Abnahme) and `floor-hall` precedes `floor-loadingdock`. (The three mobile/STATIONS assertions already pass.) This proves the "wrong way" bug is real and the test catches it.

- [ ] **Step 3: Commit the failing test**

```bash
git add website/src/lib/factory-floor.order.test.ts
git commit -m "test(website): assert FactoryFloor front-to-back lane order (failing) [T000922]"
```

> If mounting `FactoryFloor` proves brittle under the SSE/fetch mocks, narrow the failing assertion to a DOM query of the lane `data-testid` order only (keep `EventSource`/`fetch` stubbed). Do not leave a flaky test — if a full mount is not viable in the unit env, assert the order against the SSOT-derived desktop lane sequence (a small exported `DESKTOP_LANE_ORDER` array in FactoryFloor) that you reorder in Task 3, which still gives a genuine red→green.

---

### Task 3: Reorder the desktop macro-lanes front→back (green)

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

- [ ] **Step 1: Reorder the `kanban-container` children**

In `website/src/components/FactoryFloor.svelte`, the `<div class="kanban-container …">` currently renders lane children: **Hall** (`{#if floorView==='conveyor'}` / grid `{:else}`) → **StagedColumn** → **Laderampe** (`data-testid="floor-loadingdock"`) → **ShippedColumn** → **QS-Abnahme** (`data-testid="floor-qa"`).

Move the blocks so the DOM order becomes front→back (pre-work → in-work → review → shipped):

1. `StagedColumn` (plan_staged)
2. Laderampe `<div data-testid="floor-loadingdock">` (backlog)
3. Hall block (the whole `{#if floorView==='conveyor'} … {:else} … {/if}`, in_progress/in_review)
4. QS-Abnahme `<div data-testid="floor-qa">` (qa_review)
5. `ShippedColumn` (done)

Pure block-move — do not change the contents/props of any block. Keep the `kanban-container` flex classes; the visual left→right order now matches the lifecycle (`qa` before `done`).

- [ ] **Step 2: Run the order test — expect PASS**

Run: `pnpm --dir website exec vitest run factory-floor.order`
Expected: **PASS** — desktop lanes now front→back (`floor-loadingdock` before `floor-hall`, `floor-qa` before `floor-shipped`); mobile + STATIONS assertions still green.

- [ ] **Step 3: Verify line count stayed flat**

Run: `wc -l website/src/components/FactoryFloor.svelte`
Expected: ≈ 486 (±5), well under the 600 budget — a move + derivation, not growth.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "fix(website): order FactoryFloor desktop lanes front to back (qa before done) [T000922]"
```

---

### Task 4: Verify ConveyorBelt + final verification gate

**Files:**
- Verify: `website/src/components/factory/ConveyorBelt.svelte` (expected: no change)
- Regenerated artifacts committed here.

- [ ] **Step 1: Confirm ConveyorBelt needs no change**

`ConveyorBelt.svelte` iterates `{#each stations …}` over the `stations` prop it receives (`stations={STATIONS}` from `FactoryFloor`). Since `STATIONS` is now derived from `PHASE_ORDER`, ConveyorBelt follows automatically. Confirm it still passes `stations={STATIONS}` and makes no local phase-order copy. Make NO change unless it hard-codes the order independently (it does not on main).

- [ ] **Step 2: Run targeted tests for changed domains**

Run: `task test:changed`
Expected: PASS — order test + any existing FactoryFloor/ConveyorBelt tests pass; S1–S4 ratchet over touched files passes (FactoryFloor ≈ neutral and under 600; no new import cycle — `factory-floor.ts` already imported by these components; no brand-domain literal; the order test is auto-discovered, not orphaned).

- [ ] **Step 3: Regenerate test inventory (the order test was extended)**

Run: `task test:inventory`
Expected: regenerates `website/src/data/test-inventory.json`.

- [ ] **Step 4: Regenerate + check freshness**

Run: `task freshness:regenerate` then `task freshness:check`
Expected: PASS — freshness clean, S1–S4 ratchet green, baseline key-count unchanged.

- [ ] **Step 5: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality docs/generated
git commit -m "chore(website): regenerate test-inventory + freshness for FactoryFloor order [T000922]"
```

---

## Self-Review

**Spec coverage (spec §4 SP4 row + §7):**
- Failing desktop-order test first (red), then reorder so `qa_review` precedes `done` and pre-work lanes precede Hall (green) → Task 2 + Task 3.
- `STATIONS` derived from `PHASE_ORDER`; `MOBILE_COL_INDEX`/`TABS` exported → Task 1.
- SP1 component-order placeholders activated → Task 2 (mobile + STATIONS + desktop DOM order).
- `ConveyorBelt` follows the derived `stations` prop → Task 4 Step 1 (verify only).
- No `awaiting_deploy` on main → not introduced; lifecycle ends at `done`.

**Placeholder scan:** none in prose — the only `it.todo` references are SP1's existing markers being activated, quoted as code.

**Dependency discipline:** depends on SP1 (Wave 1) for `PHASE_ORDER`/SSOT and the order-test file; runs in Wave 2 alongside SP3 with zero shared files. The cross-wave edit of `factory-floor.order.test.ts` is sequential (SP1 merged first), not a concurrent collision.

**Budget discipline:** all changes are block-moves + a derivation (net-neutral); FactoryFloor stays well under its 600 limit; explicit `wc -l` check in Task 3 Step 3.
