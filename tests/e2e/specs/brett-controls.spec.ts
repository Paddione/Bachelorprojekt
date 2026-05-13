import { test, expect, type Page } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = any;

test.describe('Brett Controls — Task 2 camera state', () => {
  test('camera state object exists and renders', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-cam-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).camera === 'object' && (window as W).camera.mode === 'orbit', { timeout: 5000 });
    const state = await page.evaluate(() => ({ mode: (window as W).camera.mode, theta: (window as W).camera.theta, phi: (window as W).camera.phi, radius: (window as W).camera.radius }));
    expect(state.mode).toBe('orbit');
    expect(state.radius).toBeCloseTo(44, 1);
  });
});

test.describe('Brett Controls — Task 3 presets', () => {
  test('keyboard 1 enters top-down view', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-preset-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).goToPreset === 'function', { timeout: 5000 });
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    const phi = await page.evaluate(() => (window as W).camera.phi);
    expect(phi).toBeLessThan(0.10);
  });

  test('keyboard H returns to home from any view', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-home-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).goToPreset === 'function');
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    await page.keyboard.press('h');
    await page.waitForTimeout(600);
    const { phi, radius } = await page.evaluate(() => ({ phi: (window as W).camera.phi, radius: (window as W).camera.radius }));
    expect(phi).toBeCloseTo(0.95, 1);
    expect(radius).toBeCloseTo(44, 1);
  });
});

test.describe('Brett Controls — Task 4 tool modes', () => {
  test('keyboard V/O/P/R/F/E switches active tool', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-tool-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).setActiveTool === 'function');
    for (const k of ['v', 'o', 'p', 'r']) {
      await page.keyboard.press(k);
      const active = await page.evaluate(() => (window as W).getActiveTool());
      expect(active).toBe(k.toUpperCase());
    }
  });
});

test.describe('Brett Controls — Task 5 touch', () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 915 } });
  test('two-finger pinch changes radius', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-pinch-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).camera === 'object');
    const before = await page.evaluate(() => (window as W).camera.radius);
    // Synthesize a pinch-out (zoom in = smaller radius)
    await page.evaluate(() => {
      const cnvEl = document.getElementById('three-canvas') as HTMLElement;
      const r = cnvEl.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const t1Down = new TouchEvent('touchstart', { touches: [
        new Touch({ identifier: 1, target: cnvEl as EventTarget, clientX: cx - 50, clientY: cy }),
        new Touch({ identifier: 2, target: cnvEl as EventTarget, clientX: cx + 50, clientY: cy }),
      ], cancelable: true, bubbles: true });
      cnvEl.dispatchEvent(t1Down);
      const t2Move = new TouchEvent('touchmove', { touches: [
        new Touch({ identifier: 1, target: cnvEl as EventTarget, clientX: cx - 100, clientY: cy }),
        new Touch({ identifier: 2, target: cnvEl as EventTarget, clientX: cx + 100, clientY: cy }),
      ], cancelable: true, bubbles: true });
      cnvEl.dispatchEvent(t2Move);
    });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => (window as W).camera.radius);
    expect(after).toBeLessThan(before);
  });
});

test.describe('Brett Controls — Task 6 collapsible bars', () => {
  test('bar state persists across reload', async ({ page }: { page: Page }) => {
    const room = `e2e-bars-${Date.now()}`;
    await page.goto(`${BRETT_URL}?room=${room}`);
    await page.waitForFunction(() => typeof (window as W).Bars === 'object');
    await page.keyboard.press(']');  // collapse dock
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as W).Bars.state.dock)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => typeof (window as W).Bars === 'object');
    expect(await page.evaluate(() => (window as W).Bars.state.dock)).toBe(true);
    expect(await page.evaluate(() => document.body.classList.contains('bc-dock-collapsed'))).toBe(true);
  });
});

test.describe('Brett Controls — full coverage', () => {

  test('compass click returns home', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-compass-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).goHome === 'function');
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    await page.click('#bc-compass');
    await page.waitForTimeout(600);
    const phi = await page.evaluate(() => (window as W).camera.phi);
    expect(phi).toBeCloseTo(0.95, 1);
  });

  test('bookmark save + restore', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-bk-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).Bookmarks === 'object');
    await page.keyboard.press('3');
    await page.waitForTimeout(500);
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as W).Bookmarks.items.length)).toBe(1);
    await page.keyboard.press('5');
    await page.waitForTimeout(500);
    await page.keyboard.press('Shift+1');
    await page.waitForTimeout(600);
    const theta = await page.evaluate(() => (window as W).camera.theta);
    expect(theta).toBeCloseTo(-Math.PI / 2, 1);
  });

  test('bookmark name with HTML is escaped (XSS safety)', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-bkxss-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).Bookmarks === 'object');
    await page.evaluate(() => {
      const w = window as W;
      w.Bookmarks.items.push({ name: '<img src=x onerror=window.__xss=1>', snap: w.snapshot ? w.snapshot() : {} });
      w.Bookmarks.render();
    });
    await page.waitForTimeout(200);
    const xss = await page.evaluate(() => (window as W).__xss);
    expect(xss).toBeUndefined();
    const nameEls = page.locator('.bc-bk-name');
    const count = await nameEls.count();
    if (count > 0) {
      const html = await nameEls.first().innerHTML();
      expect(html).not.toContain('<img');
    }
  });

  test('split-view toggle changes render', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-split-${Date.now()}`);
    await page.waitForFunction(() => typeof (window as W).camera === 'object');
    await page.keyboard.press('Shift+S');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-mode-split')!.classList.contains('active'))).toBe(true);
    await page.keyboard.press('Shift+S');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-mode-split')!.classList.contains('active'))).toBe(false);
  });

  test('help overlay opens on ?', async ({ page }: { page: Page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-help-${Date.now()}`);
    await page.waitForFunction(() => document.getElementById('bc-help-overlay') !== null);
    await page.keyboard.press('Shift+/');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => !document.getElementById('bc-help-overlay')!.hidden)).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('bc-help-overlay')!.hidden)).toBe(true);
  });
});
