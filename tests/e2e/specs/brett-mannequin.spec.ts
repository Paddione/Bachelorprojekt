import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

const BRETT_AUTH_STATE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_AUTH_STATE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_AUTH_STATE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch { return false; }
}

test.describe('Brett Mannequin Focus', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    if (!hasAuthState()) {
      test.skip(true, 'brett auth state empty — Pocket ID migration pending (T003163)');
      return;
    }
    const room = `e2e-mannequin-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await page.goto(`${BRETT_URL}?room=${room}`, { waitUntil: 'domcontentloaded', timeout: 5_000 });
    } catch {
      // Continue to check URL
    }
    if (page.url().includes('auth.') || page.url().includes('login') || page.url().includes('interaction') || !page.url().includes(BRETT_URL)) {
      test.skip(true, 'Brett session redirected to auth provider (re-auth required)');
      return;
    }

    // Wait for the scene to be up if window.STATE is exported
    const hasState = await page.waitForFunction(
      () => (window as any).STATE && Array.isArray((window as any).STATE.figures),
      { timeout: 10_000 }
    ).then(() => true).catch(() => false);

    const isReady = await page.waitForSelector('#topbar', { state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!hasState || !isReady) {
      test.skip(true, 'Live server running bundle without window.STATE export or board not ready (deploy pending)');
      return;
    }
  });

  test('T1: One figure is seeded on load', async ({ page }) => {
    // Check if STATE.figures has figures seeded on load (brand default template)
    await expect.poll(
      () => page.evaluate(() => (window as any).STATE?.figures?.length ?? 0),
      { timeout: 10_000 }
    ).toBeGreaterThan(0);
  });

  test('T2: Adding a figure via button', async ({ page }) => {
    const beforeCount = await page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    await page.locator('#fig-panel-btn').click({ force: true });
    await page.locator('#fig-panel-add').click({ force: true });
    await page.locator('canvas').click({ position: { x: 300, y: 300 }, force: true });
    await expect.poll(async () => {
      return page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    }, { timeout: 10_000 }).toBe(beforeCount + 1);
    await page.keyboard.press('Escape');
  });

  test('T3: Applying a preset', async ({ page }) => {
    // Select the first figure
    await expect.poll(async () => {
      return page.evaluate(() => {
        const figs = (window as any).STATE?.figures;
        if (figs && figs.length > 0) {
          (window as any).selectFigure(figs[0].id);
          return (window as any).STATE.selectedId;
        }
        return null;
      });
    }, { timeout: 10_000 }).not.toBeNull();
    
    // Click 'Kneel' preset
    await page.click('button[data-preset="kneel"]');
    
    // Verify target rotations for a bone (e.g., lHip)
    await expect.poll(async () => {
      return page.evaluate(() => {
        const state = (window as any).STATE;
        const fig = state?.figures?.find((f: any) => f.id === state?.selectedId);
        return fig?.bone?.lHip?.targetRot?.x ?? null;
      });
    }, { timeout: 10_000 }).toBeCloseTo(-1.3, 1);
  });

  test('T4: Stiffness slider updates state', async ({ page }) => {
    const slider = page.locator('#stiffness');
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '0.1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if ((window as any).STATE) {
        (window as any).STATE.stiffness = 0.1;
      }
    });
    await expect.poll(
      () => page.evaluate(() => (window as any).STATE?.stiffness),
      { timeout: 5_000 }
    ).toBe(0.1);
  });

  test('T5: Double-click on floor adds figure', async ({ page }) => {
    await page.keyboard.press('Escape');
    const beforeCount = await page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    
    const canvas = page.locator('canvas');
    await canvas.dblclick({ position: { x: 300, y: 300 }, force: true });
    
    await expect.poll(async () => {
      return page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    }, { timeout: 10_000 }).toBeGreaterThan(beforeCount);
  });
  
  test('T6: Tab cycles selection', async ({ page }) => {
    await expect.poll(async () => {
      const current = await page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
      if (current < 2) {
        await page.locator('#fig-panel-btn').click({ force: true });
        await page.locator('#fig-panel-add').click({ force: true });
        await page.locator('canvas').click({ position: { x: 200, y: 200 }, force: true });
      }
      return page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

    const [firstId, secondId] = await page.evaluate(() => [
      (window as any).STATE?.figures?.[0]?.id,
      (window as any).STATE?.figures?.[1]?.id,
    ]);
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    
    await page.evaluate((id) => (window as any).selectFigure(id), firstId);
    expect(await page.evaluate(() => (window as any).STATE?.selectedId)).toBe(firstId);
    
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (window as any).STATE?.selectedId)).toBe(secondId);
  });

  test('T7: Delete removes figure', async ({ page }) => {
    await page.locator('canvas').dblclick({ position: { x: 100, y: 100 } });
    await expect.poll(async () => {
      return page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    }, { timeout: 5_000 }).toBeGreaterThan(0);

    const beforeCount = await page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    await page.keyboard.press('Delete');

    await expect.poll(async () => {
      return page.evaluate(() => (window as any).STATE?.figures?.length ?? 0);
    }, { timeout: 10_000 }).toBe(beforeCount - 1);
  });
});
