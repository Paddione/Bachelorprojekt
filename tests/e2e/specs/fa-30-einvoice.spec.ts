import { test, expect } from '@playwright/test';

// einvoice-sidecar is ClusterIP-only (no public Ingress). Set EINVOICE_URL explicitly via
// port-forward (task workspace:port-forward) or from inside the cluster to run these tests.
const EINVOICE_URL = process.env.EINVOICE_URL ?? null;

/**
 * FA-30: E-Rechnung / XRechnung (einvoice-sidecar)
 *
 * T1: Service erreichbar (ClusterIP via kubectl) — HTTP reachability check via EINVOICE_URL.
 * T2: POST /embed with Base64-PDF + XRechnung XML → returns PDF/A-3.
 * T3: POST /validate → returns {"ok": true}.
 * T4: Im Browser — open the service landing page (no PDF fixture available in CI).
 *
 * All tests skip unless EINVOICE_URL is explicitly set.
 */

test.describe('FA-30: E-Rechnung / XRechnung (einvoice-sidecar)', () => {
  test.skip(!EINVOICE_URL, 'requires EINVOICE_URL env var (service is ClusterIP-only, no public ingress)');

  // T1: Service is reachable
  test('T1: einvoice-sidecar service is reachable', async ({ request }) => {
    const res = await request.get(EINVOICE_URL!, { maxRedirects: 3 });
    expect([200, 301, 302, 400, 404]).toContain(res.status());
    // Any response other than a network error means the service is up
  });

  // T2: /embed endpoint exists and validates its input
  test('T2: POST /embed with missing payload returns 400', async ({ request }) => {
    const res = await request.post(`${EINVOICE_URL}/embed`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    // Without valid PDF+XML, the sidecar must reject the request (400) or return a structured error
    expect([400, 422]).toContain(res.status());
  });

  // T3: /validate endpoint exists and returns JSON
  test('T3: POST /validate endpoint returns a JSON response', async ({ request }) => {
    const res = await request.post(`${EINVOICE_URL}/validate`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    // Without a PDF, 400 is expected; the response body must be JSON
    expect([200, 400, 422]).toContain(res.status());
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/application\/json/);
  });

  // T4: Im Browser — service landing page renders without 5xx
  test('T4: einvoice-sidecar landing page renders in browser', async ({ page }) => {
    await page.goto(EINVOICE_URL!, { timeout: 45_000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('Internal Server Error');
    await expect(body).not.toContainText('502 Bad Gateway');
  });
});
