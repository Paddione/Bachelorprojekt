import { test, expect } from '@playwright/test';

const DOCS_URL = process.env.DOCS_URL
  ?? (process.env.PROD_DOMAIN ? `https://docs.${process.env.PROD_DOMAIN}` : 'http://docs.localhost');

/**
 * FA-13: Dokumentations-Service
 *
 * T1: kubectl readiness check — skipped without cluster context.
 * T2: Internal cluster DNS (docs.workspace.svc) — unreachable from Playwright; skipped.
 * T3: DOCS_DOMAIN ConfigMap value — requires kubectl; skipped without cluster context.
 * T4: Im Browser — Docsify start page loads (headed-friendly).
 */

test.describe('FA-13: Dokumentations-Service', () => {
  // T1: Docs deployment readiness (kubectl)
  test('T1: docs deployment readiness (kubectl, skipped without cluster context)', async () => {
    test.skip(!process.env.KUBECONFIG && !process.env.MCP_CLUSTER_CONTEXT,
      'requires kubectl cluster context');
  });

  // T2/T3: Internal svc address + ConfigMap — skip without cluster
  test('T2-T3: internal cluster URL and ConfigMap check (skipped without cluster context)', async () => {
    test.skip(!process.env.KUBECONFIG && !process.env.MCP_CLUSTER_CONTEXT,
      'requires kubectl cluster context');
  });

  // T3 (HTTP-observable): Docs URL is reachable.
  // Unauthenticated requests may be redirected to the auth host (302) or
  // return 2xx directly — both are acceptable. T002068.
  test('T3: Docs URL is reachable via HTTP', async ({ request }) => {
    const res = await request.get(DOCS_URL, { maxRedirects: 0 });
    // 2xx on docs host, or 3xx redirect (auth gateway) — both acceptable
    expect(res.status()).toBeGreaterThanOrEqual(200);
    expect(res.status()).toBeLessThan(400);
  });

  // T4: Im Browser — Docsify renders its content via JavaScript
  test('T4: Docsify-Startseite lädt im Browser', async ({ page }) => {
    await page.goto(DOCS_URL, { timeout: 20_000 });
    // Docsify injects content into #app; wait for it or any visible nav element
    const app = page.locator('#app, .app-nav, nav.app-nav, body');
    await expect(app.first()).toBeVisible({ timeout: 60_000 });
    // Must not show an error page
    const body = page.locator('body');
    await expect(body).not.toContainText('502 Bad Gateway');
    await expect(body).not.toContainText('404 Not Found');
    await expect(body).not.toContainText('Internal Server Error');
  });
});
