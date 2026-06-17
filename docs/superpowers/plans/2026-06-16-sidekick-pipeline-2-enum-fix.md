---
title: Sidekick Pipeline — Stale-Enum Consistency (SP2)
ticket_id: T000920
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

# Sidekick Pipeline Stale-Enum Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the stale ticket-state enums up to the full main state model so a ticket in `qa_review` (and `planning`/`plan_staged`) can be displayed and set everywhere: add `qa_review` to the manual transition gate, and make the Sidekick ticket dropdown source its labels from the canonical `cockpit-labels.ts` instead of a stale local 7-state map.

**Architecture:** Two independent edits plus an audit. (1) `transition.ts` gains `qa_review` in `TicketStatus` + `VALID_STATUSES`; `qa_review` is non-terminal so the existing resolution guards already treat it correctly (no resolution required, resolution forbidden). A small `isValidStatus` type-guard is exported so the gate is unit-testable without booting the `pg` Pool. (2) `TicketSidekickView.svelte` drops its local 7-state `TicketStatus` type and hand-rolled `STATUS_LABELS`, importing the canonical `STATUS_LABELS` (+ `statusLabel`, `defaultResolutionFor`) from the pure `cockpit-labels.ts` — so the dropdown knows `planning`/`plan_staged`/`qa_review` and the current status always has a matching option. (3) `cockpit-labels.ts` is audited: its `STATUS_LABELS` already covers all 10 main states, so it needs no change beyond confirmation.

**Tech Stack:** TypeScript, Vitest, Astro/Svelte website workspace.

---

## File Ownership & Scope

This sub-plan owns **exclusively** (per spec §4 table, SP2 row):

- `website/src/lib/tickets/transition.ts` — modify (add `qa_review`, export `isValidStatus`).
- `website/src/lib/tickets/cockpit-labels.ts` — audit-only (already complete; no functional change expected).
- `website/src/components/assistant/TicketSidekickView.svelte` — modify (import canonical labels, drop stale local enum/map).

It does **not** touch `factory-floor.ts`/`pipeline-order.ts` (SP1), any FactoryFloor component (SP4), or the new Sidekick pipeline view (SP3). It does **not** modify `scripts/factory/pipeline.js` (automation stays as-is). `qa_review` is the only state added on main (there is no `awaiting_deploy` on main — do not introduce it).

## File Structure

| File | Role | Change |
|------|------|--------|
| `website/src/lib/tickets/transition.ts` | Manual/PM transition gate | Add `qa_review` to `TicketStatus` + `VALID_STATUSES`; export `isValidStatus` type-guard |
| `website/src/lib/tickets/cockpit-labels.ts` | Pure label SSOT (no DB) | Audit: `STATUS_LABELS` already has all 10 states incl. `qa_review` → no functional change |
| `website/src/components/assistant/TicketSidekickView.svelte` | Sidekick admin ticket view | Import `STATUS_LABELS`/`statusLabel`/`defaultResolutionFor` from `cockpit-labels.ts`; remove local 7-state type + map; dropdown covers every main state |

## Pre-flight: S1 line budgets (effective threshold per touched file)

| File | wc -l (origin/main) | baseline | ext limit | effective threshold | budget |
|------|---------------------|----------|-----------|---------------------|--------|
| `website/src/lib/tickets/transition.ts` | 147 | nicht-baselined | 600 (.ts) | 600 | +453 (ample) |
| `website/src/lib/tickets/cockpit-labels.ts` | 61 | nicht-baselined | 600 (.ts) | 600 | +539 (no change planned) |
| `website/src/components/assistant/TicketSidekickView.svelte` | 624 | **624** | — | **624 (baselined)** | **0 — must be line-neutral or shrink** |

**How SP2 stays within budget:**
- `transition.ts`: adding `qa_review` extends the existing `TicketStatus` union line and the `VALID_STATUSES` array line in place (no new lines); the exported `isValidStatus` helper adds ~2 lines — well under the +453 budget.
- `cockpit-labels.ts`: no functional change (audit confirms `STATUS_LABELS` already complete) → 0 lines.
- `TicketSidekickView.svelte` has **zero budget** (baselined at 624). This change is a **net shrink**: it removes the local `type TicketStatus = …` line (~1) and the hand-rolled `const STATUS_LABELS: Record<TicketStatus,string> = { … }` block (~4 lines) and adds a single `import { … } from '../../lib/tickets/cockpit-labels'` line — net ≈ −4 lines → ends ≈ 620, at/under baseline. The implementation MUST verify `wc -l` ≤ 624 before commit (Task 4) and shrink further if any helper is inlined.

