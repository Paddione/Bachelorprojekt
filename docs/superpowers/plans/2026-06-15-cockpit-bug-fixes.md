---
title: Cockpit Bug Fixes — T000792 Implementation Plan
ticket_id: T000792
domains: [website, infra, db, ops]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Cockpit Bug Fixes — T000792 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix 6 bugs in the Cockpit-Redesign (PR #1709) — 1 critical null-crash, 1 high race condition, and 4 medium/low UX bugs.

**Architecture:** All fixes are surgical edits to existing Svelte components and one TypeScript actions module. No new files. Tests extend the existing Vitest suite for each affected file.

**Tech Stack:** Svelte 4, TypeScript, Vitest + @testing-library/svelte, pnpm

---

## File Map

| File | Change |
|------|--------|
| `website/src/components/admin/Cockpit.svelte` | Fix null-safe flatMap + add retry button |
| `website/src/components/admin/CockpitTable.svelte` | Fix patchStatus race (busy guard before mutation) |
| `website/src/components/admin/TicketCreateModal.svelte` | Add 'bug' type option, data-testid on type select, fix close state reset |
| `website/src/components/admin/Cockpit.test.ts` | New failing tests for null-crash + retry |
| `website/src/components/admin/CockpitTable.test.ts` | New failing test for race condition |
| `website/src/components/admin/TicketCreateModal.test.ts` | New failing tests for bug type + state reset |

---

## Task 0: Baseline — verify all existing tests pass

- [x] **Step 1: Run full Vitest suite to confirm green baseline**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS. If any fail, investigate before continuing (the codebase should be clean from main).

---

## Task 1: Fix critical null-crash — `portfolio?.products.flatMap` (Cockpit.svelte:21)

**Root cause:** The reactive statement `portfolio?.products.flatMap(...)` applies `?.` only on `portfolio`, not on `products`. If the portfolio API returns 200 with a non-PortfolioPayload shape (e.g. `{ error: 'db_error' }`), `portfolio.products` is `undefined` and `.flatMap(...)` throws a TypeError that crashes the component.

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte:21`
- Test: `website/src/components/admin/Cockpit.test.ts`

- [x] **Step 1: Write the failing test**

Add to `Cockpit.test.ts` inside `describe('Cockpit shell', ...)`:

```typescript
  it('does not crash when portfolioInitial has no products field', () => {
    // Before fix: throws TypeError: Cannot read properties of undefined (reading 'flatMap')
    expect(() =>
      render(Cockpit, { portfolioInitial: { error: 'db_error' } as any, brand: 'mentolder' })
    ).not.toThrow();
  });
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/Cockpit.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'flatMap')`

- [x] **Step 3: Fix the reactive statement in Cockpit.svelte:21**

Change line 21 from:
```svelte
$: allFeatures = portfolio?.products.flatMap((p) => p.features) ?? [];
```
To:
```svelte
$: allFeatures = portfolio?.products?.flatMap((p) => p.features) ?? [];
```

The second `?.` makes `portfolio.products` safely return `undefined` if products is absent, which then falls through to `?? []`.

- [x] **Step 4: Run test to verify it passes**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/Cockpit.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: all 4+1 tests PASS

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-t000792
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts
git commit -m "fix(cockpit): null-safe products?.flatMap — guard against malformed portfolio API shape [T000792]"
```

---

## Task 2: Fix high race condition — `patchStatus` in CockpitTable.svelte

**Root cause:** `patchStatus` sets `busy[id] = true` AFTER the optimistic state mutation. If two clicks fire before the first fetch completes:
1. Click A: `old_A = t.status` ('open'), `t.status = 'in_progress'` → mutates shared object
2. Click B (before A awaits): `old_B = t.status` ('in_progress' — already mutated by A!), `t.status = 'done'`
3. If A fails → rollback restores 'open' ✓
4. If B fails → rollback restores 'in_progress' ← wrong, server still has 'open' — permanent desync

**Fix:** Check `if (busy[id]) return;` as the FIRST line of `patchStatus` (and `patchPriority`).

**Files:**
- Modify: `website/src/components/admin/CockpitTable.svelte:36,46`
- Test: `website/src/components/admin/CockpitTable.test.ts`

- [x] **Step 1: Write the failing test**

Add to `CockpitTable.test.ts` inside `describe('CockpitTable', ...)`:

