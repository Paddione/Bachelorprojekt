import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-04: Skalierbarkeit', () => {
  test.setTimeout(90_000);

  test('T3: Service verarbeitet parallele Requests (3 concurrent)', async ({ request }) => {
    // Send 3 concurrent requests to verify the service handles parallelism
    const results = await Promise.all([
      request.get(BASE, { maxRedirects: 3 }),
      request.get(BASE, { maxRedirects: 3 }),
      request.get(BASE, { maxRedirects: 3 }),
    ]);
    for (const res of results) {
      expect([200, 301, 302]).toContain(res.status());
    }
  });

  test('T3: Keycloak verarbeitet parallele Health-Requests', async ({ request }) => {
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (process.env.PROD_DOMAIN
        ? `https://auth.${process.env.PROD_DOMAIN}`
        : 'http://auth.localhost');
    const results = await Promise.all([
      request.get(`${KC_URL}/health/ready`, { maxRedirects: 3 }),
      request.get(`${KC_URL}/health/ready`, { maxRedirects: 3 }),
      request.get(`${KC_URL}/health/ready`, { maxRedirects: 3 }),
    ]);
    for (const res of results) {
      expect([200, 301, 302]).toContain(res.status());
    }
  });

  test.fixme(true, 'T1-T2, T4-T5: kubectl scale-Operationen und Rolling-Update erfordern Cluster-Zugriff — T000480');
});
