---
title: Brett Figuren-Filter (T000607) Implementation Plan
ticket_id: null
domains: [website, db]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Brett Figuren-Filter (T000607) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a topbar search input that dims non-matching figures to opacity 0.15 (client-local, session-only, no WS traffic).

**Architecture:** A new `topbar-filter.ts` module provides pure helpers (`matchesFigureFilter`) and a DOM-mount function (`mountFilterInput`). `mannequin.ts` gains `updateFilterVisuals(figures, query)` which traverses figure meshes and sets opacity — the same material-override pattern used by the existing `updateModerationVisuals`. The board-boot tick loop calls both in sequence each frame. No new server code.

**Tech Stack:** TypeScript, Three.js (opacity on MeshStandardMaterial), Node.js built-in test runner (`node:test`) matching the rest of the brett test suite.

---

## File Map

- **Create:** `brett/src/client/ui/topbar-filter.ts` — pure helpers + DOM mount
- **Create:** `brett/test/topbar-filter.test.ts` — unit tests for pure helpers + filter visuals
- **Modify:** `brett/src/client/mannequin.ts` — add `updateFilterVisuals`
- **Modify:** `brett/src/client/board-boot.ts` — mount filter input + call `updateFilterVisuals` in tick
- **Modify:** `brett/public/index.html` — add `<div id="topbar-filter-slot"></div>`

---

## Task 1: Add `topbar-filter-slot` to HTML

**Files:**
- Modify: `brett/public/index.html`

Context: The topbar right-hand group currently ends with `topbar-invite-slot`. We insert the filter slot just before `topbar-participants-slot` so it appears: `[filter] [participants] [invite] ● N online`.

- [ ] **Step 1: Locate insertion point**

Open `brett/public/index.html`. Find the block:
```html
      <div id="topbar-participants-slot"></div>
      <div id="topbar-invite-slot"></div>
```
This is around line 352–353.

- [ ] **Step 2: Insert filter slot**

Add a new slot directly before `topbar-participants-slot`:
```html
      <div id="topbar-filter-slot"></div>
      <div id="topbar-participants-slot"></div>
      <div id="topbar-invite-slot"></div>
```

- [ ] **Step 3: Verify HTML builds**

```bash
cd brett && npm run build 2>&1 | tail -5
```
Expected: no errors; `dist/client/index.html` is updated.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): add topbar-filter-slot to index.html [T000607]"
```

---

## Task 2: Write pure helper + module skeleton for `topbar-filter.ts`

**Files:**
- Create: `brett/src/client/ui/topbar-filter.ts`
- Create: `brett/test/topbar-filter.test.ts`

The pure helper `matchesFigureFilter(label, query)` and getter `getFilterQuery()` are the testable units. DOM-mounting lives in `mountFilterInput`.

- [ ] **Step 1: Write the failing test**

Create `brett/test/topbar-filter.test.ts`:

```typescript
// brett/test/topbar-filter.test.ts — T000607: Figuren-Filter
import { test } from 'node:test';
import assert from 'node:assert';
import { matchesFigureFilter } from '../src/client/ui/topbar-filter';

// ── matchesFigureFilter ──────────────────────────────────────────────────────

test('matchesFigureFilter: empty query matches everything', () => {
  assert.strictEqual(matchesFigureFilter('Anna', ''), true);
  assert.strictEqual(matchesFigureFilter('', ''), true);
  assert.strictEqual(matchesFigureFilter('Bernd', ''), true);
});

test('matchesFigureFilter: case-insensitive substring match', () => {
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'anna'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'ANNA'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'müller'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'Müller'), true);
});

test('matchesFigureFilter: no match returns false', () => {
  assert.strictEqual(matchesFigureFilter('Anna', 'Bernd'), false);
  assert.strictEqual(matchesFigureFilter('', 'x'), false);
});

test('matchesFigureFilter: partial match anywhere in label', () => {
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'heinz'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'karl'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', '-'), true);
});