```typescript
  it('blocks concurrent patchStatus mutations on the same ticket (busy guard)', async () => {
    let resolveFirst!: (v: Response) => void;
    const hangingFetch = new Promise<Response>((r) => { resolveFirst = r; });
    const spy = vi.spyOn(global, 'fetch')
      .mockReturnValueOnce(hangingFetch)
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { getAllByTestId } = render(CockpitTable,
      { feature, tickets: tickets.map((t) => ({ ...t })), features: [feature] });
    const selects = getAllByTestId('status-select');

    // Fire first mutation — will hang because fetch is unresolved
    fireEvent.change(selects[0], { target: { value: 'done' } });
    // Fire second mutation on the same ticket immediately
    fireEvent.change(selects[0], { target: { value: 'in_review' } });

    // Only ONE fetch should have been called (second blocked by busy guard)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Resolve the first fetch
    resolveFirst(new Response('{}', { status: 200 }));
    // After the first fetch resolves, the second should still not fire (it returned early)
    await waitFor(() => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/CockpitTable.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error|concurrent"
```

Expected: FAIL — `spy` is called 2 times instead of 1 (second mutation is NOT blocked currently)

- [x] **Step 3: Fix patchStatus and patchPriority in CockpitTable.svelte**

In `patchStatus` (line 36), add early-return as the first line:
```svelte
  async function patchStatus(id: string, status: string) {
    if (busy[id]) return;
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.status; t.status = status; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'status', status, old);
    if (await actions.transitionTicket(id, status)) { onMutated?.(); }
    else { t.status = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }
```

Apply the same guard to `patchPriority` (line 46):
```svelte
  async function patchPriority(id: string, priority: string) {
    if (busy[id]) return;
    const t = tickets.find((x) => x.id === id); if (!t) return;
    const old = t.priority; t.priority = priority; tickets = [...tickets];
    busy[id] = true; busy = { ...busy };
    const rollback = applyOptimistic(id, 'priority', priority, old);
    if (await actions.patchPriority(id, priority)) { onMutated?.(); }
    else { t.priority = old; tickets = [...tickets]; rollback(); }
    busy[id] = false; busy = { ...busy };
  }
```

- [x] **Step 4: Run test to verify it passes**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/CockpitTable.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: all 7+1 tests PASS

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-t000792
git add website/src/components/admin/CockpitTable.svelte website/src/components/admin/CockpitTable.test.ts
git commit -m "fix(cockpit): guard patchStatus/patchPriority against concurrent mutations on same ticket [T000792]"
```

---

## Task 3: Add 'bug' type option + testid to TicketCreateModal

**Root cause:** The type `<select>` in TicketCreateModal.svelte has three options (`task`, `feature`, `project`) but is missing `bug` — a valid value in the DB schema. Users cannot create bug tickets via the UI.

**Files:**
- Modify: `website/src/components/admin/TicketCreateModal.svelte:58-63`
- Test: `website/src/components/admin/TicketCreateModal.test.ts`

- [x] **Step 1: Write the failing test**

Add to `TicketCreateModal.test.ts` inside `describe('TicketCreateModal', ...)`:

```typescript
  it('has a "bug" option in the type dropdown', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    const typeSelect = getByTestId('type-select') as HTMLSelectElement;
    const values = Array.from(typeSelect.options).map((o) => o.value);
    expect(values).toContain('bug');
  });
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/TicketCreateModal.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error|bug"
```

Expected: FAIL — `Unable to find an element by: [data-testid="type-select"]` (testid doesn't exist yet)

- [x] **Step 3: Add data-testid + bug option to the type select in TicketCreateModal.svelte**

Replace the type `<select>` block (lines 58–63):
```svelte
      <label>Typ
        <select bind:value={type}>
          <option value="task">Aufgabe</option>
          <option value="feature">Feature</option>
          <option value="project">Projekt</option>
        </select>
      </label>
```
With:
```svelte
      <label>Typ
        <select data-testid="type-select" bind:value={type}>
          <option value="task">Aufgabe</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="project">Projekt</option>
        </select>
      </label>
```

- [x] **Step 4: Run test to verify it passes**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/TicketCreateModal.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: all 5+1 tests PASS

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-t000792
git add website/src/components/admin/TicketCreateModal.svelte website/src/components/admin/TicketCreateModal.test.ts
git commit -m "fix(cockpit): add 'bug' type to TicketCreateModal dropdown [T000792]"
```

---

## Task 4: Fix modal state reset on close (defaultFeatureId reactivity + error persistence)

**Root causes:**
- Bug 6: `$: if (open && defaultFeatureId && !parentId)` — the `!parentId` guard prevents updating `parentId` when modal is reopened with a different feature. Fix: reset `parentId` to `''` in `close()`, so the reactive statement fires correctly on next open.
- Bug 8: `error` is not cleared in `close()`. If the modal is closed while showing an error (failed submit), the error persists on next open.

