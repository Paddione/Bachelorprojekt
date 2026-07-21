import { test, expect } from '@playwright/test';

const PI_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

test.describe('SA-04: Session-Timeout', () => {
  test.skip(
    true,
    'T1a+T1b+T2: Session-Timeout wird nicht mehr über Pocket-ID konfiguriert, ' +
      'sondern über die website-eigene web_sessions-Tabelle (workspace_session Cookie Max-Age). ' +
      'Die Prüfung erfolgt im Website-Deployment, nicht im OIDC-Provider.'
  );

  test.skip(
    true,
    'T3: 30-Minuten-Inaktivitäts-Test ist manuell durchzuführen: ' +
      'Im Browser 30 Minuten inaktiv bleiben und prüfen, dass die Session abläuft.'
  );

  test('Smoke: Pocket-ID OIDC-Discovery erreichbar', async ({ request }) => {
    const res = await request.get(`${PI_URL}/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
  });
});
