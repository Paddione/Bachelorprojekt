// tests/e2e/specs/brett-art.spec.ts
import { test, expect } from '@playwright/test';

const URL = process.env.BRETT_URL || 'https://brett.korczewski.de';

test('Brett loads art manifest and exposes character ids', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  const ids = await page.evaluate(() => Array.from((window as any).characterIds ?? []));
  expect(ids).toEqual(expect.arrayContaining(['figure-01','figure-02','figure-03','figure-04']));
});

test('Placing a figure creates a Sprite child in the figure mesh', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  await page.click('button[data-type="figure-01"]');
  await page.evaluate(() => (window as any).addFigure('figure-01', '#9caa86', 0, 0, '', 1, 0, 'test-1'));
  const hasSprite = await page.evaluate(() => {
    const fig = (window as any).figures?.find((f: any) => f.id === 'test-1');
    return Boolean(fig?.mesh?.children?.some((c: any) => c.type === 'Sprite'));
  });
  expect(hasSprite).toBe(true);
});