**Fix:** In `close()`, reset `parentId`, `error`, and all form state to initial values.

**Files:**
- Modify: `website/src/components/admin/TicketCreateModal.svelte:23-25`
- Test: `website/src/components/admin/TicketCreateModal.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `TicketCreateModal.test.ts` inside `describe('TicketCreateModal', ...)`:

```typescript
  it('updates parentId when modal is reopened with a different defaultFeatureId', async () => {
    const features2 = [
      ...features,
      { id: 'f2', extId: 'F2', title: 'Billing', priority: 'hoch', health: 'green' as const,
        rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 } },
    ];
    const onClose = vi.fn();
    const { getByTestId, rerender } = render(TicketCreateModal,
      { open: true, features: features2, onClose, defaultFeatureId: 'f1' });
    const featureSelect = getByTestId('feature-select') as HTMLSelectElement;
    expect(featureSelect.value).toBe('f1');

    // Close the modal (simulates onClose -> parent sets open=false)
    await rerender({ open: false, features: features2, onClose, defaultFeatureId: 'f1' });
    // Reopen with a different feature selected in the parent
    await rerender({ open: true, features: features2, onClose, defaultFeatureId: 'f2' });
    expect(featureSelect.value).toBe('f2');
  });

  it('clears the error when the modal is closed and reopened', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), { status: 400 }));
    const onClose = vi.fn();
    const { getByTestId, queryByText, rerender } = render(TicketCreateModal,
      { open: true, features, onClose });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'X' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(queryByText('server error')).toBeTruthy());

    // Close and reopen
    await rerender({ open: false, features, onClose });
    await rerender({ open: true, features, onClose });
    expect(queryByText('server error')).toBeNull();
  });
```

Note: The `defaultFeatureId` test also requires a `data-testid="feature-select"` on the feature select (see Step 3).

- [x] **Step 2: Run tests to verify they fail**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/TicketCreateModal.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error|parentId|feature"
```

Expected: 2 new tests FAIL

- [x] **Step 3: Fix TicketCreateModal.svelte — add data-testid to feature select + fix close()**

Add `data-testid="feature-select"` to the feature select (lines 52–56):
```svelte
      <label>Feature
        <select data-testid="feature-select" bind:value={parentId}>
          <option value="">— kein Feature —</option>
          {#each features as f (f.id)}<option value={f.id}>{f.title}</option>{/each}
        </select>
      </label>
```

Replace `close()` function (lines 23–25):
```svelte
  function close() {
    parentId = '';
    title = '';
    description = '';
    component = '';
    error = null;
    onClose();
  }
```

The existing reactive statement `$: if (open && defaultFeatureId && !parentId) parentId = defaultFeatureId;` now works correctly: after `close()` resets `parentId = ''`, the NEXT open sees `!parentId` as true and picks up the new `defaultFeatureId`.

- [x] **Step 4: Run tests to verify they pass**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/TicketCreateModal.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: all 5+3 tests PASS

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-t000792
git add website/src/components/admin/TicketCreateModal.svelte website/src/components/admin/TicketCreateModal.test.ts
git commit -m "fix(cockpit): reset modal state on close — fixes defaultFeatureId reactivity + error persistence [T000792]"
```

---

## Task 5: Add retry button for portfolio load failure (Cockpit.svelte)

**Root cause:** When `loadPortfolio()` fails (network error or server error), the component shows an error toast but `portfolio` remains null — rendering an empty shell. The user has no way to recover without a full page reload.

**Fix:** When `$cockpitStore.error` is set AND `portfolio` is null, show a retry button next to the error toast.

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte:67`
- Test: `website/src/components/admin/Cockpit.test.ts`

- [x] **Step 1: Write the failing test**

Add to `Cockpit.test.ts` inside `describe('Cockpit shell', ...)`:

```typescript
  it('shows a retry button when portfolio fetch fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify(portfolioWithFeature), { status: 200 }));

    const { findByRole } = render(Cockpit, { brand: 'mentolder' });
    const retryBtn = await findByRole('button', { name: /wiederholen|retry/i });
    expect(retryBtn).toBeTruthy();

    // Click retry — should reload portfolio successfully
    await fireEvent.click(retryBtn);
    await waitFor(() => expect(document.querySelector('[data-testid="cockpit-sidebar"]')).toBeTruthy());
  });
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/Cockpit.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error|retry|Retry"
```

Expected: FAIL — no retry button found

- [x] **Step 3: Add retry button to Cockpit.svelte template**

