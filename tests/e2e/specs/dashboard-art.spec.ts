// tests/e2e/specs/dashboard-art.spec.ts
// Dashboard is SSO-gated (oauth2-proxy → Keycloak).
// Set DASHBOARD_COOKIE=<session-cookie> to run authenticated tests,
// or these will assert redirect behaviour only.
import { test, expect } from '@playwright/test';

const URL = process.env.DASHBOARD_URL || 'https://dashboard.korczewski.de';
const URL_MENTOLDER = process.env.DASHBOARD_URL_MENTOLDER || 'https://dashboard.mentolder.de';
const COOKIE = process.env.DASHBOARD_COOKIE || '';

function useAuthCookie(page: import('@playwright/test').Page) {
  if (!COOKIE) return Promise.resolve();
  const [name, ...rest] = COOKIE.split('=');
  return page.context().addCookies([{
    name: name.trim(),
    value: rest.join('=').trim(),
    domain: new URL(URL).hostname,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

test('art tab button is present in the nav after login', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  if (!COOKIE) {
    // Without auth the dashboard redirects to Keycloak — just check the redirect happens
    await expect(page).toHaveURL(/auth\.|realms\/workspace/, { timeout: 15_000 });
    test.skip(); // remaining assertions need auth
    return;
  }
  await useAuthCookie(page);
  await page.reload();
  await expect(page.locator('button', { hasText: /Art Library|Bibliothek/ })).toBeVisible({ timeout: 8_000 });
});

test('art tab is visible and renders art cards', async ({ page }) => {
  if (!COOKIE) { test.skip(); return; }
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await useAuthCookie(page);
  await page.reload();
  await page.click('button:has-text("Art Library"), button:has-text("Bibliothek")');
  await page.waitForSelector('.art-grid', { timeout: 8_000 });
  const cardCount = await page.locator('.art-card').count();
  expect(cardCount).toBeGreaterThan(0);
});

test('clicking a card opens the side panel with palette swatches', async ({ page }) => {
  if (!COOKIE) { test.skip(); return; }
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await useAuthCookie(page);
  await page.reload();
  await page.click('button:has-text("Art Library"), button:has-text("Bibliothek")');
  await page.waitForSelector('.art-grid');
  await page.locator('.art-card').nth(0).click();
  await page.waitForSelector('.art-panel');
  expect(await page.locator('.art-palette-row').count()).toBeGreaterThan(0);
});

test('mentolder context shows empty-state (no art library)', async ({ page }) => {
  if (!COOKIE) { test.skip(); return; }
  // Use mentolder domain cookie if separate env provided
  await page.goto(URL_MENTOLDER, { waitUntil: 'domcontentloaded' });
  const redirected = page.url().includes('auth.') || page.url().includes('realms/workspace');
  if (redirected) { test.skip(); return; }
  await page.click('button:has-text("Art Library"), button:has-text("Bibliothek")');
  await expect(page.locator('.art-empty')).toContainText(
    /No art library configured|Keine Kunstbibliothek/,
    { timeout: 6_000 },
  );
});
