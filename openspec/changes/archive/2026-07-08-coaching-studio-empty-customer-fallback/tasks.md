---
title: "coaching-studio-empty-customer-fallback — fix Workspace crash when CUSTOMERS is empty"
ticket_id: T001656
domains: [website]
status: completed
---

# coaching-studio-empty-customer-fallback — Implementation Plan

Fixes a crash in the static coaching-studio prototype (`website/public/coaching-studio/`):
PR #2545 (T001560) emptied the hardcoded `CUSTOMERS` array in `data.jsx` but left several
screens defaulting to `customer || CUSTOMERS[0]`, which now resolves to `undefined`. Clicking
"Neue Session" (or loading the app fresh) then crashes with
`Cannot read properties of undefined (reading 'name')` in `Workspace()`
(`website/public/coaching-studio/workspace.jsx:174`).

## File Structure

Modified files (fix already applied to the working tree, verified against the earlier
console error — this plan adds the missing test coverage and formalizes the change):
- `website/public/coaching-studio/data.jsx` — adds `EMPTY_CUSTOMER` placeholder object,
  exposed via `Object.assign(window, {...})`. `.jsx` extension: not covered by the S1
  line-limit table (S1 applies to `.ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs`
  — wait, `.jsx` IS listed); check baseline: `jq -r '."S1:website/public/coaching-studio/data.jsx".metric // "nicht-baselined"' docs/code-quality/baseline.json` →
  `nicht-baselined` (file not in baseline, it's a static prototype asset outside the normal
  `src/` tree). Net change: +7 lines. No S1 concern (small net add to an unbaselined file).
- `website/public/coaching-studio/workspace.jsx` — `Workspace()`'s `cust` fallback:
  `customer || CUSTOMERS[0]` → `customer || CUSTOMERS[0] || EMPTY_CUSTOMER`. Net: +1/-1 line.
  `nicht-baselined` (same reasoning).
- `website/public/coaching-studio/screens_core.jsx` — same fallback fix in `Kundenakte()` and
  `ProfileEditor()`. Net: +2/-2 lines. `nicht-baselined`.
- `website/public/coaching-studio/screens_more.jsx` — same fallback fix in `CompareView()`.
  Net: +1/-1 line. `nicht-baselined`.

New file:
- `tests/e2e/specs/coaching-studio-empty-customer.spec.ts` — Playwright test that loads
  `/coaching-studio/` and drives the crash path directly (no unit-test harness exists for
  this directory: it's plain Babel-in-browser JSX with no bundler/module system, so Vitest
  cannot import it — the only realistic verification is a real browser).

## Reference patterns (read before implementing)

- `website/public/coaching-studio/app.jsx` — the app shell; `TopBar`'s "Session" button and
  `Dashboard`'s "Neue Session" button both call `onNav("workspace", CUSTOMERS[0])`, which is
  how `customer=undefined` reaches `Workspace()` when `CUSTOMERS` is empty.
- `website/public/coaching-studio/data.jsx` line ~107 — `const CUSTOMERS = [];` (the state
  that triggers the bug; do not repopulate it — T001560 intentionally emptied it for privacy
  reasons; the fix is a safe fallback, not reverting the emptying).
- Existing Playwright specs under `tests/e2e/specs/` for the page-navigation + assertion
  pattern this repo uses (e.g. any existing `*.spec.ts` that does `page.goto(...)` +
  `page.click(...)` + asserts no console error) — follow the same structure/imports.

## Task 1 — Failing E2E test reproducing the crash (RED)

Create `tests/e2e/specs/coaching-studio-empty-customer.spec.ts`:
- Navigate to the coaching-studio prototype page (check `website/src/pages/` or static
  routing for how `/coaching-studio/` or `/public/coaching-studio/index.html` is served in
  dev — confirm the actual served path before writing the test; it's under `website/public/`
  so Astro serves it statically at `/coaching-studio/`).
- Listen for `pageerror` / uncaught exceptions on the page (Playwright:
  `page.on('pageerror', ...)`).
- Click the "Neue Session" button (Dashboard) or the "Session" button (TopBar) — whichever is
  reachable first on initial load.
- Assert: no `pageerror` was emitted, and the workspace screen (`.ws` container or
  `Ebene 01` heading) renders.

Run this test against the CURRENT `main` state of `data.jsx`/`workspace.jsx` first (temporarily
`git stash` the fix in this worktree, or check out the pre-fix blob) to confirm it fails —
**expected: FAIL** (the crash reproduces: `pageerror` fires with
"Cannot read properties of undefined"). Then restore the fix and re-run to confirm green.

**Verify:** `npx playwright test tests/e2e/specs/coaching-studio-empty-customer.spec.ts` —
FAILS against the pre-fix code, PASSES with the fix applied.

## Task 2 — Confirm the fix (already applied) matches the plan

The fix is already present in this worktree (`EMPTY_CUSTOMER` in `data.jsx` +
`customer || CUSTOMERS[0] || EMPTY_CUSTOMER` in the four screen files listed above). Verify:
- `EMPTY_CUSTOMER` has all fields the screens read: `name`, `initials`, `since`, `lang`,
  `category`, `aktiv`, `pausiert`, `fertig`, `sessions` (array, since `Kundenakte` reads
  `k.sessions.length` and `k.sessions.map(...)`).
- All four fallback sites (`workspace.jsx`, `screens_core.jsx` ×2, `screens_more.jsx`) use the
  identical `customer || CUSTOMERS[0] || EMPTY_CUSTOMER` expression.

No code changes expected in this task if the existing diff already satisfies both — just
confirm via `grep -n "EMPTY_CUSTOMER" website/public/coaching-studio/*.jsx`.

**Verify:** `grep -c EMPTY_CUSTOMER website/public/coaching-studio/data.jsx` → `2` (definition +
window export); `grep -c "CUSTOMERS\[0\] || EMPTY_CUSTOMER" website/public/coaching-studio/workspace.jsx website/public/coaching-studio/screens_core.jsx website/public/coaching-studio/screens_more.jsx` → `1`, `2`, `1` respectively.

## Task 3 — Test inventory + final verification (mandatory gates)

1. Regenerate the test inventory (a new E2E spec was added):
   ```bash
   task test:inventory
   ```
   Commit the updated `website/src/data/test-inventory.json`.
2. Run the three mandatory verify commands:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
3. Run the new E2E spec explicitly to confirm it's green against the fixed code:
   ```bash
   npx playwright test tests/e2e/specs/coaching-studio-empty-customer.spec.ts
   ```

**Verify:** all three `task` commands exit 0; the new Playwright spec passes.
