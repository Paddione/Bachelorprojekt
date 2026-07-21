import { test, expect } from '@playwright/test';

const PI_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

test.describe('SA-03: Passwörter (Hash, Policy, kein Klartext)', () => {
  test.skip(
    true,
    'T1: Passwort-Hash in Pocket-ID-DB erfordert psql-Zugriff — manuell'
  );

  test.skip(
    true,
    'T2+T2b: Passwort-Policy — Pocket ID ist passkey-first und exponiert kein passwordPolicy-API. ' +
      'Die Passwort-Fallback-Policy wird beim Deployment gesetzt.'
  );

  test.skip(
    true,
    'T3: Pocket-ID-Log-Prüfung erfordert kubectl-Zugriff — manuell'
  );

  test('Smoke: Pocket-ID OIDC-Discovery erreichbar', async ({ request }) => {
    const res = await request.get(`${PI_URL}/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.issuer).toBeDefined();
    expect(json.token_endpoint).toBeDefined();
  });
});