No baseline entries are added or removed (transition.ts/cockpit-labels.ts stay under 600; TicketSidekickView stays ≤ its existing baseline), so the `freshness:check` baseline-key-count assertion stays green.

---

### Task 1: Write the failing tests (red)

**Files:**
- Create: `website/src/lib/tickets/transition.status.test.ts`
- Create: `website/src/components/assistant/TicketSidekickView.options.test.ts`

- [ ] **Step 1: Transition-gate test (no DB)**

Create `website/src/lib/tickets/transition.status.test.ts` importing a not-yet-existing `isValidStatus` from `./transition` and asserting it accepts `qa_review` and rejects garbage. This fails to compile/run until Task 2 exports the guard and adds `qa_review`.

```typescript
import { describe, it, expect } from 'vitest';
import { isValidStatus } from './transition';

describe('transition status gate', () => {
  it('accepts qa_review (added on main parity)', () => {
    expect(isValidStatus('qa_review')).toBe(true);
  });
  it('accepts the existing pipeline states', () => {
    for (const s of ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'blocked', 'done', 'archived']) {
      expect(isValidStatus(s)).toBe(true);
    }
  });
  it('rejects an unknown state', () => {
    expect(isValidStatus('awaiting_deploy')).toBe(false); // not on main
    expect(isValidStatus('nonsense')).toBe(false);
  });
});
```

- [ ] **Step 2: Sidekick dropdown-coverage test**

Create `website/src/components/assistant/TicketSidekickView.options.test.ts`. Rather than mounting the full component (which fetches on mount), assert the canonical label source the component will use covers every state the dropdown must render — guarding the single-source intent. Pattern mirrors the existing `website/src/components/PortalSidekick.test.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { STATUS_LABELS } from '../../lib/tickets/cockpit-labels';

describe('Sidekick ticket status options', () => {
  it('cockpit-labels covers the states the Sidekick must show (no blank dropdown)', () => {
    for (const s of ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'blocked', 'done', 'archived']) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run to confirm red**

Run: `pnpm --dir website exec vitest run transition.status TicketSidekickView.options`
Expected: FAIL — `isValidStatus` import is unresolved (not yet exported). The label-coverage test already passes (labels exist) but is kept as a regression guard. The point of red here is the transition guard.

- [ ] **Step 4: Commit the failing tests**

```bash
git add website/src/lib/tickets/transition.status.test.ts website/src/components/assistant/TicketSidekickView.options.test.ts
git commit -m "test(website): qa_review transition gate + Sidekick label coverage (failing) [T000920]"
```

---

### Task 2: Add qa_review to the transition gate (green)

**Files:**
- Modify: `website/src/lib/tickets/transition.ts`

- [ ] **Step 1: Extend the type + valid set, export the guard**

In `website/src/lib/tickets/transition.ts`:
- Add `'qa_review'` to the `TicketStatus` union (line ~7-8), between `'in_review'` and `'blocked'` (mirrors the `ALL_TICKET_STATUSES` order).
- Add `'qa_review'` to the `VALID_STATUSES` set literal (line ~13-14).
- Add an exported type-guard immediately after `VALID_STATUSES`:

```typescript
export function isValidStatus(s: string): s is TicketStatus {
  return VALID_STATUSES.has(s as TicketStatus);
}
```

No change to the resolution guards (lines ~44-52): `qa_review` is non-terminal, so it requires no resolution and forbids one — the existing logic already handles it correctly.

- [ ] **Step 2: Run the gate test (green)**

Run: `pnpm --dir website exec vitest run transition.status`
Expected: PASS — `qa_review` accepted, unknown states rejected.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets/transition.ts
git commit -m "fix(website): accept qa_review in manual transition gate [T000920]"
```

---

### Task 3: Sidekick dropdown sources canonical labels (green + shrink)

**Files:**
- Modify: `website/src/components/assistant/TicketSidekickView.svelte`

- [ ] **Step 1: Replace the stale local enum + label map with a canonical import**

