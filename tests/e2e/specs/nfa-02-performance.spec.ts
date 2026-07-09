import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-02: Performance / Antwortzeiten', () => {
  test.setTimeout(90_000);

  test('T3: Website lädt in < 5000ms (HTTP)', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(BASE, { maxRedirects: 3 });
    const elapsed = Date.now() - start;
    expect([200, 301, 302]).toContain(res.status());
    expect(elapsed).toBeLessThan(5000);
  });

  test('T3: Im Browser — Website lädt sichtbar in < 5000ms', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    await expect(page.locator('body')).toBeVisible();
    expect(elapsed).toBeLessThan(5000);
  });

  test('T1a+T1b: Keycloak Health-Endpunkt antwortet in Zeit-Schwellwert', async ({ request }) => {
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (process.env.PROD_DOMAIN
        ? `https://auth.${process.env.PROD_DOMAIN}`
        : 'http://auth.localhost');
    const start = Date.now();
    const res = await request.get(`${KC_URL}/health/ready`, { maxRedirects: 3 });
    const elapsed = Date.now() - start;
    expect([200, 301, 302]).toContain(res.status());
    const threshold = process.env.PROD_DOMAIN ? 1000 : 3000;
    expect(elapsed).toBeLessThan(threshold);
  });

  test('T2: Vaultwarden antwortet in < 3000ms', async ({ request }) => {
    const VW_URL =
      process.env.VAULTWARDEN_URL ??
      (process.env.PROD_DOMAIN
        ? `https://vault.${process.env.PROD_DOMAIN}`
        : 'http://vault.localhost');
    const start = Date.now();
    const res = await request.get(VW_URL, { maxRedirects: 3 });
    const elapsed = Date.now() - start;
    expect([200, 301, 302]).toContain(res.status());
    expect(elapsed).toBeLessThan(3000);
  });

  test.skip(true, 'T4: Core Web Vitals via Lighthouse erfordern manuelle Ausführung');
});
