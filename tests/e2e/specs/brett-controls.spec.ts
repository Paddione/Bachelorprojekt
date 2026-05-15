import { test, expect, type Page } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = any;

test.describe('Brett Controls — WASD movement', () => {
  test('W key moves selected figure in -Z direction', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-wasd-${Date.now()}`);
    await page.waitForFunction(() => Array.isArray((window as W).STATE?.figures), { timeout: 5000 });

    // Get initial position of the first (seeded) figure
    const zBefore = await page.evaluate(() => {
      const fig = (window as W).STATE.figures[0];
      (window as W).selectFigure(fig.id);
      return fig.root.position.z;
    });

    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');

    const zAfter = await page.evaluate(() => (window as W).STATE.figures[0].root.position.z);
    expect(zAfter).toBeLessThan(zBefore);
  });

  test('Shift key is tracked for sprint', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-sprint-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).STATE === 'object', { timeout: 5000 });

    await page.keyboard.down('Shift');
    const shiftOn = await page.evaluate(() => (window as W).wasdKeys?.shift ?? false);
    expect(shiftOn).toBe(true);
    await page.keyboard.up('Shift');
  });
});

test.describe('Brett Controls — double-click teleport', () => {
  test('easeFigure is exported on window', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-teleport-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).easeFigure === 'function', { timeout: 5000 });

    const result = await page.evaluate(() => {
      const fig = (window as W).STATE.figures[0];
      const zBefore = fig.root.position.z;
      (window as W).easeFigure(fig, 3, 3, 0); // 0ms = instant
      return { moved: fig.root.position.x !== 0 || fig.root.position.z !== zBefore };
    });
    expect(result.moved).toBe(true);
  });

  test('dblclick on floor places a figure when none selected', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-dbl-${Date.now()}`);
    await page.waitForFunction(() => Array.isArray((window as W).STATE?.figures), { timeout: 5000 });

    const countBefore = await page.evaluate(() => (window as W).STATE.figures.length);

    // Deselect so dblclick adds a new figure
    await page.evaluate(() => { (window as W).STATE.selectedId = null; });

    // Double-click in the center of the canvas
    const canvas = page.locator('canvas');
    await canvas.dblclick({ position: { x: 200, y: 200 } });
    await page.waitForTimeout(200);

    const countAfter = await page.evaluate(() => (window as W).STATE.figures.length);
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  });
});

test.describe('Brett Controls — character editor panel', () => {
  test('fig-panel-btn toggles the panel', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-panel-${Date.now()}`);
    await page.waitForFunction(() => !!document.getElementById('fig-panel-btn'), { timeout: 5000 });

    const panelHidden = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
    expect(panelHidden).toBe(true);

    await page.click('#fig-panel-btn');
    const panelVisible = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
    expect(panelVisible).toBe(false);

    await page.click('#fig-panel-close');
    const panelHidden2 = await page.$eval('#fig-panel', (el: HTMLElement) => el.hidden);
    expect(panelHidden2).toBe(true);
  });

  test('scale slider updates panelScale', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-scale-${Date.now()}`);
    await page.waitForFunction(() => !!document.getElementById('fig-scale-slider'), { timeout: 5000 });

    await page.click('#fig-panel-btn');
    await page.fill('#fig-scale-slider', '1.5');
    await page.dispatchEvent('#fig-scale-slider', 'input');

    const scaleText = await page.$eval('#fig-scale-val', (el: HTMLElement) => el.textContent);
    expect(scaleText).toContain('1.5');
  });

  test('L size button sets scale to 1.5', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-sizebtn-${Date.now()}`);
    await page.waitForFunction(() => !!document.querySelector('.fig-size-btn[data-scale="1.5"]'), { timeout: 5000 });

    await page.click('#fig-panel-btn');
    await page.click('.fig-size-btn[data-scale="1.5"]');

    const sliderVal = await page.$eval('#fig-scale-slider', (el: HTMLInputElement) => el.value);
    expect(parseFloat(sliderVal)).toBeCloseTo(1.5, 1);
  });

  test('Setzen button enters placing mode', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-placing-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).placingMode_get === 'function', { timeout: 5000 });

    await page.click('#fig-panel-btn');
    await page.click('#fig-panel-add');

    const placing = await page.evaluate(() => (window as W).placingMode_get());
    expect(placing).toBe(true);

    await page.keyboard.press('Escape');
    const placing2 = await page.evaluate(() => (window as W).placingMode_get());
    expect(placing2).toBe(false);
  });

  test('placing mode sets body.placing-figure class', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-cursor-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).placingMode_get === 'function', { timeout: 5000 });

    await page.click('#fig-panel-btn');
    await page.click('#fig-panel-add');

    const hasClass = await page.evaluate(() => document.body.classList.contains('placing-figure'));
    expect(hasClass).toBe(true);

    await page.keyboard.press('Escape');
    const hasClassAfter = await page.evaluate(() => document.body.classList.contains('placing-figure'));
    expect(hasClassAfter).toBe(false);
  });
});
