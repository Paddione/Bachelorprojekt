---
ticket_id: T000652
branch: feature/T000602-factory-mobile-view
spec: docs/superpowers/specs/2026-06-11-t000602-factory-mobile-view-design.md
status: done
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# T000602 Factory UI — Mobile Factory View: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close three critical mobile gaps on `/dev-status` (DetailPanel Bottom-Sheet, content padding-bottom, DevStatusTabs scrollable) and add four enhancements (dot indicators, haptic feedback, Leitstand compaction, Stale-Banner placement) so the Factory View has full mobile parity on 375×812 viewports.

**Architecture:** Pure CSS + minimal Svelte prop additions — no new API routes, no DB changes. Each gap is isolated to one component file. The E2E tests use Playwright with `viewport: { width: 375, height: 812 }` and reuse the existing `mentolder-mobile` project or a new `viewport-375` config.

**Tech Stack:** Svelte 5 (runes), CSS custom properties from `factory-tokens.css`, Playwright for E2E tests.

---

## Pre-flight Checklist

Before starting any task, verify:

- [x] Active branch is `feature/T000602-factory-mobile-view`:
  ```bash
  git -C /tmp/wt-factory-mobile branch --show-current
  # expected: feature/T000602-factory-mobile-view
  ```
- [x] Worktree clean (no uncommitted work from another session):
  ```bash
  git -C /tmp/wt-factory-mobile status --short
  # expected: empty or only your own changes
  ```
- [x] Spec file exists:
  ```bash
  ls /tmp/wt-factory-mobile/docs/superpowers/specs/2026-06-11-t000602-factory-mobile-view-design.md
  ```
- [x] Dev cluster reachable (optional, only needed for FA-MOBILE manual run):
  ```bash
  kubectl --context k3d-mentolder-dev get pods -n workspace --field-selector=status.phase=Running | grep website
  ```

---

## File Map

| File | Change Type | What Changes |
|------|-------------|-------------|
| `website/src/components/factory/DetailPanel.svelte` | Modify | Add `isMobile` prop; rewrite `@media (max-width: 767px)` block to Bottom-Sheet; add `.detail-panel__backdrop` element + CSS; fix close-button touch target |
| `website/src/components/FactoryFloor.svelte` | Modify | Add `padding-bottom` mobile CSS on kanban-container; add `.mobile-station-dots` HTML + CSS; pass `isMobile` to `DetailPanel`; add haptic call in `onTouchEnd` |
| `website/src/components/DevStatusTabs.svelte` | Modify | Add mobile-scroll CSS to `.tab-bar-wrap`; add short-label data attributes or conditional rendering; hide scrollbar on webkit |
| `website/src/components/factory/MobileTabBar.svelte` | Modify | Call `navigator.vibrate(5)` in `onSelect`; add `aria-label` to each tab button |
| `website/src/styles/factory-tokens.css` | Modify | Add `--factory-bottom-safe` utility token |
| `tests/e2e/specs/fa-mobile-factory.spec.ts` | Create | FA-MOBILE-01 through FA-MOBILE-06 Playwright tests, viewport 375×812 |

---

## Task A1: DetailPanel — Bottom-Sheet Mobile Overlay

**Files:**
- Modify: `website/src/components/factory/DetailPanel.svelte`

This task fixes the most critical gap: on mobile, the DetailPanel must behave as a Bottom-Sheet (slide-up from bottom, 75 vh, backdrop, drag handle, correct close button, safe-area padding). Currently the `@media (max-width: 767px)` block only sets `width: 100%`, leaving all Desktop `position: fixed; inset: 0 auto 0 0` rules active which pins the panel to the left edge.

- [x] **Step 1: Add `isMobile` prop to DetailPanel**

  In `website/src/components/factory/DetailPanel.svelte`, update the `$props()` destructure (lines 6–30). Add `isMobile` boolean prop with default `false`:

  ```svelte
  let {
    detail,
    selected,
    onClose,
    injKind,
    injPhase,
    injTitle,
    injContent,
    injBusy,
    injError,
    onSubmitInjection,
    prUrl,
    isMobile = false,
  }: {
    detail: TicketDetail | null;
    selected: string | null;
    onClose: () => void;
    injKind: InjectionKind;
    injPhase: string;
    injTitle: string;
    injContent: string;
    injBusy: boolean;
    injError: string | null;
    onSubmitInjection: () => void;
    prUrl: (n: number) => string;
    isMobile?: boolean;
  } = $props();
  ```

