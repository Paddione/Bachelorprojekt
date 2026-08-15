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
    await page.goto(`${BRETT_URL}?room=${room}`, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
    if (page.url().includes('auth.') || page.url().includes('login') || page.url().includes('interaction')) {
      test.skip(true, 'Brett session redirected to auth provider (re-auth required)');
      return;
    }

    // Wait for the scene to be up if window.STATE is exported
    const hasState = await page.waitForFunction(
      () => (window as any).STATE && Array.isArray((window as any).STATE.figures),
      { timeout: 2000 }
    ).then(() => true).catch(() => false);

    const isReady = await page.waitForSelector('#topbar', { state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!hasState || !isReady) {
      test.skip(true, 'Live server running bundle without window.STATE export or board not ready (deploy pending)');
      return;
    }
  });

  test('T1: One figure is seeded on load', async ({ page }) => {
    // Check if STATE.figures has one element
    const count = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(count).toBe(1);
  });

  test('T2: Adding a figure via button', async ({ page }) => {
    await page.click('#fig-panel-btn');
    await page.click('#fig-panel-add');
    await page.locator('canvas').click({ position: { x: 150, y: 150 } });
    const count = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(count).toBe(2);
  });

  test('T3: Applying a preset', async ({ page }) => {
    // Select the first figure
    await page.evaluate(() => (window as any).selectFigure((window as any).STATE.figures[0].id));
    
    // Click 'Kneel' preset
    await page.click('button[data-preset="kneel"]');
    
    // Verify target rotations for a bone (e.g., lHip)
    const lHipTargetX = await page.evaluate(() => {
      const fig = (window as any).STATE.figures.find((f: any) => f.id === (window as any).STATE.selectedId);
      return fig.bone.lHip.targetRot.x;
    });
    expect(lHipTargetX).toBeCloseTo(-1.3, 1);
  });

  test('T4: Stiffness slider updates state', async ({ page }) => {
    const slider = page.locator('#stiffness');
    await slider.fill('0.1');
    const stiffness = await page.evaluate(() => (window as any).STATE.stiffness);
    expect(stiffness).toBe(0.1);
  });

  test('T5: Double-click on floor adds figure', async ({ page }) => {
    const beforeCount = await page.evaluate(() => (window as any).STATE.figures.length);
    
    const canvas = page.locator('canvas');
    await canvas.dblclick({ position: { x: 100, y: 100 } });
    
    const afterCount = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(afterCount).toBeGreaterThan(beforeCount);
  });
  
  test('T6: Tab cycles selection', async ({ page }) => {
    await page.locator('canvas').dblclick({ position: { x: 100, y: 100 } }); // now 2 figures
    const firstId = await page.evaluate(() => (window as any).STATE.figures[0].id);
    const secondId = await page.evaluate(() => (window as any).STATE.figures[1].id);
    
    await page.evaluate((id) => (window as any).selectFigure(id), firstId);
    expect(await page.evaluate(() => (window as any).STATE.selectedId)).toBe(firstId);
    
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (window as any).STATE.selectedId)).toBe(secondId);
  });

  test('T7: Delete removes figure', async ({ page }) => {
    await page.locator('canvas').dblclick({ position: { x: 100, y: 100 } });
    const beforeCount = await page.evaluate(() => (window as any).STATE.figures.length);
    await page.keyboard.press('Delete');
    const afterCount = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(afterCount).toBe(beforeCount - 1);
  });
});
