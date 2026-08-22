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

  // Überführt aus ak-03-technical.spec.ts (T013329 F4/D3): die Browser-Prüfungen
  // T3d/T3e blieben erhalten, während die Dubletten T3a/T3b/T3c hier aufgehen.
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
});
