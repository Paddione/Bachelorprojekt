import { test, expect, type APIRequestContext } from '@playwright/test';

const KC_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

/**
 * Helper: obtain a Keycloak admin access token via master-realm admin-cli.
 * Requires KC_ADMIN_PASS (and optionally KC_ADMIN_USER, default: "admin").
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

test.describe('SA-03: Passwörter (Hash, Policy, kein Klartext)', () => {
  /**
   * T1: Passwort-Hash in DB — requires psql/kubectl, not automatable via HTTP.
   * This test is intentionally skipped and documents the manual step.
   */
  test.skip(
    true,
    'T1: Passwort-Hash in Keycloak-DB erfordert psql-Zugriff — manuell: ' +
      'psql keycloak -tAc "SELECT value FROM credential WHERE type=\'password\' LIMIT 1"'
  );

  /**
   * T2: Passwort-Policy via Keycloak Admin API.
   * passwordPolicy muss "length" enthalten (mindestens Mindestlänge konfiguriert).
   */
  test('T2: Keycloak passwordPolicy konfiguriert (enthält "length")', async ({
    request,
  }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);

    const realmRes = await request.get(`${KC_URL}/admin/realms/workspace`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(realmRes.status()).toBe(200);
    const realm = await realmRes.json();

    expect(realm.passwordPolicy, 'passwordPolicy nicht in Realm-Konfiguration gesetzt').toBeDefined();
    expect(
      realm.passwordPolicy,
      `passwordPolicy "${realm.passwordPolicy}" enthält keine Längen-Regel`
    ).toContain('length');
  });

  /**
   * T2b: passwordPolicy enthält zusätzliche Härtungs-Regel (specialChars oder digits).
   */
  test('T2b: passwordPolicy enthält Härtungs-Regel (specialChars oder digits)', async ({
    request,
  }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);
    const realmRes = await request.get(`${KC_URL}/admin/realms/workspace`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(realmRes.status()).toBe(200);
    const realm = await realmRes.json();
    const policy: string = realm.passwordPolicy ?? '';
    const hasHardening =
      policy.includes('specialChars') ||
      policy.includes('digits') ||
      policy.includes('upperCase') ||
      policy.includes('lowerCase');
    expect(
      hasHardening,
      `passwordPolicy "${policy}" enthält keine Härtungs-Regel (specialChars/digits/upperCase/lowerCase)`
    ).toBe(true);
  });

  /**
   * T3: Keycloak-Logs auf Klartext prüfen — requires kubectl, not automatable via HTTP.
   */
  test.skip(
    true,
    'T3: Keycloak-Log-Prüfung erfordert kubectl-Zugriff — manuell: ' +
      'kubectl logs deploy/keycloak -n workspace | grep -i "password="'
  );

  /**
   * Smoke: Keycloak OIDC discovery erreichbar — always runnable, no auth needed.
   */
  test('Smoke: Keycloak OIDC-Discovery erreichbar', async ({ request }) => {
    const res = await request.get(
      `${KC_URL}/realms/workspace/.well-known/openid-configuration`
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.issuer).toBeDefined();
    expect(json.token_endpoint).toBeDefined();
  });
});
