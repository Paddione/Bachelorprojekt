---
title: Sidekick Pipeline — Ordered Lane SSOT (SP1)
ticket_id: T000919
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

# Sidekick Pipeline Ordered Lane SSOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one ordered front-to-back pipeline-lane declaration (`PIPELINE_LANES`) as the single source of truth and derive `PIPELINE_STATUSES` + `STATUS_BUCKETS` from it, with zero behavior change for existing consumers.

**Architecture:** A new pure helper module `website/src/lib/tickets/pipeline-order.ts` holds the ordered `PIPELINE_LANES`, the `TicketStatus`/`ALL_TICKET_STATUSES` enum, and the derived `PIPELINE_STATUSES` + `STATUS_BUCKETS`. It imports **nothing** DB- or API-side, so it can be imported by tests and Svelte components without pulling in the `pg` Pool. `website/src/lib/factory-floor.ts` re-exports these symbols so every existing import path (`from '../lib/factory-floor'`) keeps working unchanged. A new pure regression test asserts the front-to-back order and the byte-identical bucket mapping; component-order assertions (MobileTabBar / FactoryFloor) are written as `it.todo` placeholders that Sub-Plan 4 (T000922) wires.

**Tech Stack:** TypeScript, Vitest, Astro/Svelte website workspace.

---

## File Ownership & Scope

This sub-plan owns **exclusively** (per spec §4 table, SP1 row):

- `website/src/lib/factory-floor.ts` — modify (extract enum + buckets to the helper, re-export).
- `website/src/lib/tickets/pipeline-order.ts` — **create** (new pure SSOT helper; the spec §3 explicitly permits this module if S2 module-cleanliness needs it — it does, because importing the constants from `factory-floor.ts` would otherwise drag in the `pg` Pool).
- `website/src/lib/factory-floor.order.test.ts` — **create** (new regression test).

It does **not** touch `MobileTabBar.svelte`, `FactoryFloor.svelte`, `ConveyorBelt.svelte`, `transition.ts`, `cockpit-labels.ts`, or any Sidekick component — those belong to SP2/SP3/SP4. Consumers import the SSOT; they do not re-declare ordering.

## File Structure

| File | Role | Owns the ordered declaration? |
|------|------|-------------------------------|
| `website/src/lib/tickets/pipeline-order.ts` (new) | Pure SSOT: `PipelineLane` interface, `PIPELINE_LANES`, `TicketStatus`, `ALL_TICKET_STATUSES`, derived `PIPELINE_STATUSES` + `STATUS_BUCKETS`. No DB/API imports. | YES — the only place |
| `website/src/lib/factory-floor.ts` (modify) | DAL. Drops the hand-written `ALL_TICKET_STATUSES`/`TicketStatus`/`STATUS_BUCKETS` literals; re-exports them from `pipeline-order.ts`. `PHASE_ORDER`/`Phase` stay here unchanged. | no (re-export only) |
| `website/src/lib/factory-floor.order.test.ts` (new) | Front-to-back regression test; live SP1 assertions + `it.todo` for SP4 component checks. | no (consumer/test) |

**Why a separate helper (S2 import-cleanliness):** `factory-floor.ts` imports `pool` from `./website-db`, which instantiates a `pg` Pool at module load. A pure test importing the SSOT constants must not boot that Pool. Putting the constants in `pipeline-order.ts` (imports nothing) lets the test import them directly with zero DB side effects and no `vi.mock('pg', …)` shim, and creates no import cycle: `factory-floor.ts` → `pipeline-order.ts` is one-directional; `pipeline-order.ts` imports nothing.

## Pre-flight: S1 line budgets (effective threshold per touched file)

| File | wc -l (origin/main) | baseline | ext limit | effective threshold | budget |
|------|---------------------|----------|-----------|---------------------|--------|
| `website/src/lib/factory-floor.ts` | 541 | nicht-baselined | 600 (.ts) | 600 | +59 |
| `website/src/lib/tickets/pipeline-order.ts` | 0 (new) | nicht-baselined | 600 (.ts) | 600 | new, target ≤ ~70 lines (large reserve) |
| `website/src/lib/factory-floor.order.test.ts` | 0 (new) | nicht-baselined | 600 (.ts) | 600 | new, target ≤ ~90 lines (large reserve) |

