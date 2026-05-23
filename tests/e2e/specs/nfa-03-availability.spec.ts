import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-03: Verfügbarkeit und Neustart-Resilienz', () => {
  test('T3: Vaultwarden ist erreichbar', async ({ request }) => {
    const VW_URL =
      process.env.VAULTWARDEN_URL ??
      (process.env.PROD_DOMAIN
        ? `https://vault.${process.env.PROD_DOMAIN}`
        : 'http://vault.localhost');
    const res = await request.get(`${VW_URL}/alive`, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T5: Website ist erreichbar (Basis-Verfügbarkeit)', async ({ request }) => {
    const res = await request.get(BASE, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T5: Im Browser — Website liefert keine Gateway-Fehler', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('502 Bad Gateway');
    await expect(page.locator('body')).not.toContainText('503 Service Unavailable');
    await expect(page.locator('body')).not.toContainText('504 Gateway Timeout');
  });

  test('T3: Keycloak ist erreichbar', async ({ request }) => {
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (process.env.PROD_DOMAIN
        ? `https://auth.${process.env.PROD_DOMAIN}`
        : 'http://auth.localhost');
    const res = await request.get(KC_URL, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test.skip(true, 'T1-T2, T4: Pod-Neustart und PVC-Datenpersistenz erfordern kubectl-Zugriff');
});
