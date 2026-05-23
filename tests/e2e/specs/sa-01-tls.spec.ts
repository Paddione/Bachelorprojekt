import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
const PROD_DOMAIN = process.env.PROD_DOMAIN;

test.describe('SA-01: Transportverschlüsselung', () => {
  /**
   * T2: Services intern erreichbar (HTTP 200, 302, 303)
   * Checks the website root is reachable (no cluster/prod requirement).
   */
  test('T2: Website ist erreichbar (HTTP 200/301/302)', async ({ request }) => {
    const res = await request.get(BASE, { maxRedirects: 3 });
    expect([200, 301, 302, 303]).toContain(res.status());
  });

  /**
   * T1: Ingress für alle Services vorhanden — checked via HTTP probe on prod domain.
   * Auth, files, vault, board, web should return 200/302/303.
   * Note: Talk (Nextcloud video) runs at files.${PROD_DOMAIN}/apps/spreed — no dedicated meet.* ingress.
   */
  test('T1: Alle Service-Ingresses erreichbar (prod)', async ({ request }) => {
    test.skip(!PROD_DOMAIN, 'Ingress-Probe nur in Prod durchführbar (PROD_DOMAIN fehlt)');
    const services: Array<{ name: string; url: string }> = [
      { name: 'auth',  url: `https://auth.${PROD_DOMAIN}` },
      { name: 'files', url: `https://files.${PROD_DOMAIN}` },
      { name: 'vault', url: `https://vault.${PROD_DOMAIN}` },
      { name: 'board', url: `https://brett.${PROD_DOMAIN}` },
      { name: 'web',   url: `https://web.${PROD_DOMAIN}` },
    ];
    for (const svc of services) {
      const res = await request.get(svc.url, { maxRedirects: 5 });
      expect(
        [200, 301, 302, 303],
        `Service "${svc.name}" (${svc.url}) sollte erreichbar sein`
      ).toContain(res.status());
    }
  });

  /**
   * T3: Security-Header prüfen (Produktion)
   * X-Content-Type-Options, X-Frame-Options müssen gesetzt sein.
   */
  test('T3: Security-Header gesetzt (prod)', async ({ request }) => {
    test.skip(!PROD_DOMAIN, 'Security-Header nur in Prod prüfen (PROD_DOMAIN fehlt)');
    const url = `https://web.${PROD_DOMAIN}`;
    const res = await request.get(url, { maxRedirects: 3 });
    expect([200, 301, 302, 303]).toContain(res.status());
    const headers = res.headers();
    expect(
      headers['x-content-type-options'],
      'X-Content-Type-Options-Header fehlt'
    ).toBeDefined();
    expect(
      headers['x-frame-options'] ?? headers['content-security-policy'],
      'Weder X-Frame-Options noch Content-Security-Policy gesetzt'
    ).toBeDefined();
  });

  /**
   * T4: TLS-Zertifikat gültig — verified indirectly: HTTPS request succeeds without TLS error.
   * Playwright/Node verifies the cert chain by default; if cert is invalid the request throws.
   */
  test('T4: TLS-Zertifikat gültig (keine TLS-Fehler bei HTTPS-Anfrage)', async ({ request }) => {
    test.skip(!PROD_DOMAIN, 'TLS-Test nur in Prod durchführbar (PROD_DOMAIN fehlt)');
    // No ignoreHTTPSErrors — will throw if cert is invalid/expired/self-signed
    const res = await request.get(`https://web.${PROD_DOMAIN}`, { maxRedirects: 3 });
    expect([200, 301, 302, 303]).toContain(res.status());
  });

  /**
   * T5: Im Browser — Seite lädt ohne Mixed-Content-Fehler.
   * Headed-friendly: opens the real browser, checks no mixed-content JS errors.
   */
  test('T5: Im Browser — Seite lädt ohne Mixed-Content-Fehler', async ({ page }) => {
    test.skip(!PROD_DOMAIN, 'TLS-Browser-Test nur in Prod (PROD_DOMAIN fehlt)');
    const mixedContentErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('Mixed Content') || err.message.includes('mixed content')) {
        mixedContentErrors.push(err.message);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('mixed content')) {
        mixedContentErrors.push(msg.text());
      }
    });
    await page.goto(`https://web.${PROD_DOMAIN}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    expect(
      mixedContentErrors,
      `Mixed-Content-Fehler gefunden: ${mixedContentErrors.join(', ')}`
    ).toHaveLength(0);
  });
});