**How SP1 stays within budget:**
- `factory-floor.ts` net effect is **shrinking, not growing**: this plan **removes** the hand-written `ALL_TICKET_STATUSES` array (4 lines), the `TicketStatus` type line, and the 12-line `STATUS_BUCKETS` object literal, and **adds** three short re-export lines plus one import line. Net ≈ −13 lines → `factory-floor.ts` ends near 528, well under its 600 budget (budget after change ≈ +72). No `:latest`/cosmetic tricks; this is a genuine extraction.
- `pipeline-order.ts` is a small new pure module (~70 lines) — large growth reserve under its 600 limit.
- `factory-floor.order.test.ts` is a new test file (~90 lines) — large growth reserve under its 600 limit.

No baseline entries are added (all three files stay below their static `.ts` limit of 600), so the `freshness:check` baseline-key-count assertion stays green.

---

### Task 1: Create the pure ordered-lane SSOT helper

**Files:**
- Create: `website/src/lib/tickets/pipeline-order.ts`

- [x] **Step 1: Write the new pure SSOT module**

Create `website/src/lib/tickets/pipeline-order.ts` with the ordered declaration and the derived exports. The lane order is front→back exactly as spec §2. `STATUS_BUCKETS` values are derived from `PIPELINE_LANES` and MUST equal today's hand-written map (verified in Task 3). `ALL_TICKET_STATUSES` keeps its current order (it is a Set of valid states, not the lane order — `blocked` sits between `in_review` and `qa_review` historically; do not reorder it).

```typescript
// Ordered pipeline-lane SSOT. The ONE front→back declaration; PIPELINE_STATUSES
// and STATUS_BUCKETS are derived from it. Pure module — imports nothing (no DB,
// no API), so tests and Svelte components can import it without booting the pg Pool.
// Forward-compat: awaiting_deploy (PR #1786, NOT on main) would later be a single
// lane insert between 'qa' and 'shipped' here; every derived view + test follows.

// Valid ticket states (Set, NOT lane order). Mirrors the DB CHECK in tickets-db.ts.
// Order is historical (blocked between in_review and qa_review) and intentionally
// preserved for backward compatibility — lane order lives in PIPELINE_LANES below.
export const ALL_TICKET_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
  'in_review', 'blocked', 'qa_review', 'done', 'archived',
] as const;
export type TicketStatus = (typeof ALL_TICKET_STATUSES)[number];

export type LaneKey =
  | 'planning' | 'staged' | 'loadingDock' | 'hall' | 'qa' | 'shipped'
  | 'attention' | 'archive';

export interface PipelineLane {
  key: LaneKey;
  label: string;            // German display label
  statuses: TicketStatus[]; // member statuses, in order
  side: boolean;            // true = not part of the linear pipeline (blocked/archived)
}

// The EINZIGE ordered declaration (front→back). Everything else derives from this.
export const PIPELINE_LANES: readonly PipelineLane[] = [
  { key: 'planning',    label: 'Planung',        statuses: ['triage', 'planning'], side: false },
  { key: 'staged',      label: 'Kommissioniert', statuses: ['plan_staged'],        side: false },
  { key: 'loadingDock', label: 'Laderampe',      statuses: ['backlog'],            side: false },
  { key: 'hall',        label: 'In Arbeit',      statuses: ['in_progress', 'in_review'], side: false },
  { key: 'qa',          label: 'QS-Abnahme',     statuses: ['qa_review'],          side: false },
  { key: 'shipped',     label: 'Fertig',         statuses: ['done'],               side: false },
  { key: 'attention',   label: 'Blockiert',      statuses: ['blocked'],            side: true },
  { key: 'archive',     label: 'Archiv',         statuses: ['archived'],           side: true },
] as const;

// Derived: linear status rungs (side:false lanes only), in front→back order.
export const PIPELINE_STATUSES: readonly TicketStatus[] =
  PIPELINE_LANES.filter((l) => !l.side).flatMap((l) => l.statuses);

// Derived/centralized: status → lane-key. Replaces the hand-maintained map; values
// stay byte-identical to the previous literal (asserted in factory-floor.order.test.ts).
export const STATUS_BUCKETS: Record<TicketStatus, LaneKey> = Object.fromEntries(
  PIPELINE_LANES.flatMap((l) => l.statuses.map((s) => [s, l.key] as const)),
) as Record<TicketStatus, LaneKey>;
```

