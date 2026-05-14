import { test, expect, type Page } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('Brett Mannequin Focus', () => {
  test.beforeEach(async ({ page }) => {
    // We use a unique room for each test to avoid interference
    const room = `e2e-mannequin-${Math.random().toString(36).slice(2, 7)}`;
    await page.goto(`${BRETT_URL}?room=${room}`);
    // Wait for the scene to be up
    await page.waitForFunction(() => (window as any).STATE && (window as any).STATE.figures.length > 0, { timeout: 5000 });
    // Check for core UI elements
    await expect(page.locator('#topbar')).toBeVisible();
    await expect(page.locator('#status-pill')).toBeVisible();
  });

  test('T1: One figure is seeded on load', async ({ page }) => {
    // Check if STATE.figures has one element
    const count = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(count).toBe(1);
  });

  test('T2: Adding a figure via button', async ({ page }) => {
    await page.click('#add-figure');
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
    
    // We need to double click the canvas/floor. 
    // Since it's a 3D scene, we just dblclick the center of the viewport.
    const canvas = page.locator('canvas');
    await canvas.dblclick();
    
    const afterCount = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(afterCount).toBeGreaterThan(beforeCount);
  });
  
  test('T6: Tab cycles selection', async ({ page }) => {
    await page.click('#add-figure'); // now 2 figures
    const firstId = await page.evaluate(() => (window as any).STATE.figures[0].id);
    const secondId = await page.evaluate(() => (window as any).STATE.figures[1].id);
    
    await page.evaluate((id) => (window as any).selectFigure(id), firstId);
    expect(await page.evaluate(() => (window as any).STATE.selectedId)).toBe(firstId);
    
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (window as any).STATE.selectedId)).toBe(secondId);
  });

  test('T7: Delete removes figure', async ({ page }) => {
    await page.click('#add-figure');
    const beforeCount = await page.evaluate(() => (window as any).STATE.figures.length);
    await page.keyboard.press('Delete');
    const afterCount = await page.evaluate(() => (window as any).STATE.figures.length);
    expect(afterCount).toBe(beforeCount - 1);
  });
});
