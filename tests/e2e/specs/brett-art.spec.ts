// tests/e2e/specs/brett-art.spec.ts
// Brett is SSO-gated (oauth2-proxy → Keycloak).
// Set BRETT_COOKIE=<session-cookie> to run authenticated tests,
// or these will assert redirect behaviour only.
import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL || 'https://brett.korczewski.de';
const COOKIE = process.env.BRETT_COOKIE || '';

function useAuthCookie(page: import('@playwright/test').Page) {
  if (!COOKIE) return Promise.resolve();
  const [name, ...rest] = COOKIE.split('=');
  return page.context().addCookies([{
    name: name.trim(),
    value: rest.join('=').trim(),
    domain: new URL(BRETT_URL).hostname,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

test('Brett redirects unauthenticated users to Keycloak', async ({ page }) => {
  await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });
  if (COOKIE) {
    test.skip(); // when authenticated, redirect test doesn't apply
    return;
  }
  await expect(page).toHaveURL(/auth\.|realms\/workspace/, { timeout: 15_000 });
});

test('Brett loads art manifest and exposes character ids', async ({ page }) => {
  if (!COOKIE) { test.skip(); return; }
  await useAuthCookie(page);
  await page.goto(BRETT_URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  const ids = await page.evaluate(() => Array.from((window as any).characterIds ?? []));
  expect(ids).toEqual(expect.arrayContaining(['figure-01','figure-02','figure-03','figure-04']));
});

test('Placing a figure creates a Sprite child in the figure mesh', async ({ page }) => {
  if (!COOKIE) { test.skip(); return; }
  await useAuthCookie(page);
  await page.goto(BRETT_URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  await page.click('button[data-type="figure-01"]');
  await page.evaluate(() => (window as any).addFigure('figure-01', '#9caa86', 0, 0, '', 1, 0, 'test-1'));
  const hasSprite = await page.evaluate(() => {
    const fig = (window as any).figures?.find((f: any) => f.id === 'test-1');
    return Boolean(fig?.mesh?.children?.some((c: any) => c.type === 'Sprite'));
  });
  expect(hasSprite).toBe(true);
});