In `website/src/components/assistant/TicketSidekickView.svelte`:
- Remove the local 7-state `type TicketStatus = …` (line ~5). Import the type from the canonical source instead: `import { STATUS_LABELS, statusLabel, defaultResolutionFor } from '../../lib/tickets/cockpit-labels';` and import `type TicketStatus` from `../../lib/tickets/transition` (or keep a widened `string` status on `TicketRow` — choose the smaller diff; `cockpit-labels` is the label authority either way).
- Remove the hand-rolled `const STATUS_LABELS: Record<TicketStatus,string> = { … }` block (lines ~26-29). The dropdown's `{#each Object.entries(STATUS_LABELS)}` now iterates the canonical map, so `planning`/`plan_staged`/`qa_review` appear and the current status always has a matching `<option>`.
- For a ticket whose current status is not in the curated set, the `value={t.status}` binding still resolves because the option now exists. When the user selects a terminal status (`done`/`archived`), send `defaultResolutionFor(t.type)` alongside the status in `changeStatus` so the `/transition` route does not 400 (it requires a resolution for terminal states). Keep this minimal — reuse the existing `changeStatus` POST body shape.

- [ ] **Step 2: Verify the file did not grow past its baseline (S1 budget = 0)**

Run: `wc -l website/src/components/assistant/TicketSidekickView.svelte`
Expected: ≤ 624 (ideally ~620). If it grew, inline fewer locals / drop the now-unused `TYPE_LABELS`/`PRIORITY_LABELS` only if also sourced canonically — but do NOT expand scope; the net change must be ≤ 0 lines.

- [ ] **Step 3: Run the coverage + existing Sidekick tests**

Run: `pnpm --dir website exec vitest run TicketSidekickView PortalSidekick`
Expected: PASS — dropdown label set covers all states; existing PortalSidekick tests still pass (no prop/contract change).

- [ ] **Step 4: Commit**

```bash
git add website/src/components/assistant/TicketSidekickView.svelte
git commit -m "fix(website): Sidekick ticket dropdown sources canonical labels [T000920]"
```

---

### Task 4: Audit cockpit-labels + final verification gate

**Files:**
- Audit: `website/src/lib/tickets/cockpit-labels.ts` (expected: no change)
- Regenerated artifacts (`website/src/data/test-inventory.json`, freshness outputs) committed here.

- [ ] **Step 1: Confirm cockpit-labels completeness**

Confirm `STATUS_LABELS` in `cockpit-labels.ts` has an entry for every main state (`triage, planning, plan_staged, backlog, in_progress, in_review, qa_review, blocked, done, archived`). It does today — make NO change unless a gap is found. Do not add `awaiting_deploy` (not on main).

- [ ] **Step 2: Run targeted tests for changed domains**

Run: `task test:changed`
Expected: PASS — the new transition + Sidekick tests run; S1–S4 ratchet over touched files passes (TicketSidekickView ≤ baseline; transition.ts/cockpit-labels.ts under limit; no new import cycle — `cockpit-labels.ts` stays pure; no brand-domain literal; new tests auto-discovered, not orphaned).

- [ ] **Step 3: Regenerate test inventory (tests were added)**

Run: `task test:inventory`
Expected: regenerates `website/src/data/test-inventory.json` to include the two new test files.

- [ ] **Step 4: Regenerate + check freshness**

Run: `task freshness:regenerate` then `task freshness:check`
Expected: PASS — freshness clean, S1–S4 ratchet green, baseline key-count unchanged.

- [ ] **Step 5: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality docs/generated
git commit -m "chore(website): regenerate test-inventory + freshness for enum fix [T000920]"
```

---

## Self-Review

**Spec coverage (spec §4 SP2 row + §7):**
- `transition.ts` gains `qa_review` (non-terminal, no resolution) → Task 2.
- `cockpit-labels.ts` audited complete, no invented labels → Task 4 Step 1.
- `TicketSidekickView` stale 7-state enum replaced by canonical import; dropdown covers all states → Task 3.
- Automation (`pipeline.js`) untouched → not in scope, not referenced.
- No `awaiting_deploy` introduced (main parity) → asserted negatively in Task 1 test.

**Placeholder scan:** none in prose — no open placeholder tokens; the only enum-name references are real states quoted as code.

**Budget discipline:** the only zero-budget file is `TicketSidekickView.svelte` (baselined 624); the change is a net shrink (remove local type + label map, add one import) with an explicit `wc -l ≤ 624` gate in Task 3 Step 2.

**Isolation:** `cockpit-labels.ts` stays a pure module (no DB/UI import) so both `transition` tests and the Svelte component can import it without side effects; no import cycle introduced.
