# Proposal: g-test03-vitest-skip-todo

_Ticket: T001287_

## Why

Three `it.todo` placeholders in `website/src/lib/factory-floor.order.test.ts` declare behaviour that Sub-Plan 4 (T000922) intended to verify — the DOM column order of MobileTabBar and FactoryFloor against the SSOT `PIPELINE_LANES`. While the six passing tests in that file already guard the data layer, the three todos mean that the component-order invariants are **never executed**. Vitest counts them as skipped, the measure command returns 3, and the health goal G-TEST03 stays red.

Defined-but-never-run tests give a false sense of coverage: a developer could reorder `PIPELINE_LANES`, break the mobile tab sequence, and no test would fail. The todos also inflate the skip/todo counter that drives the quarterly test-health target.

## What

The three `it.todo` calls are replaced with real `it(...)` assertions that derive their expected values from the same SSOT constants the passing tests already import:

- `PIPELINE_LANES` and `PHASE_ORDER` from `./tickets/pipeline-order` and `./factory-floor-types`
- `TABS` and `MOBILE_COL_INDEX` from `../../components/factory/MobileTabBar.svelte` (already importable in the `components` Vitest project that runs this file under jsdom + Svelte plugin)

The three assertions:

1. **TABS order** — recompute the expected tab-key sequence from `PIPELINE_LANES` and `PHASE_ORDER` (the same derivation `MobileTabBar.svelte` runs at runtime) and assert `TABS.map(t => t.key)` matches it exactly.
2. **MOBILE_COL_INDEX consistency** — assert that for every entry in `TABS`, `MOBILE_COL_INDEX[tab.key] === index` (the reverse-lookup is consistent with the array position).
3. **FactoryFloor macro-lane order** — assert from `PIPELINE_LANES` (non-side lanes) that the lane with key `qa` has a lower array index than the lane with key `shipped`, encoding the "qa before done" invariant that the FactoryFloor template hardcodes in DOM order.

No production code changes. The fix is purely inside the test file.

## Impact

**Changed files:**
- `website/src/lib/factory-floor.order.test.ts` — three `it.todo` replaced with real assertions

**New files:** none

**Deleted files:** none

**Risks:** The TABS computation in `MobileTabBar.svelte` uses a module-level `<script module>` block, which the Svelte Vite plugin resolves at test time. If the Svelte plugin version changes the way named module exports are handled, the import path may need adjustment. This is low-risk: the file is already in the `COMPONENT_TESTS` list in `vitest.config.ts` and the Svelte plugin is already active for that project.

**Out of scope:** No new test infrastructure, no DB harness, no pg-mem setup. The original plan description mentioned `describe.skip` in `assistant/dismissals` and `assistant/conversations` — those files already use `vi.mock` and run fully (no skip/todo found in the current codebase). This change addresses only the three `it.todo` lines that remain.