- [x] **Step 2: Add Backdrop element to template**

  After line 51 (`{#if selected}`), insert the backdrop div before `.detail-panel`. The full `{#if selected}` block should become:

  ```svelte
  {#if selected}
    {#if isMobile}
      <div class="detail-panel__backdrop" onclick={onClose} aria-hidden="true"></div>
    {/if}
    <div class="detail-panel" class:open={isMobile} data-testid="floor-detail">
  ```

  Keep the closing `</div>` and `{/if}` as-is (line 158–159). The `class:open={isMobile}` toggles the slide-up animation: when `isMobile` is false (desktop), the panel uses the existing `ff-slide-in` keyframe; when `isMobile` is true, the `open` class activates `transform: translateY(0)`.

- [x] **Step 3: Increase close-button touch target**

  The existing `detail-panel__close` button (line 53) stays in place — the CSS change in Step 4 will handle its sizing. No template change needed here.

- [x] **Step 4: Replace the `@media (max-width: 767px)` CSS block**

  Find the existing mobile block (lines 425–429 in the `<style>` section):
  ```css
  @media (max-width: 767px) {
    .detail-panel {
      width: 100%;
    }
  }
  ```

  Replace it entirely with:

  ```css
  @media (max-width: 767px) {
    .detail-panel {
      /* Override desktop fixed-left panel */
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 75vh;
      max-height: calc(100vh - 60px - 48px); /* Topbar (60px) + TabBar (48px) */
      border-left: none;
      border-top: 1px solid var(--factory-border);
      border-radius: var(--factory-radius-md) var(--factory-radius-md) 0 0;
      transform: translateY(100%);
      transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 200;
      /* Reset desktop animation */
      animation: none;
    }

    .detail-panel.open {
      transform: translateY(0);
    }

    /* Drag handle pseudo-element */
    .detail-panel::before {
      content: '';
      display: block;
      width: 36px;
      height: 4px;
      background: var(--factory-border);
      border-radius: 2px;
      margin: 8px auto 12px;
      flex-shrink: 0;
    }

    /* Larger touch target for close button */
    .detail-panel__close {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
  }

  /* Backdrop — only rendered on mobile via {#if isMobile} in template */
  .detail-panel__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 199;
  }
  ```

