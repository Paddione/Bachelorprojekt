import { test, expect } from '@playwright/test';

test.describe('NFA-12: Brainstorm-Tunnel ConfigMap-Persistenz', () => {
  test('T5: brainstorm.mentolder.de erreichbar (Basis-Konnektivität)', async ({ request }) => {
    test.skip(!process.env.PROD_DOMAIN, 'requires prod cluster (PROD_DOMAIN)');
    // 502 = sish is running but no tunnel is currently published (expected in CI)
    // 200/301/302 = tunnel is active
    const res = await request.get('https://brainstorm.mentolder.de', {
      maxRedirects: 3,
      // Do not fail on 502 — that is a valid state when no tunnel is published
    });
    expect([200, 301, 302, 502]).toContain(res.status());
  });

  test('T5: Im Browser — brainstorm.mentolder.de liefert keine 5xx-Fehler außer 502', async ({ page }) => {
    test.skip(!process.env.PROD_DOMAIN, 'requires prod cluster (PROD_DOMAIN)');
    const response = await page.goto('https://brainstorm.mentolder.de');
    // 502 is acceptable (no active tunnel), but 500/503/504 indicate a sish/pod problem
    const status = response?.status() ?? 0;
    expect([200, 301, 302, 404, 502]).toContain(status);
  });

  test.skip(true, 'T1-T4: kubectl ConfigMap-Prüfungen, Flux-Reconciliation und SSH-Tunnel erfordern Cluster-Zugriff');
});