test('matchesFigureFilter: null/undefined label treated as empty string', () => {
  assert.strictEqual(matchesFigureFilter(null as any, ''), true);
  assert.strictEqual(matchesFigureFilter(undefined as any, ''), true);
  assert.strictEqual(matchesFigureFilter(null as any, 'x'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd brett && npm test 2>&1 | grep -E "topbar-filter|FAIL|Error" | head -20
```
Expected: error like `Cannot find module '../src/client/ui/topbar-filter'`.

- [ ] **Step 3: Implement `topbar-filter.ts`**

Create `brett/src/client/ui/topbar-filter.ts`:

```typescript
// brett/src/client/ui/topbar-filter.ts — T000607: Figuren-Filter
// Pure helpers are node-testable (no top-level DOM access).
// DOM lives exclusively inside mountFilterInput().

// ── Module-level filter state ────────────────────────────────────────────────

let _filterQuery = '';

/** Returns the current filter query (lowercased, trimmed). */
export function getFilterQuery(): string {
  return _filterQuery;
}

/** Set programmatically (also used by tests). */
export function setFilterQuery(q: string): void {
  _filterQuery = q.trim().toLowerCase();
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if `label` contains `query` as a case-insensitive substring,
 * or if `query` is empty (no filter active).
 */
export function matchesFigureFilter(label: string | null | undefined, query: string): boolean {
  if (!query) return true;
  const norm = (label ?? '').toLowerCase();
  return norm.includes(query.toLowerCase());
}

// ── DOM mount ────────────────────────────────────────────────────────────────

const FILTER_STYLE_ID = 'brett-topbar-filter';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(FILTER_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = FILTER_STYLE_ID;
  el.textContent = [
    '.brett-filter-wrap{position:relative;display:inline-flex;align-items:center;}',
    '.brett-filter-input{font-family:var(--brett-font-sans,sans-serif);font-size:12px;',
    'background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:5px 24px 5px 8px;',
    'width:140px;outline:none;}',
    '.brett-filter-input:focus{border-color:var(--brett-brass,#c8a96e);}',
    '.brett-filter-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);',
    'background:none;border:none;color:var(--brett-mute,#8a93a3);cursor:pointer;',
    'font-size:13px;line-height:1;padding:0;display:none;}',
    '.brett-filter-clear.visible{display:block;}',
  ].join('');
  doc.head.appendChild(el);
}

export interface FilterMountOptions {
  /** Called whenever the query changes. Receives trimmed lowercase string. */
  onChange: (query: string) => void;
}

/**
 * Mount the filter input into `anchorEl`.
 * Returns `{ destroy }` for cleanup.
 */
export function mountFilterInput(
  anchorEl: HTMLElement,
  opts: FilterMountOptions,
): { destroy: () => void } {
  injectStyles();

  const wrap = document.createElement('div');
  wrap.className = 'brett-filter-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'brett-filter-input';
  input.placeholder = 'Figur suchen …';
  input.maxLength = 40;
  input.setAttribute('aria-label', 'Figur nach Name filtern');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'brett-filter-clear';
  clearBtn.textContent = '×';
  clearBtn.setAttribute('aria-label', 'Filter löschen');

  wrap.appendChild(input);
  wrap.appendChild(clearBtn);
  anchorEl.appendChild(wrap);

  function applyQuery(q: string): void {
    setFilterQuery(q);
    opts.onChange(_filterQuery);
    clearBtn.classList.toggle('visible', _filterQuery.length > 0);
  }

  function onInput(): void {
    applyQuery(input.value);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      input.value = '';
      applyQuery('');
      input.blur();
    }
  }

  function onClear(): void {
    input.value = '';
    applyQuery('');
    input.focus();
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  clearBtn.addEventListener('click', onClear);

  return {
    destroy() {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      clearBtn.removeEventListener('click', onClear);
      wrap.remove();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd brett && npm test 2>&1 | grep -E "topbar-filter|pass|fail" | head -20
```
Expected: all `topbar-filter.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/topbar-filter.ts brett/test/topbar-filter.test.ts
git commit -m "feat(brett): topbar-filter pure helpers + DOM mount skeleton [T000607]"
```

---

## Task 3: Add `updateFilterVisuals` to `mannequin.ts`

**Files:**
- Modify: `brett/src/client/mannequin.ts`
- Modify: `brett/test/topbar-filter.test.ts` (add new tests)

This function mirrors `updateModerationVisuals` but for label-based dim. It runs independently and only affects opacity when a filter query is active.

- [ ] **Step 1: Write failing tests for `updateFilterVisuals`**

Append to `brett/test/topbar-filter.test.ts`:

```typescript
import { updateFilterVisuals } from '../src/client/mannequin';

// ── updateFilterVisuals ──────────────────────────────────────────────────────

function makeFakeFig(id: string, label: string, opacity = 1.0): any {
  const mesh = {
    isMesh: true,
    userData: {},
    material: { opacity, transparent: false, needsUpdate: false },
  };
  const ring = { isMesh: true };
  const possessionRing = { isMesh: true };
  const root = {
    traverse(cb: (o: any) => void) {
      cb(mesh);
      cb(ring);
      cb(possessionRing);
    },
  };
  return { id, label, root, ring, possessionRing };
}

test('updateFilterVisuals: empty query — all figures opacity 1', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  updateFilterVisuals(figs, '');
  // No-op — neither figure should be dimmed
  const m1 = figs[0].root.traverse.toString(); // verify traversal happened via side-effect
  // opacity untouched (initial 1.0) when no query
  const mesh0 = { isMesh: true, userData: {}, material: { opacity: 1.0, transparent: false, needsUpdate: false } };
  figs[0].root.traverse((o: any) => { if (o.isMesh && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) { /* no op */ } });
  // Both figures should keep opacity 1.0
  let seenOpacity: number | null = null;
  figs[0].root.traverse((o: any) => {
    if (o.isMesh && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) {
      seenOpacity = o.material.opacity;
    }
  });
  // After empty-query call, opacity restored
  updateFilterVisuals(figs, '');
  let opacity0 = 1.0;
  figs[0].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) {
      opacity0 = o.material.opacity;
    }
  });
  assert.strictEqual(opacity0, 1.0, 'no query: opacity stays 1');
});

test('updateFilterVisuals: matching figure keeps opacity 1, non-matching dims to 0.15', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  updateFilterVisuals(figs, 'anna');

  // Anna (f1) matches — opacity should be 1
  let annaOpacity = -1;
  figs[0].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) {
      annaOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(annaOpacity, 1.0, 'matching figure: opacity 1');

  // Bernd (f2) does not match — opacity should be 0.15
  let berndOpacity = -1;
  figs[1].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[1].ring && o !== figs[1].possessionRing) {
      berndOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(berndOpacity, 0.15, 'non-matching figure: opacity 0.15');
});

test('updateFilterVisuals: clearing query restores opacity to 1', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  // First dim
  updateFilterVisuals(figs, 'anna');
  // Then clear
  updateFilterVisuals(figs, '');

  let berndOpacity = -1;
  figs[1].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[1].ring && o !== figs[1].possessionRing) {
      berndOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(berndOpacity, 1.0, 'after clear: opacity restored to 1');
});

test('updateFilterVisuals: ring and possessionRing are NOT dimmed', () => {
  const fig = makeFakeFig('f1', 'Anna');
  // Give ring its own material so we can check it
  (fig.ring as any).material = { opacity: 1.0, transparent: false, needsUpdate: false };
  (fig.possessionRing as any).material = { opacity: 1.0, transparent: false, needsUpdate: false };
  updateFilterVisuals([fig], 'nomatch');
  assert.strictEqual((fig.ring as any).material.opacity, 1.0, 'ring not dimmed');
  assert.strictEqual((fig.possessionRing as any).material.opacity, 1.0, 'possessionRing not dimmed');
});

test('updateFilterVisuals: null/undefined label treated as non-matching when query present', () => {
  const fig = makeFakeFig('f1', null as any);
  updateFilterVisuals([fig], 'anna');
  let meshOpacity = -1;
  fig.root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
      meshOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(meshOpacity, 0.15, 'null label + active query → dimmed');
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd brett && npm test 2>&1 | grep -E "updateFilterVisuals|Error|Cannot find" | head -10
```
Expected: `Cannot find export 'updateFilterVisuals' from '../src/client/mannequin'`.

- [ ] **Step 3: Implement `updateFilterVisuals` in `mannequin.ts`**

Open `brett/src/client/mannequin.ts`. After the `clearModerationVisuals` function at the bottom of the file (after line 595), append:

```typescript
// ── Filter Visuals (T000607) ───────────────────────────────────────────────

const FILTER_DIM_OPACITY = 0.15;

/**
 * Per-frame filter visual updater. Dims non-matching figures to FILTER_DIM_OPACITY
 * and restores matching (or all, when query is empty) figures to opacity 1.
 *
 * Called from the board-boot tick loop AFTER updateModerationVisuals so that
 * moderation takes precedence: if moderation already dimmed a figure, this does
 * not raise its opacity.
 *
 * The function intentionally does NOT use the _moderationCache because filter
 * state is local and does not need DB-roundtrip stability.
 */
export function updateFilterVisuals(figures: any[], query: string): void {
  const hasFilter = query.length > 0;

  for (const fig of figures) {
    const matches = !hasFilter || (fig.label ?? '').toLowerCase().includes(query.toLowerCase());

    fig.root.traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      if (o.userData.isContact) return;
      if (o === fig.ring || o === fig.possessionRing) return;

      if (!hasFilter) {
        // Restore — only if we previously dimmed via filter (avoid fighting moderation)
        if (o.material._filterDimmed) {
          o.material.opacity = o.material._filterOriginalOpacity ?? 1.0;
          o.material.transparent = o.material._filterOriginalTransparent ?? false;
          o.material._filterDimmed = false;
          o.material.needsUpdate = true;
        }
      } else if (!matches) {
        // Dim non-matching figure
        if (!o.material._filterDimmed) {
          o.material._filterOriginalOpacity = o.material.opacity;
          o.material._filterOriginalTransparent = o.material.transparent;
          o.material._filterDimmed = true;
        }
        o.material.opacity = FILTER_DIM_OPACITY;
        o.material.transparent = true;
        o.material.needsUpdate = true;
      } else {
        // Matching figure — restore if previously dimmed by filter
        if (o.material._filterDimmed) {
          o.material.opacity = o.material._filterOriginalOpacity ?? 1.0;
          o.material.transparent = o.material._filterOriginalTransparent ?? false;
          o.material._filterDimmed = false;
          o.material.needsUpdate = true;
        }
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd brett && npm test 2>&1 | grep -E "topbar-filter|pass|fail" | head -30
```
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd brett && npm run build 2>&1 | grep -E "error TS|warning" | head -20
```
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/mannequin.ts brett/test/topbar-filter.test.ts
git commit -m "feat(brett): updateFilterVisuals in mannequin — dim non-matching figures [T000607]"
```

---

## Task 4: Wire filter into `board-boot.ts`

**Files:**
- Modify: `brett/src/client/board-boot.ts`

Mount the filter input using `mountFilterInput` and call `updateFilterVisuals` in the tick loop. The `onChange` callback only needs to update the displayed active-filter indicator (no-op here — the tick loop polls `getFilterQuery()` each frame anyway, so `onChange` can be a no-op or log).

- [ ] **Step 1: Add import at top of `board-boot.ts`**

Find the existing import block near the top. After `import { showLateJoinToast } from './ui/late-join-toast';`, add:

```typescript
import { mountFilterInput, getFilterQuery } from './ui/topbar-filter';
import { updateFilterVisuals } from './mannequin';
```

Wait — `updateFilterVisuals` is already imported via the wildcard `import * as mannequin`. Add only the `topbar-filter` import line:

```typescript
import { mountFilterInput, getFilterQuery } from './ui/topbar-filter';
```

The mannequin call will be `mannequin.updateFilterVisuals(...)`.

- [ ] **Step 2: Mount filter input in `bootBoard()`**

Find the block:
```typescript
  const inviteSlot = document.getElementById('topbar-invite-slot');
  const participantsSlot = document.getElementById('topbar-participants-slot');
```

Add `filterSlot` resolution and mounting immediately after:

```typescript
  const inviteSlot = document.getElementById('topbar-invite-slot');
  const participantsSlot = document.getElementById('topbar-participants-slot');
  const filterSlot = document.getElementById('topbar-filter-slot');

  if (filterSlot) {
    mountFilterInput(filterSlot, {
      onChange: (_q) => { /* tick loop reads getFilterQuery() directly */ },
    });
  }
```

- [ ] **Step 3: Call `updateFilterVisuals` in the tick loop**

Find the tick loop in `board-boot.ts` — locate the `function tick()` block. Find the line:
```typescript
    mannequin.updateModerationVisuals(STATE.figures, currentModerationState);
```

Directly after it, add:
```typescript
    mannequin.updateFilterVisuals(STATE.figures, getFilterQuery());
```

The full sequence becomes:
```typescript
    mannequin.tickSpring(dt);
    if (!isReplayMode) updateLinePositions();
    mannequin.updatePossessionVisuals(STATE.figures, currentUser.userId);
    // T000471: Moderation visuals (Spotlight/Dim/Freeze)
    mannequin.updateModerationVisuals(STATE.figures, currentModerationState);
    // T000607: Filter visuals (dim non-matching figures)
    mannequin.updateFilterVisuals(STATE.figures, getFilterQuery());
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd brett && npm run build 2>&1 | grep -E "error TS" | head -10
```
Expected: zero TypeScript errors.

- [ ] **Step 5: Run full test suite**

```bash
cd brett && npm test 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): wire filter input + updateFilterVisuals into tick loop [T000607]"
```

---

## Task 5: Manual smoke test + final check

- [ ] **Step 1: Start dev server**

```bash
cd brett && npm run dev 2>&1 &
# Wait ~3s for Vite to be ready
```
Open `http://localhost:5173` in a browser (or `http://localhost:3000` — check which port the dev script uses).

- [ ] **Step 2: Add 3 figures with different labels**

Double-click the 3D board floor to add figures. In the "＋ Figur ▾" panel, name them "Anna", "Bernd", "Karl".

- [ ] **Step 3: Type "ann" in the filter input**

Expected: "Anna" figure stays fully opaque; "Bernd" and "Karl" figures dim to ~15% opacity.

- [ ] **Step 4: Press Escape**

Expected: all figures return to full opacity; input is cleared.

- [ ] **Step 5: Type "k", then click ×**

Expected: while "k" is typed, "Karl" stays bright, others dim. After clicking ×, all restore.

- [ ] **Step 6: Verify no console errors**

Browser DevTools console should show no errors related to filter/mannequin.

- [ ] **Step 7: Kill dev server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 8: Run full test suite one final time**

```bash
cd brett && npm test 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 9: Final commit if any cleanup needed**

If any code was cleaned up during smoke testing:
```bash
git add -p
git commit -m "fix(brett): figuren-filter smoke test cleanups [T000607]"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** UI placement (topbar-filter-slot in HTML → Task 1), pure helpers (Task 2), visual dim logic (Task 3), wiring (Task 4), smoke test (Task 5) — all covered.
- [x] **No placeholders:** All tasks have concrete code.
- [x] **Type consistency:** `updateFilterVisuals(figures: any[], query: string)` used consistently in Task 3 and Task 4. `getFilterQuery()` returns `string` consistently in Task 2 and Task 4. `matchesFigureFilter` signature stable.
- [x] **_filterDimmed flag interaction:** Filter tracks its own dim state via `_filterDimmed` flag on materials (separate from `_moderationCache`). No cross-contamination with moderation.
- [x] **Escape key gap:** The `onKeydown` handler in `mountFilterInput` calls `applyQuery('')` which calls `setFilterQuery('')` + `opts.onChange('')` — tick loop will then call `updateFilterVisuals(figures, '')` on next frame, restoring all opacities. Correct.
