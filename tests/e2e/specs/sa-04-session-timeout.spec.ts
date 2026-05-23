import { test, expect, type APIRequestContext } from '@playwright/test';

const KC_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

/**
 * Helper: obtain a Keycloak admin access token via master-realm admin-cli.
 */
async function getAdminToken(request: APIRequestContext): Promise<string> {
  const KC_ADMIN_USER = process.env.KC_ADMIN_USER ?? 'admin';
  const tokenRes = await request.post(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KC_ADMIN_USER,
        password: process.env.KC_ADMIN_PASS!,
      },
    }
  );
  expect(tokenRes.status(), 'Admin-Token konnte nicht abgerufen werden').toBe(200);
  const { access_token } = await tokenRes.json();
  return access_token as string;
}

test.describe('SA-04: Session-Timeout', () => {
  /**
   * T1a + T1b + T2: Alle Timeout-Werte in einem API-Call prüfen.
   * ssoSessionIdleTimeout <= 1800s und > 0; accessTokenLifespan <= 3600s.
   */
  test('T1a+T1b+T2: Session-Timeout-Werte DSGVO-konform', async ({ request }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);

    const realmRes = await request.get(`${KC_URL}/admin/realms/workspace`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(realmRes.status()).toBe(200);
    const realm = await realmRes.json();

    // T1a: SSO Idle Timeout ≤ 1800s (30 Minuten)
    const idleTimeout: number = realm.ssoSessionIdleTimeout ?? 0;
    expect(
      idleTimeout,
      `ssoSessionIdleTimeout = ${idleTimeout}s liegt über dem DSGVO-Maximum von 1800s`
    ).toBeLessThanOrEqual(1800);

    // T1b: SSO Idle Timeout konfiguriert (> 0)
    expect(
      idleTimeout,
      'ssoSessionIdleTimeout = 0 — Session-Timeout ist nicht konfiguriert'
    ).toBeGreaterThan(0);

    // T2: Access Token Lifespan ≤ 3600s (60 Minuten)
    const tokenLifespan: number = realm.accessTokenLifespan ?? 0;
    expect(
      tokenLifespan,
      `accessTokenLifespan = ${tokenLifespan}s liegt über dem Maximum von 3600s`
    ).toBeLessThanOrEqual(3600);
  });

  /**
   * Zusatz: ssoSessionMaxLifespan prüfen (falls gesetzt — sollte ≤ 86400s sein).
   */
  test('Zusatz: ssoSessionMaxLifespan vernünftig konfiguriert', async ({ request }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);
    const realmRes = await request.get(`${KC_URL}/admin/realms/workspace`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(realmRes.status()).toBe(200);
    const realm = await realmRes.json();
    const maxLifespan: number = realm.ssoSessionMaxLifespan ?? 0;
    // 0 means "not explicitly set" in Keycloak — that's acceptable
    if (maxLifespan > 0) {
      expect(
        maxLifespan,
        `ssoSessionMaxLifespan = ${maxLifespan}s überschreitet 24h`
      ).toBeLessThanOrEqual(86400);
    }
  });

  /**
   * T3: 30 Minuten inaktiv warten — impraktikabel für automatisierte Tests.
   * Manueller Schritt dokumentiert.
   */
  test.skip(
    true,
    'T3: 30-Minuten-Inaktivitäts-Test ist manuell durchzuführen: ' +
      'Im Browser 30 Minuten inaktiv bleiben und prüfen, dass die Session abläuft.'
  );

  /**
   * Smoke: Keycloak-Realm grundsätzlich erreichbar (kein auth nötig).
   */
  test('Smoke: Keycloak-Realm erreichbar', async ({ request }) => {
    const res = await request.get(
      `${KC_URL}/realms/workspace/.well-known/openid-configuration`
    );
    expect(res.status()).toBe(200);
  });
});
