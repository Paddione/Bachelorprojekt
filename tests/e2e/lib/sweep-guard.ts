// tests/e2e/lib/sweep-guard.ts
//
// Safety + screenshot-stability primitives for the E2E visual sweep.
//
// installReadOnlyGuard  — abort any non-GET/HEAD request so an anonymous prod
//                          sweep can never mutate data (defense in depth even
//                          though the sweep itself never submits forms).
// STABILITY_INIT_SCRIPT — pre-seed cookie_consent_v1='necessary' so the
//                          CookieConsent banner (Layout.astro mount) stays hidden.
// ANIMATION_FREEZE_CSS  — kill animations/transitions/caret for deterministic pixels.
// applyStability        — await fonts, inject freeze CSS, scroll bottom->top, settle.
// masksForRoute         — Playwright mask Locators for volatile UI/media regions.

import type { BrowserContext, Locator, Page, Route, Request } from '@playwright/test';

/**
 * Abort every request whose method is not GET or HEAD. Installed on the
 * BrowserContext so it also covers fetch/XHR/beacon from in-page scripts.
 * The anonymous sweep never clicks submit buttons, but this guarantees that
 * even an accidental POST/PUT/PATCH/DELETE (analytics beacons, CSRF probes,
 * service-worker sync) is dropped before it leaves the browser.
 */
export async function installReadOnlyGuard(context: BrowserContext): Promise<void> {
  await context.route('**', (route: Route, request: Request) => {
    const method = request.method().toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
}

/**
 * Runs before any page script (context.addInitScript). Seeds the consent key
 * that CookieConsent.svelte reads in onMount, so the banner never renders.
 * Wrapped in try/catch because localStorage can throw in sandboxed contexts.
 */
export const STABILITY_INIT_SCRIPT: string = `
try {
  window.localStorage.setItem('cookie_consent_v1', 'necessary');
} catch (e) { /* localStorage unavailable — banner mask still covers it */ }
`;

/**
 * Disables all CSS animations, transitions, scroll-behavior, and the blinking
 * text caret so repeated runs produce pixel-identical screenshots. Injected
 * via page.addStyleTag in applyStability.
 */
export const ANIMATION_FREEZE_CSS: string = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
`;

/**
 * Bring a freshly-navigated page into a deterministic, fully-painted state:
 *  1. wait for web fonts (Layout.astro loads Newsreader/Geist/Instrument Serif
 *     from fonts.googleapis.com — late font swaps shift layout/metrics),
 *  2. inject the freeze CSS,
 *  3. scroll bottom -> top to trigger any lazy-loaded / IntersectionObserver
 *     content, then settle, so screenshots aren't missing below-fold images.
 */
export async function applyStability(page: Page): Promise<void> {
  // 1) Fonts. Tolerate the rare case where document.fonts is unavailable.
  await page
    .evaluate(async () => {
      if ((document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }
    })
    .catch(() => { /* fonts API absent — proceed */ });

  // 2) Freeze animations/transitions.
  await page.addStyleTag({ content: ANIMATION_FREEZE_CSS });

  // 3) Trigger lazy content: jump to the bottom, let observers fire, return
  //    to the top so the screenshot starts at y=0.
  await page.evaluate(async () => {
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    window.scrollTo(0, document.body.scrollHeight);
    await settle(150);
    window.scrollTo(0, 0);
    await settle(150);
  });

  // Final settle so post-scroll relayout/paint completes (~300ms total budget).
  await page.waitForTimeout(300);
}

/**
 * Locators to pass as Playwright's `mask` option for a route's screenshot.
 * Always masks <video> and <iframe> (third-party / time-varying media).
 * Route-specifically masks:
 *   - the homepage availability SlotWidget ([data-testid=slot-widget]) — its
 *     "free slots" copy changes with bookings,
 *   - the Kore Timeline section (section.timeline-kore#timeline) on the
 *     korczewski homepage — content reflects v_timeline rows.
 * Returns only the masks that exist for this route; callers may pass the array
 * straight to `mask` (Playwright skips locators that resolve to 0 elements).
 */
export function masksForRoute(page: Page, route: string): Locator[] {
  const masks: Locator[] = [
    page.locator('video'),
    page.locator('iframe'),
  ];

  const normalized = route.split('?')[0].split('#')[0];
  const isHome = normalized === '/' || normalized === '' || normalized === '/index';

  if (isHome) {
    // Mentolder homepage availability widget.
    masks.push(page.locator('[data-testid="slot-widget"]'));
    // Korczewski (Kore) homepage timeline section.
    masks.push(page.locator('section.timeline-kore#timeline'));
  }

  return masks;
}