- [x] **Step 2: Type-check the new module compiles**

Run: `pnpm --dir website exec tsc --noEmit -p tsconfig.json`
Expected: PASS (no errors referencing `pipeline-order.ts`). If `tsc` is slow/unconfigured for partial checks, this step's failure is only meaningful when it names `pipeline-order.ts`.

- [x] **Step 3: Commit**

```bash
git add website/src/lib/tickets/pipeline-order.ts
git commit -m "feat(website): add ordered pipeline-lane SSOT helper [T000919]"
```

---

### Task 2: Write the failing front-to-back regression test

**Files:**
- Create: `website/src/lib/factory-floor.order.test.ts`

- [x] **Step 1: Write the failing test**

Create `website/src/lib/factory-floor.order.test.ts`. It imports the SSOT **and** re-exports from `factory-floor.ts` to prove the re-export wiring (Task 3) holds. The component-order assertions that Sub-Plan 4 (T000922) will wire are written as `it.todo` placeholders — clearly labelled — and SP4 turns them into real assertions.

```typescript
import { describe, it, expect } from 'vitest';
import {
  PIPELINE_LANES,
  PIPELINE_STATUSES,
  STATUS_BUCKETS,
  ALL_TICKET_STATUSES,
  type LaneKey,
} from './tickets/pipeline-order';
// Re-export contract: the same symbols must be reachable from factory-floor.ts so
// existing consumers (SP2/SP3/SP4) keep importing from '../lib/factory-floor'.
import {
  PIPELINE_LANES as FF_PIPELINE_LANES,
  STATUS_BUCKETS as FF_STATUS_BUCKETS,
  ALL_TICKET_STATUSES as FF_ALL_TICKET_STATUSES,
} from './factory-floor';

// The declared expectation, independent of the implementation. Front→back, linear lanes only.
const EXPECTED_LINEAR_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'done',
] as const;

// The byte-identical bucket map the codebase shipped before centralization.
const EXPECTED_BUCKETS: Record<string, LaneKey> = {
  triage: 'planning', planning: 'planning', plan_staged: 'staged', backlog: 'loadingDock',
  in_progress: 'hall', in_review: 'hall', blocked: 'attention', qa_review: 'qa',
  done: 'shipped', archived: 'archive',
};

describe('pipeline-order SSOT', () => {
  it('PIPELINE_STATUSES is the linear front→back sequence (qa_review before done)', () => {
    expect([...PIPELINE_STATUSES]).toEqual([...EXPECTED_LINEAR_STATUSES]);
    // explicit lifecycle-direction guard against the "verkehrt herum" regression
    expect(PIPELINE_STATUSES.indexOf('qa_review')).toBeLessThan(PIPELINE_STATUSES.indexOf('done'));
  });

  it('derived STATUS_BUCKETS is byte-identical to the pre-centralization map', () => {
    expect(STATUS_BUCKETS).toEqual(EXPECTED_BUCKETS);
  });

  it('every ALL_TICKET_STATUSES member maps to exactly one lane', () => {
    for (const s of ALL_TICKET_STATUSES) {
      expect(STATUS_BUCKETS[s]).toBeDefined();
    }
  });

  it('PIPELINE_LANES statuses cover ALL_TICKET_STATUSES exactly (set equality)', () => {
    const laneStatuses = PIPELINE_LANES.flatMap((l) => l.statuses).sort();
    expect(laneStatuses).toEqual([...ALL_TICKET_STATUSES].sort());
  });

  it('side lanes (blocked/archived) are excluded from the linear pipeline', () => {
    const sideStatuses = PIPELINE_LANES.filter((l) => l.side).flatMap((l) => l.statuses);
    expect(sideStatuses.sort()).toEqual(['archived', 'blocked']);
    for (const s of sideStatuses) {
      expect(PIPELINE_STATUSES).not.toContain(s);
    }
  });

  it('factory-floor.ts re-exports the SSOT symbols unchanged (consumer contract)', () => {
    expect(FF_PIPELINE_LANES).toBe(PIPELINE_LANES);
    expect(FF_STATUS_BUCKETS).toBe(STATUS_BUCKETS);
    expect(FF_ALL_TICKET_STATUSES).toBe(ALL_TICKET_STATUSES);
  });

  // ---- Component-order checks wired by Sub-Plan 4 (T000922). Left as todos here ----
  // SP4 owns MobileTabBar.svelte / FactoryFloor.svelte; when it derives TABS,
  // MOBILE_COL_INDEX and the macro-lane DOM order from PIPELINE_LANES/PHASE_ORDER,
  // it converts each of these into a real assertion against the SSOT. SP1 does NOT
  // touch those components, so they stay as it.todo placeholders here.
  it.todo('SP4: MobileTabBar.TABS order matches the SSOT-derived lane/phase order');
  it.todo('SP4: MOBILE_COL_INDEX order matches the SSOT-derived lane/phase order');
  it.todo('SP4: FactoryFloor macro-lane DOM order matches PIPELINE_LANES (qa before done)');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir website exec vitest run factory-floor.order`
