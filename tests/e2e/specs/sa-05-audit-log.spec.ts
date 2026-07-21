import { test, expect } from '@playwright/test';

const PI_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

test.describe('SA-05: Audit-Log', () => {
  test.skip(
    true,
    'T1+T2: Pocket ID exponiert kein Events-API — die Prüfung ' +
      'erfolgt über die website-eigene Audit-Log-Tabelle (audit_log) via DB-Zugriff'
  );

  test.skip(
    true,
    'T3: Admin-Events — Pocket ID hat kein admin-events-API'
  );

  test.skip(
    true,
    'T4: Pocket ID hat eigene Admin-Oberfläche (auth.mentolder.de/admin), ' +
      'keine Keycloak-Admin-Console'
  );

  test('Smoke: Pocket-ID OIDC-Token-Endpoint erreichbar (ohne Auth → 400)', async ({ request }) => {
    const res = await request.post(`${PI_URL}/api/oidc/token`, {
      form: { grant_type: 'password', username: '', password: '' },
    });
    expect([400, 401, 405]).toContain(res.status());
  });
});
