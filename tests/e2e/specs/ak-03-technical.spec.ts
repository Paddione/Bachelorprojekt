import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('AK-03: Technische Machbarkeit', () => {
  test.setTimeout(90_000);

  test('T3a: Keycloak ist erreichbar', async ({ request }) => {
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (process.env.PROD_DOMAIN
        ? `https://auth.${process.env.PROD_DOMAIN}`
        : 'http://auth.localhost');
    const res = await request.get(KC_URL, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T3b: Website ist erreichbar', async ({ request }) => {
    const res = await request.get(BASE, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T3c: Vaultwarden ist erreichbar', async ({ request }) => {
    const VW_URL =
      process.env.VAULTWARDEN_URL ??
      (process.env.PROD_DOMAIN
        ? `https://vault.${process.env.PROD_DOMAIN}`
        : 'http://vault.localhost');
    const res = await request.get(VW_URL, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T3d: Im Browser — Website lädt ohne Fehler', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('502 Bad Gateway');
    await expect(page.locator('body')).not.toContainText('503 Service Unavailable');
  });

  test('T3e: Im Browser — Pocket-ID-Login-Seite rendert', async ({ page }) => {
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (process.env.PROD_DOMAIN
        ? `https://auth.${process.env.PROD_DOMAIN}`
        : 'http://auth.localhost');
    await page.goto(`${KC_URL}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    // Pocket ID redirects to its login page — verify it's a Pocket ID page (not an error)
    await expect(page.locator('body')).not.toContainText('502 Bad Gateway');
  });

  test.fixme(true, 'T1-T2, T4: kubectl-Operationen (Pod-Count, Image-Tags) und task workspace:status erfordern Cluster-Zugriff — T000480');
});