Replace the error toast block (line 67):
```svelte
  {#if $cockpitStore.error}<div class="toast error">{$cockpitStore.error}</div>{/if}
```
With:
```svelte
  {#if $cockpitStore.error}
    <div class="toast error">
      {$cockpitStore.error}
      {#if !portfolio}
        <button class="retry" on:click={loadPortfolio} aria-label="Wiederholen">
          Wiederholen
        </button>
      {/if}
    </div>
  {/if}
```

Add retry button style to the `<style>` block:
```svelte
  .retry { margin-left: 0.5rem; background: rgba(255,255,255,0.2); border: none;
    color: #fff; border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font-size: 0.8rem; }
```

- [x] **Step 4: Run test to verify it passes**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run src/components/admin/Cockpit.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error"
```

Expected: all 5+2 tests PASS

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-t000792
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts
git commit -m "fix(cockpit): show retry button when portfolio fetch fails [T000792]"
```

---

## Task 6: Final verification

- [x] **Step 1: Run full Vitest suite**

```bash
cd /tmp/wt-t000792/website && pnpm exec vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS (no regressions in other components)

- [x] **Step 2: Update test inventory**

```bash
cd /tmp/wt-t000792 && task test:inventory 2>&1 | tail -5
git add website/src/data/test-inventory.json
git diff --cached --stat
```

Commit only if the file changed:
```bash
git commit -m "chore(tests): regenerate test-inventory after cockpit bug-fix tests [T000792]" \
  -- website/src/data/test-inventory.json 2>/dev/null || echo "Inventory unchanged"
```

- [x] **Step 3: Freshness regenerate + check**

```bash
cd /tmp/wt-t000792 && task freshness:regenerate 2>&1 | tail -5
task freshness:check 2>&1 | tail -10
```

Expected: `freshness:check` exits 0 (no drift)

If `freshness:check` reports generated-artifact drift, commit the regenerated files:
```bash
git add docs/generated/ docs/code-quality/repo-index.json k3d/docs-content-built/architecture/index.html
git commit -m "chore: regenerate freshness artifacts [ci skip]"
```

- [ ] **Step 4: Push branch**

```bash
cd /tmp/wt-t000792 && git push -u origin fix/t000792-cockpit-bugs
```

- [ ] **Step 5: Open PR with auto-merge**

```bash
gh pr create \
  --title "fix(cockpit): fix 5 bugs from AI review — null-crash, race, missing type, modal reset, retry [T000792]" \
  --body "$(cat <<'EOF'
## Summary

- **critical:** `portfolio?.products?.flatMap` double-optional-chain prevents TypeError crash on malformed API response
- **high:** `patchStatus`/`patchPriority` busy guard added BEFORE optimistic mutation — prevents concurrent click desync
- **medium:** Added `bug` type option to TicketCreateModal dropdown
- **medium:** `close()` now resets `parentId`+`error` — fixes defaultFeatureId reactivity on reopen
- **medium:** Retry button shown in error toast when portfolio is null

## Test plan

- [x] Run `cd website && pnpm exec vitest run` — all tests pass
- [x] Open `/admin/cockpit`, force a 500 on the portfolio endpoint (DevTools) → retry button appears
- [x] Create a Bug ticket via the modal — `Bug` option should appear in type dropdown
- [x] Select Feature A, open create modal, close, select Feature B, open modal → Feature B pre-selected
- [x] Rapid-click a status dropdown twice — only one fetch fires (check Network tab)

Closes T000792

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"

gh pr merge --squash --auto
```

---

## Bug Reference Summary

| # | Severity | Location | Bug | Fix |
|---|----------|----------|-----|-----|
| 2 | critical | Cockpit.svelte:21 | `products.flatMap` crashes if products undefined | `products?.flatMap` |
| 3 | high | CockpitTable.svelte:36,46 | Concurrent mutation race — rollback uses stale `old` | Early `if (busy[id]) return` |
| 5 | medium | TicketCreateModal.svelte:58 | Missing 'bug' type option | Add `<option value="bug">Bug</option>` |
| 6 | medium | TicketCreateModal.svelte:20 | Stale `parentId` on reopen with different feature | `close()` resets `parentId = ''` |
| 4 | medium | Cockpit.svelte:67 | No recovery path after portfolio load failure | Retry button in error toast |
| 8 | low | TicketCreateModal.svelte:23 | Error persists after modal close | `close()` resets `error = null` |

**Skipped (false positive from AI review):** Bug 1 — `initStoreFromUrl` is synchronous; no actual race with `loadFeature`. Bug 7 — `createTicket` JSON parse on 204 already handled via try/catch; UI handles `body: undefined` via optional chain.