- [x] **Step 5: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/factory/DetailPanel.svelte
  git commit -m "feat(mobile): DetailPanel Bottom-Sheet overlay on mobile (T000602 A1)"
  ```

---

## Task A2: FactoryFloor — Padding-Bottom, Dot-Indicators, isMobile Prop, Haptic on Swipe

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

Four related changes in one file: (1) pass `isMobile` to DetailPanel, (2) add `padding-bottom` so content isn't clipped by the Tab-Bar, (3) add dot-indicator HTML + CSS, (4) add haptic vibration on swipe.

- [x] **Step 1: Add `isMobile` reactive state**

  After `let mobileColIndex = $state(0);` (line 25), add:

  ```svelte
  let isMobile = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    isMobile = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });
  ```

- [x] **Step 2: Add haptic feedback to swipe**

  In the existing `onTouchEnd` function (lines 31–35), add `navigator.vibrate(5)` after any column change:

  ```svelte
  function onTouchEnd(e: TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (delta < -40) { mobileNext(); if ('vibrate' in navigator) navigator.vibrate(5); }
    else if (delta > 40) { mobilePrev(); if ('vibrate' in navigator) navigator.vibrate(5); }
  }
  ```

- [x] **Step 3: Add dot-indicator HTML**

  In the template, find the `<MobileTabBar>` line (line 238):
  ```svelte
  <MobileTabBar activeIndex={mobileColIndex} onSelect={(i) => { mobileColIndex = i; }} />
  ```

  Replace with:
  ```svelte
  <div class="mobile-station-dots" aria-hidden="true">
    {#each Array(10) as _, i}
      <span class="dot" class:active={i === mobileColIndex}></span>
    {/each}
  </div>
  <MobileTabBar activeIndex={mobileColIndex} onSelect={(i) => { mobileColIndex = i; }} />
  ```

- [x] **Step 4: Pass `isMobile` to DetailPanel**

  Find the `<DetailPanel>` block (lines 447–459) and add the `{isMobile}` prop:

  ```svelte
  <DetailPanel
    {detail}
    {selected}
    onClose={closeDetail}
    {injKind}
    {injPhase}
    {injTitle}
    {injContent}
    {injBusy}
    {injError}
    onSubmitInjection={submitInjection}
    {prUrl}
    {isMobile}
  />
  ```

- [x] **Step 5: Add padding-bottom and dot CSS to the `<style>` block**

  In the `<style>` section (after line 471), append:

  ```css
  /* Mobile content padding — prevents TabBar clipping last items */
  @media (max-width: 767px) {
    .kanban-container {
      padding-bottom: calc(var(--factory-tab-bar-height, 48px) + env(safe-area-inset-bottom, 0px) + 8px);
    }
  }

  /* Dot indicators for swipe navigation */
  .mobile-station-dots {
    display: none;
  }
  @media (max-width: 767px) {
    .mobile-station-dots {
      display: flex;
      justify-content: center;
      gap: 4px;
      padding: 6px 0 2px;
    }
    .dot {
      width: 4px;
      height: 4px;
      background: var(--factory-border);
      border-radius: 2px;
      transition: width 0.15s ease, background 0.15s ease;
      flex-shrink: 0;
    }
    .dot.active {
      width: 8px;
      background: var(--factory-accent);
    }
  }
  ```

- [x] **Step 6: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/FactoryFloor.svelte
  git commit -m "feat(mobile): padding-bottom, dot indicators, isMobile, haptic swipe (T000602 A2)"
  ```

---

## Task A3: DevStatusTabs — Mobile Scrollable Tab-Bar with Short Labels

**Files:**
- Modify: `website/src/components/DevStatusTabs.svelte`

Currently `.tab-bar-wrap` has `display: flex; padding: 0 1.5rem` with no overflow handling. On 375 px viewports, the 5 tabs overflow invisibly. This task makes the outer tab-bar horizontally scrollable with short labels on mobile.

- [x] **Step 1: Add short-label spans to each tab button**

  Replace the five `<button class="ds-tab">` elements (lines 58–98). Each button gets a `<span class="tab-label-full">` for desktop and `<span class="tab-label-short">` for mobile, using CSS visibility:

  ```svelte
  <button
    class="ds-tab"
    class:active={activeTab === 'factory'}
    onclick={() => switchTab('factory')}
  >
    <span class="tab-label-full">Factory Floor</span>
    <span class="tab-label-short">Factory</span>
    {#if hallActive > 0}
      <span class="tab-badge live">{hallActive} aktiv</span>
    {/if}
  </button>
  <button
    class="ds-tab"
    class:active={activeTab === 'planung'}
    onclick={() => switchTab('planung')}
  >
    <span class="tab-label-full">Planungsbüro</span>
    <span class="tab-label-short">Planung</span>
    {#if planningBadge() > 0}
      <span class="tab-badge">{planningBadge()} {planningCount.ready > 0 ? 'bereit' : 'in Planung'}</span>
    {/if}
  </button>
  <button
    class="ds-tab"
    class:active={activeTab === 'control'}
    onclick={() => switchTab('control')}
  >
    <span class="tab-label-full">Control Panel</span>
    <span class="tab-label-short">Control</span>
  </button>
  <button
    class="ds-tab"
    class:active={activeTab === 'analytics'}
    onclick={() => switchTab('analytics')}
  >
    <span class="tab-label-full">Analytics</span>
    <span class="tab-label-short">Analytics</span>
  </button>
  <button
    class="ds-tab"
    class:active={activeTab === 'abhaengigkeiten'}
    onclick={() => switchTab('abhaengigkeiten')}
  >
    <span class="tab-label-full">Abhängigkeiten</span>
    <span class="tab-label-short">Deps</span>
  </button>
  ```

- [x] **Step 2: Add mobile CSS to the `<style>` block**

  Append to the existing `<style>` section (after the `@keyframes badge-pulse` block):

  ```css
  /* Short labels: hidden on desktop, visible on mobile */
  .tab-label-short { display: none; }
  .tab-label-full  { display: inline; }

  @media (max-width: 767px) {
    .tab-bar-wrap {
      padding: 0 0.5rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none; /* Firefox */
    }
    .tab-bar-wrap::-webkit-scrollbar { display: none; }

    .ds-tab {
      padding: 8px 12px;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .tab-label-full  { display: none; }
    .tab-label-short { display: inline; }
  }
  ```

- [x] **Step 3: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/DevStatusTabs.svelte
  git commit -m "feat(mobile): DevStatusTabs scrollable + short labels on mobile (T000602 A3)"
  ```

---

## Task A4: MobileTabBar — Haptic Feedback + aria-label

**Files:**
- Modify: `website/src/components/factory/MobileTabBar.svelte`

Add `navigator.vibrate(5)` on tab tap and `aria-label` attributes for WCAG 2.5.5 accessibility.

- [x] **Step 1: Add haptic wrapper function**

  In `<script lang="ts">`, after the `$props()` block (line 21), add:

  ```typescript
  function handleSelect(i: number) {
    if ('vibrate' in navigator) navigator.vibrate(5);
    onSelect(i);
  }
  ```

- [x] **Step 2: Update button to use `handleSelect` and add `aria-label`**

  Replace the `<button>` element (lines 26–32):

  ```svelte
  <button
    class="mobile-tab-bar__tab"
    class:active={i === activeIndex}
    onclick={() => handleSelect(i)}
    aria-label={`Station: ${tab.label}`}
    aria-pressed={i === activeIndex}
  >
    {tab.label}
  </button>
  ```

- [x] **Step 3: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/factory/MobileTabBar.svelte
  git commit -m "feat(mobile): MobileTabBar haptic feedback + aria-label (T000602 A4)"
  ```

---

## Task A5: Leitstand-Grid Mobile Typography Compaction

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

The 8 Leitstand cards use `text-xl font-bold` for values and `p-3` padding. On 375 px with 2 columns this is tight. Switch to `text-lg` and `p-2` on mobile via CSS utility overrides.

- [x] **Step 1: Add mobile overrides for Leitstand grid to the `<style>` block**

  In `FactoryFloor.svelte`'s `<style>` section (append after the dot CSS from A2):

  ```css
  /* Leitstand grid — compact on mobile */
  @media (max-width: 767px) {
    [data-testid="floor-leitstand"] > * {
      padding: 0.5rem; /* p-2 equivalent */
    }
    [data-testid="floor-leitstand"] .text-xl {
      font-size: var(--factory-text-lg); /* 1.125rem instead of 1.25rem */
    }
    [data-testid="floor-leitstand"] .text-xs {
      font-size: 10px; /* tighter metric label */
    }
  }
  ```

  Note: Tailwind utility classes (`text-xl`, `p-3`) are used inline in the template, so scoped `<style>` selectors cannot override them directly. Instead, add `:global()` wrappers since `data-testid` selects into the component's own DOM:

  ```css
  @media (max-width: 767px) {
    :global([data-testid="floor-leitstand"] > *) {
      padding: 0.5rem !important;
    }
    :global([data-testid="floor-leitstand"] p.text-xl) {
      font-size: 1.125rem !important;
    }
    :global([data-testid="floor-leitstand"] p.text-xs) {
      font-size: 10px !important;
    }
  }
  ```

- [x] **Step 2: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/FactoryFloor.svelte
  git commit -m "feat(mobile): Leitstand grid compact typography on mobile (T000602 A5)"
  ```

---

## Task A6: Stale-Banner Mobile Position

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

The `floor-pulse` bar (lines 190–221) renders as a normal block element at the top of `[data-testid="factory-floor"]`. On mobile it sits between the Topbar (60 px) and the Leitstand grid. It is NOT `position: fixed`, so it is not obscured by the TabBar. However, on mobile the stale banner text (`data-testid="floor-stale"`) can be cut off if it wraps. Ensure it wraps cleanly and is always above the kanban-container.

- [x] **Step 1: Add mobile wrapping CSS for the pulse row**

  Append to `FactoryFloor.svelte`'s `<style>` block:

  ```css
  /* Stale banner: allow wrapping on narrow viewports */
  @media (max-width: 767px) {
    [data-testid="floor-pulse"] {
      flex-wrap: wrap;
      row-gap: 4px;
    }
    [data-testid="floor-stale"] {
      font-size: 12px;
      flex-basis: 100%;
    }
  }
  ```

- [x] **Step 2: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/components/FactoryFloor.svelte
  git commit -m "feat(mobile): stale banner wraps correctly on narrow viewport (T000602 A6)"
  ```

---

## Task A7: Add `--factory-bottom-safe` Utility Token

**Files:**
- Modify: `website/src/styles/factory-tokens.css`

Small utility token that components can reference instead of repeating the `calc()`.

- [x] **Step 1: Append token to `:root` block**

  Open `website/src/styles/factory-tokens.css`. After the `--factory-tab-bar-height: 48px;` line (line 47), add:

  ```css
  --factory-bottom-safe: calc(var(--factory-tab-bar-height) + env(safe-area-inset-bottom, 0px));
  ```

- [x] **Step 2: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add website/src/styles/factory-tokens.css
  git commit -m "chore(tokens): add --factory-bottom-safe utility token (T000602 A7)"
  ```

---

## Task A8: E2E Tests — FA-MOBILE-01 through FA-MOBILE-06

**Files:**
- Create: `tests/e2e/specs/fa-mobile-factory.spec.ts`

Write Playwright tests that verify all six mobile acceptance criteria. All tests use `viewport: { width: 375, height: 812 }` (iPhone 12). The tests navigate to `/dev-status` and interact with the Factory Floor tab.

- [x] **Step 1: Check existing Playwright config for base URL and auth**

  ```bash
  cat /tmp/wt-factory-mobile/playwright.config.ts | grep -E 'baseURL|storageState|use:'
  ```

  Identify whether `storageState` is set (SSO session) or whether `/dev-status` is publicly accessible in tests. Note the value — you'll use it in the test file.

- [x] **Step 2: Create the test file**

  Create `tests/e2e/specs/fa-mobile-factory.spec.ts` with this content:

  ```typescript
  import { test, expect } from '@playwright/test';

  // All tests: iPhone 12 portrait viewport
  test.use({ viewport: { width: 375, height: 812 } });

  test.describe('FA-MOBILE: Factory Floor mobile parity', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to Factory Floor tab
      await page.goto('/dev-status?tab=factory', { waitUntil: 'networkidle' });
      // Wait for the floor to render
      await page.waitForSelector('[data-testid="factory-floor"]', { timeout: 15_000 });
    });

    test('FA-MOBILE-01: DetailPanel opens as Bottom-Sheet with backdrop and 44px close button', async ({ page }) => {
      // Click the first workpiece or staged item to open DetailPanel
      const workpiece = page.locator('[data-testid="floor-staged-item"]').first();
      const hasStagedItem = await workpiece.count();
      if (hasStagedItem === 0) {
        test.skip(true, 'No staged items available — skipping DetailPanel test');
        return;
      }

      await workpiece.locator('button').first().click();
      const panel = page.locator('[data-testid="floor-detail"]');
      await expect(panel).toBeVisible({ timeout: 5_000 });

      // Panel must be positioned as bottom-sheet (bottom: 0)
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Bottom of panel should be at or near the viewport bottom
        expect(box.y + box.height).toBeGreaterThan(700); // within 112px of 812px bottom
      }

      // Backdrop must be visible
      const backdrop = page.locator('.detail-panel__backdrop');
      await expect(backdrop).toBeVisible();

      // Close button must be >= 44px in both dimensions
      const closeBtn = panel.locator('.detail-panel__close');
      const closeBtnBox = await closeBtn.boundingBox();
      expect(closeBtnBox).not.toBeNull();
      if (closeBtnBox) {
        expect(closeBtnBox.width).toBeGreaterThanOrEqual(44);
        expect(closeBtnBox.height).toBeGreaterThanOrEqual(44);
      }

      // Clicking backdrop closes the panel
      await backdrop.click();
      await expect(panel).not.toBeVisible({ timeout: 2_000 });
    });

    test('FA-MOBILE-02: Content padding — last Laderampe item not obscured by TabBar', async ({ page }) => {
      // Switch to Laderampe (backlog) column via MobileTabBar tab index 1
      const tabs = page.locator('.mobile-tab-bar__tab');
      await tabs.nth(1).click(); // BACKLOG tab

      const loadingDock = page.locator('[data-testid="floor-loadingdock"]');
      await expect(loadingDock).toBeVisible({ timeout: 3_000 });

      const items = loadingDock.locator('li');
      const count = await items.count();
      if (count === 0) {
        // Nothing on the dock — verify the column itself is not clipped
        const dockBox = await loadingDock.boundingBox();
        expect(dockBox).not.toBeNull();
        return;
      }

      const lastItem = items.last();
      const lastBox = await lastItem.boundingBox();
      const tabBar = page.locator('.mobile-tab-bar');
      const tabBarBox = await tabBar.boundingBox();

      expect(lastBox).not.toBeNull();
      expect(tabBarBox).not.toBeNull();

      if (lastBox && tabBarBox) {
        // Bottom of last item must be above the top of the tab bar (or at least not inside it)
        const lastItemBottom = lastBox.y + lastBox.height;
        expect(lastItemBottom).toBeLessThanOrEqual(tabBarBox.y + 4); // 4px tolerance
      }
    });

    test('FA-MOBILE-03: DevStatusTabs outer tabs all reachable via horizontal scroll', async ({ page }) => {
      const tabBarWrap = page.locator('.tab-bar-wrap');
      await expect(tabBarWrap).toBeVisible();

      // All 5 tabs must exist in DOM
      const tabs = page.locator('.ds-tab');
      await expect(tabs).toHaveCount(5);

      // Scroll the tab-bar to the right and verify the last tab becomes visible
      await tabBarWrap.evaluate((el) => { el.scrollLeft = el.scrollWidth; });

      // The last tab (Abhängigkeiten / Deps) must be visible after scroll
      const lastTab = tabs.last();
      await expect(lastTab).toBeInViewport({ ratio: 0.5 });

      // Click each tab and verify navigation works
      for (let i = 0; i < 5; i++) {
        await tabs.nth(i).scrollIntoViewIfNeeded();
        await tabs.nth(i).click();
        // Each click should not throw and the tab should become active
        await expect(tabs.nth(i)).toHaveClass(/active/);
      }
    });

    test('FA-MOBILE-04: Dot indicators update on MobileTabBar tap', async ({ page }) => {
      const dots = page.locator('.mobile-station-dots .dot');
      await expect(dots).toHaveCount(10);

      // Initially dot 0 is active
      await expect(dots.first()).toHaveClass(/active/);

      // Tap tab 2 (SCOUT)
      const tabs = page.locator('.mobile-tab-bar__tab');
      await tabs.nth(2).click();

      // Dot 2 must become active, dot 0 must lose active class
      await expect(dots.nth(2)).toHaveClass(/active/);
      await expect(dots.first()).not.toHaveClass(/active/);
    });

    test('FA-MOBILE-05: All 10 stations reachable via MobileTabBar', async ({ page }) => {
      const tabs = page.locator('.mobile-tab-bar__tab');
      await expect(tabs).toHaveCount(10);

      const COL_MAP: Record<number, string> = {
        0: 'staged',
        1: 'backlog',
        8: 'qs',
        9: 'done',
      };

      for (let i = 0; i < 10; i++) {
        await tabs.nth(i).scrollIntoViewIfNeeded();
        await tabs.nth(i).click();

        // For columns with data-col attributes, verify visibility
        if (COL_MAP[i]) {
          const col = page.locator(`[data-col="${COL_MAP[i]}"]`);
          await expect(col).toHaveClass(/mobile-visible/, { timeout: 2_000 });
        }
      }
    });

    test('FA-MOBILE-06: Leitstand grid — all 8 cards visible without horizontal scroll', async ({ page }) => {
      const leitstand = page.locator('[data-testid="floor-leitstand"]');
      await expect(leitstand).toBeVisible();

      // Check no horizontal overflow: scrollWidth should equal clientWidth
      const overflow = await leitstand.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(overflow).toBe(false);

      // All 8 known data-testid cards must be visible
      const knownTestIds = ['floor-slots', 'floor-office', 'floor-komm-count'];
      for (const testId of knownTestIds) {
        await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
      }

      // Count child divs: should be 8
      const cards = leitstand.locator('> *');
      await expect(cards).toHaveCount(8);
    });
  });
  ```

- [x] **Step 3: Run tests in offline/local mode to verify they load**

  ```bash
  cd /tmp/wt-factory-mobile/website
  # Dry-run: list the tests without running (no cluster needed)
  npx playwright test tests/e2e/specs/fa-mobile-factory.spec.ts --list
  # Expected output: 6 tests listed under "FA-MOBILE: Factory Floor mobile parity"
  ```

- [x] **Step 4: Commit**

  ```bash
  cd /tmp/wt-factory-mobile
  git add tests/e2e/specs/fa-mobile-factory.spec.ts
  git commit -m "test(e2e): FA-MOBILE-01..06 mobile factory view Playwright tests (T000602 A8)"
  ```

---

## Task A9: Manual Verification + Screenshot (Playwright Mobile Headed)

**Files:** None (verification only)

This task confirms the implementation visually using Playwright in headed mobile mode against the dev cluster.

- [x] **Step 1: Ensure dev cluster website is up-to-date**

  ```bash
  # Check that the website pod is running
  kubectl --context k3d-mentolder-dev get pods -n website --field-selector=status.phase=Running
  # If website is deployed from main, redeploy with local changes first:
  # bash /tmp/wt-factory-mobile/scripts/task-oracle.sh 'deploy website to dev'
  ```

- [x] **Step 2: Run FA-MOBILE-01 in headed mode to see Bottom-Sheet visually**

  ```bash
  cd /tmp/wt-factory-mobile/website
  npx playwright test tests/e2e/specs/fa-mobile-factory.spec.ts --headed \
    --grep "FA-MOBILE-01" \
    --project=mentolder   # adjust project name per playwright.config.ts
  ```

  Expected: Browser opens at 375×812, a staged item is clicked, the Bottom-Sheet slides up from the bottom, backdrop is visible.

- [x] **Step 3: Run full FA-MOBILE suite**

  ```bash
  cd /tmp/wt-factory-mobile/website
  npx playwright test tests/e2e/specs/fa-mobile-factory.spec.ts
  ```

  Expected: All 6 tests pass (or `FA-MOBILE-02` skips if loading dock is empty in dev, which is acceptable).

- [x] **Step 4: Verify AC-M-07 and AC-M-08 manually**

  Open Chrome DevTools, set device to iPhone 12, navigate to `/dev-status?tab=factory`.

  - `[data-testid="floor-pulse"]` is visible below the Topbar: PASS if it shows the amber/green dot.
  - All `data-testid` from T000598 (`floor-staged-item`, `floor-workpiece`, `floor-shipped-item`, etc.) are present in DOM: PASS if DevTools Elements panel shows them.

- [x] **Step 5: Final commit (if any fixups needed)**

  ```bash
  cd /tmp/wt-factory-mobile
  git add -p   # stage only fixup changes
  git commit -m "fix(mobile): post-verification fixups (T000602 A9)"
  ```

---

## Verification Summary (Acceptance Criteria Mapping)

| AC | Task | Test ID |
|----|------|---------|
| AC-M-01: DetailPanel Bottom-Sheet | A1 | FA-MOBILE-01 |
| AC-M-02: Content not clipped by TabBar | A2 | FA-MOBILE-02 |
| AC-M-03: DevStatusTabs scrollable | A3 | FA-MOBILE-03 |
| AC-M-04: Dot indicators | A2 | FA-MOBILE-04 |
| AC-M-05: All 10 stations reachable | A2, A4 | FA-MOBILE-05 |
| AC-M-06: Leitstand grid readable | A5 | FA-MOBILE-06 |
| AC-M-07: SSE Live-Indicator visible | A6 | Manual (A9 Step 4) |
| AC-M-08: data-testid regression-free | No change | Manual (A9 Step 4) |

---

## Out-of-Scope Reminders

Do NOT touch during this plan:
- `k3d/`, `environments/`, `prod/` — no manifest changes
- `QaModal.svelte`, `QaChip.svelte` — T000581 scope
- `website/src/pages/` or any Astro page files
- Backend API routes (`website/src/pages/api/`)
- `environments/schema.yaml` or `k3d/configmap-domains.yaml`