Expected: FAIL. The `factory-floor.ts re-exports the SSOT symbols` test errors because `factory-floor.ts` does not yet export `PIPELINE_LANES` / does not re-export from the helper (import resolves to `undefined` → `toBe` fails). This proves the re-export wiring is genuinely absent before Task 3.

- [x] **Step 3: Commit the failing test**

```bash
git add website/src/lib/factory-floor.order.test.ts
git commit -m "test(website): front-to-back pipeline order regression test (failing) [T000919]"
```

---

### Task 3: Re-export the SSOT from factory-floor.ts (make the test pass)

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (remove the hand-written enum/buckets near the `ALL_TICKET_STATUSES`/`STATUS_BUCKETS` block, add re-exports)

- [x] **Step 1: Replace the hand-written enum + bucket literals with a re-export**

In `website/src/lib/factory-floor.ts`, delete the block that currently reads:

```typescript
export const ALL_TICKET_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
  'in_review', 'blocked', 'qa_review', 'done', 'archived',
] as const;
export type TicketStatus = (typeof ALL_TICKET_STATUSES)[number];

export const STATUS_BUCKETS: Record<TicketStatus, string> = {
  triage:      'planning',
  planning:    'planning',
  plan_staged: 'staged',
  backlog:     'loadingDock',
  in_progress: 'hall',
  in_review:   'hall',
  blocked:     'attention',
  qa_review:   'qa',
  done:        'shipped',
  archived:    'archive',
};
```

