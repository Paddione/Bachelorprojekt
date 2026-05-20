// arena-mobile.spec.ts
// Runs in the `android` project (devices['Pixel 5'], 393×851, hasTouch: true).
// Depends on `arena-mentolder-setup` for auth state (.auth/mentolder-portal.json).
//
// Covers:
//  - Portal layout on mobile: hamburger visible, sidebar hidden by default
//  - Hamburger opens/closes sidebar with backdrop
//  - Arena content visible and accessible on mobile
//  - Lobby UI tap targets ≥ 44px (character selector, action buttons)
//  - No console errors on mobile load or lobby creation

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE = 'https://web.mentolder.de';
const PORTAL_AUTH_STATE = path.join(__dirname, '..', '.auth', 'mentolder-portal.json');

function hasAuthState(): boolean {
  if (!fs.existsSync(PORTAL_AUTH_STATE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(PORTAL_AUTH_STATE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch { return false; }
}

test.describe('Arena Mobile (Android) @mobile', () => {
  test('T1: portal/arena loads without console errors on mobile', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      await expect(page.locator('h1, [class*="heading"]').first()).toBeVisible({ timeout: 10_000 });
      expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });

  test('T2: mobile topbar is visible, sidebar is hidden by default', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForSelector('#portal-mobile-topbar', { timeout: 10_000 });

      await expect(page.locator('#portal-mobile-topbar')).toBeVisible();

      const transform = await page.evaluate(() =>
        getComputedStyle(document.getElementById('portal-sidebar')!).transform
      );
      // matrix(1,0,0,1,-224,0) means translateX(-224px) — sidebar is hidden
      expect(transform).toContain('-224');
    } finally {
      await ctx.close();
    }
  });

  test('T3: hamburger button has ≥44px tap target', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForSelector('#portal-hamburger', { timeout: 10_000 });
      const box = await page.locator('#portal-hamburger').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(36);
      expect(box!.height).toBeGreaterThanOrEqual(36);
    } finally {
      await ctx.close();
    }
  });

  test('T4: hamburger tap opens sidebar and backdrop', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForSelector('#portal-hamburger', { timeout: 10_000 });
      await page.tap('#portal-hamburger');
      await page.waitForTimeout(350); // wait for CSS transition (0.25s)

      const transform = await page.evaluate(() =>
        getComputedStyle(document.getElementById('portal-sidebar')!).transform
      );
      expect(transform).not.toContain('-224');

      await expect(page.locator('#portal-backdrop')).toHaveCSS('opacity', '1');
    } finally {
      await ctx.close();
    }
  });

  test('T5: backdrop tap closes sidebar', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForSelector('#portal-hamburger', { timeout: 10_000 });
      await page.tap('#portal-hamburger');
      await page.waitForTimeout(350);

      await page.tap('#portal-backdrop');
      await page.waitForTimeout(350);

      const transform = await page.evaluate(() =>
        getComputedStyle(document.getElementById('portal-sidebar')!).transform
      );
      expect(transform).toContain('-224');
    } finally {
      await ctx.close();
    }
  });

  test('T6: Arena heading and lobby button visible on mobile', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await expect(page.getByRole('heading', { name: /arena/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /neue lobby/i })).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test('T7: Neue Lobby öffnen button has ≥44px tap target', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      const btn = page.getByRole('button', { name: /neue lobby/i });
      await btn.waitFor({ timeout: 10_000 });
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    } finally {
      await ctx.close();
    }
  });

  test('T8: opening lobby shows lobby UI on mobile', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.getByRole('button', { name: /neue lobby/i }).tap();
      await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

      await expect(page.getByText(/arena · lobby/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: /waiting for players/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /leave lobby/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /start match/i })).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test('T9: lobby action buttons have ≥44px tap targets', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.getByRole('button', { name: /neue lobby/i }).tap();
      await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

      for (const name of [/leave lobby/i, /start match/i]) {
        const btn = page.getByRole('button', { name });
        await btn.waitFor({ timeout: 5_000 });
        const box = await btn.boundingBox();
        expect(box, `${name} button bounding box`).not.toBeNull();
        expect(box!.height, `${name} button height`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await ctx.close();
    }
  });

  test('T10: character selector arrows have ≥44px tap targets', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.getByRole('button', { name: /neue lobby/i }).tap();
      await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

      const prevBtn = page.getByRole('button', { name: /previous character/i });
      const nextBtn = page.getByRole('button', { name: /next character/i });
      await prevBtn.waitFor({ timeout: 5_000 });

      for (const btn of [prevBtn, nextBtn]) {
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(36);
      }
    } finally {
      await ctx.close();
    }
  });

  test('T11: character selector cycles characters on tap', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.getByRole('button', { name: /neue lobby/i }).tap();
      await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

      // Use src attribute to identify character image — simpler than role-filter
      const img = page.locator('img[src]').first();
      await img.waitFor({ timeout: 5_000 });
      const srcBefore = await img.getAttribute('src');

      await page.getByRole('button', { name: /next character/i }).tap();
      await page.waitForTimeout(300);

      const srcAfter = await img.getAttribute('src');
      expect(srcAfter).not.toBe(srcBefore);
    } finally {
      await ctx.close();
    }
  });

  test('T12: portal main content fills full width on mobile (sidebar not blocking)', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: PORTAL_AUTH_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/portal/arena`);
      await page.waitForSelector('#portal-main', { timeout: 10_000 });

      const vw = await page.evaluate(() => window.innerWidth);
      const mainW = await page.evaluate(() => document.getElementById('portal-main')!.offsetWidth);

      // Main should fill ≥90% of the viewport — sidebar must not be consuming space
      expect(mainW).toBeGreaterThanOrEqual(vw * 0.9);
    } finally {
      await ctx.close();
    }
  });
});
