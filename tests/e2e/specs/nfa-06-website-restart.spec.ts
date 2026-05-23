import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-06: Website Neustart-Resilienz', () => {
  test('T3: Website ist nach potenziellem Neustart erreichbar', async ({ request }) => {
    const res = await request.get(BASE, { maxRedirects: 3 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('Im Browser: Website lädt vollständig ohne Fehlerseiten', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('502 Bad Gateway');
    await expect(page.locator('body')).not.toContainText('503 Service Unavailable');
    await expect(page.locator('body')).not.toContainText('504 Gateway Timeout');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });

  test('Im Browser: HTML-Struktur nach Restart vollständig gerendert', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    // Verify a meaningful HTML structure was served (not just an empty 200)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.trim().length).toBeGreaterThan(50);
  });

  test.skip(true, 'T1-T4: kubectl rollout-Operationen erfordern Cluster-Zugriff');
});