…and replace it with a re-export of the SSOT (keep this block in the same location so consumers' import paths are unaffected):

```typescript
// Ordered pipeline-lane SSOT lives in ./tickets/pipeline-order (pure module, no DB
// import). Re-exported here so existing consumers keep importing from factory-floor.
export {
  ALL_TICKET_STATUSES,
  PIPELINE_LANES,
  PIPELINE_STATUSES,
  STATUS_BUCKETS,
} from './tickets/pipeline-order';
export type { TicketStatus, PipelineLane, LaneKey } from './tickets/pipeline-order';
```

Leave `PHASE_ORDER`, `Phase`, `phaseProgress`, and everything else in `factory-floor.ts` untouched.

- [x] **Step 2: Run the order test to verify it passes**

Run: `pnpm --dir website exec vitest run factory-floor.order`
Expected: PASS — all live `it()` assertions green (re-export `toBe` identity holds, buckets byte-identical, qa before done); the three `it.todo` show as todo (not failures).

- [x] **Step 3: Run the existing factory-floor DAL test to confirm no regression**

Run: `pnpm --dir website exec vitest run factory-floor.test`
Expected: PASS — the DAL test (`factory-floor.test.ts`) still passes; `STATUS_BUCKETS`/`ALL_TICKET_STATUSES`/`TicketStatus` are now re-exported with identical values and no consumer breaks.

- [x] **Step 4: Verify factory-floor.ts shrank (S1 budget evidence)**

Run: `wc -l website/src/lib/factory-floor.ts`
Expected: ≈ 528 lines (down from 541) — confirms the extraction is a net shrink, well under the 600 budget.

- [x] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts
git commit -m "refactor(website): derive ALL_TICKET_STATUSES/STATUS_BUCKETS from SSOT [T000919]"
```

---

### Task 4: Final verification gate

**Files:**
- None modified in this task (verification only). Regenerated artifacts (`website/src/data/test-inventory.json`, freshness outputs) are committed here.

- [x] **Step 1: Run targeted tests for changed domains**

Run: `task test:changed`
Expected: PASS — vitest `--changed` picks up `factory-floor.order.test.ts` + `factory-floor.test.ts`; quality/S1–S4 ratchet over the touched files passes (factory-floor.ts shrank; new files under limit; no new import cycle; no brand-domain literal; no orphan — the new test is auto-discovered by vitest and the helper is imported by factory-floor.ts).

- [x] **Step 2: Regenerate test inventory (a test file was added)**

Run: `task test:inventory`
Expected: regenerates `website/src/data/test-inventory.json` to include `factory-floor.order.test.ts`.

- [x] **Step 3: Regenerate freshness artifacts**

Run: `task freshness:regenerate`
Expected: updates generated artifacts (repo-index, etc.) for the new/changed files.

- [x] **Step 4: Run the CI-equivalent freshness + quality gate**

Run: `task freshness:check`
Expected: PASS — freshness clean, S1–S4 quality ratchet green, baseline key-count unchanged (no baseline entries added).

- [x] **Step 5: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality docs/generated
git commit -m "chore(website): regenerate test-inventory + freshness for pipeline SSOT [T000919]"
```

---

## Self-Review

**Spec coverage (spec §3 + §4 SP1 row + §7):**
- `PIPELINE_LANES` as the single ordered declaration → Task 1.
- `PIPELINE_STATUSES` derived → Task 1 + asserted Task 2.
- `STATUS_BUCKETS` derived, values byte-identical → Task 1 + byte-identical assertion Task 2 (`EXPECTED_BUCKETS`).
- `ALL_TICKET_STATUSES` + `PHASE_ORDER` kept → enum kept (moved to helper, re-exported, order preserved); `PHASE_ORDER` untouched in factory-floor.ts.
- `ALL_TICKET_STATUSES` tested against the SSOT → Task 2 (set-equality test).
- Front-to-back regression test with component-order placeholders for SP4 → Task 2 (`it.todo` ×3, clearly labelled "SP4").
- Acceptance `pnpm vitest run factory-floor.order` green → Task 3 Step 2.
- Consumers import, don't re-declare → factory-floor.ts re-exports; no other file touched.

**Placeholder scan:** none in prose — the only `it.todo(...)` references are real Vitest API inside fenced code blocks, not plan placeholders.

**Type consistency:** `LaneKey`, `PipelineLane`, `TicketStatus`, `PIPELINE_LANES`, `PIPELINE_STATUSES`, `STATUS_BUCKETS`, `ALL_TICKET_STATUSES` are named identically across Task 1 (definition), Task 2 (test imports), and Task 3 (re-export). `STATUS_BUCKETS` value type tightened from `Record<TicketStatus,string>` to `Record<TicketStatus,LaneKey>` — a strict narrowing, assignable everywhere `string` was expected, so no consumer breaks.

