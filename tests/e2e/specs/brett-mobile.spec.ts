// brett-mobile.spec.ts
// Runs in the `android` project (devices['Pixel 5'], 393×851, hasTouch: true).
// Depends on `brett-mentolder-setup` for auth state.
//
// Covers:
//  - Mobile viewport: canvas fills screen, topbar scrollable
//  - Touch events fire on canvas without JS errors
//  - REGRESSION: Mayhem button click before WS init must not throw TypeError

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');
const BRETT_AUTH_STATE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_AUTH_STATE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_AUTH_STATE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch { return false; }
}

test.describe('Brett Mobile (Android) @mobile', () => {
  test('T1: unauthenticated visit redirects to Keycloak', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/auth\.|realms\/workspace/, { timeout: 60_000 });
    await ctx.close();
  });

  test('T2: page has data-URI favicon (browser never requests /favicon.ico)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
    });
    const page = await ctx.newPage();
    const faviconFetches: string[] = [];
    page.on('request', req => { if (req.url().includes('favicon.ico')) faviconFetches.push(req.url()); });
    try {
      await page.goto(`${BRETT_URL}?room=e2e-favicon-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });

      // Browser must not request /favicon.ico because <link rel="icon"> is a data: URI
      expect(faviconFetches).toHaveLength(0);

      const faviconHref: string | null = await page.evaluate(() => {
        const link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
        return link?.href ?? null;
      });
      expect(faviconHref).not.toBeNull();
      expect(faviconHref).toContain('data:image/svg+xml');
    } finally {
      await ctx.close();
    }
  });

  test('T3: canvas fills viewport width on mobile', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-canvas-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 10_000 });

      const vw = await page.evaluate(() => window.innerWidth);
      const canvasW = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement | null;
        return c ? c.offsetWidth : 0;
      });
      // Canvas should fill at least 90% of viewport width on mobile
      expect(canvasW).toBeGreaterThanOrEqual(vw * 0.9);
    } finally {
      await ctx.close();
    }
  });

  test('T4: topbar is scrollable on mobile (overflow-x)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-topbar-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForSelector('#topbar', { timeout: 10_000 });

      const overflowX = await page.evaluate(() => getComputedStyle(document.getElementById('topbar')!).overflowX);
      expect(overflowX).toBe('auto');
    } finally {
      await ctx.close();
    }
  });

  test('T5: touch tap on canvas does not throw JS error', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-touch-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(() => Array.isArray((window as any).STATE?.figures), { timeout: 10_000 });

      const canvas = page.locator('canvas');
      await canvas.tap();
      await page.waitForTimeout(300);

      const typeErrors = errors.filter(e => e.includes('TypeError'));
      expect(typeErrors).toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });

  test('T7: status pill visible on mobile', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-pill-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(page.locator('#status-pill')).toBeVisible({ timeout: 60_000 });

      const pill = await page.locator('#status-pill').boundingBox();
      expect(pill).not.toBeNull();
      // Pill should be horizontally centred on mobile
      const vw = await page.evaluate(() => window.innerWidth);
      expect(pill!.x + pill!.width / 2).toBeCloseTo(vw / 2, 0);
    } finally {
      await ctx.close();
    }
  });

  test('T8: preset buttons have minimum 44px tap height', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-taptarget-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForSelector('.preset-btn', { timeout: 10_000 });

      const heights: number[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.preset-btn'))
          .map(btn => btn.offsetHeight)
      );
      // T000606: pointer:coarse media query enforces a 44px minimum tap height.
      expect(heights.every(h => h >= 44)).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('T9: pinch-out zooms the orbit camera in (orbit dist decreases)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-pinch-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(() => !!(window as any).__brettScene, { timeout: 10_000 });

      const before = await page.evaluate(() => (window as any).__brettScene.getOrbitState().dist);

      const cdp = await ctx.newCDPSession(page);
      const cx = await page.evaluate(() => window.innerWidth / 2);
      const cy = await page.evaluate(() => window.innerHeight / 2);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
        touchPoints: [{ x: cx - 20, y: cy }, { x: cx + 20, y: cy }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [{ x: cx - 100, y: cy }, { x: cx + 100, y: cy }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);

      const after = await page.evaluate(() => (window as any).__brettScene.getOrbitState().dist);
      expect(after).toBeLessThan(before);
    } finally {
      await ctx.close();
    }
  });

  test('T10: one-finger drag on empty floor orbits the camera (theta changes)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: BRETT_AUTH_STATE,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-mobile-orbit-${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForFunction(() => !!(window as any).__brettScene, { timeout: 10_000 });

      const before = await page.evaluate(() => (window as any).__brettScene.getOrbitState().theta);

      const cdp = await ctx.newCDPSession(page);
      const startX = await page.evaluate(() => Math.round(window.innerWidth * 0.2));
      const y = await page.evaluate(() => Math.round(window.innerHeight * 0.3));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',  touchPoints: [{ x: startX + 120, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',   touchPoints: [] });
      await page.waitForTimeout(200);

      const after = await page.evaluate(() => (window as any).__brettScene.getOrbitState().theta);
      expect(Math.abs(after - before)).toBeGreaterThan(0.01);
    } finally {
      await ctx.close();
    }
  });
});
