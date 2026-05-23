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

/**
 * Helper: trigger a login event so events list is non-empty.
 * Uses the resource-owner-password flow with admin credentials (admin also has workspace access).
 */
async function triggerLoginEvent(request: APIRequestContext): Promise<void> {
  // Attempt login — failure is fine as long as the event is recorded
  await request.post(
    `${KC_URL}/realms/workspace/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KC_ADMIN_USER ?? 'admin',
        password: process.env.KC_ADMIN_PASS ?? 'wrong',
      },
    }
  );
}

test.describe('SA-05: Audit-Log', () => {
  test.setTimeout(30_000);

  /**
   * T1 + T2: Login-Event auslösen, dann prüfen ob mindestens 1 LOGIN-Event vorhanden.
   */
  test('T1+T2: Login-Event vorhanden nach Einloggen', async ({ request }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);

    // T1: Login-Event auslösen
    await triggerLoginEvent(request);

    // T2: Login-Events abrufen
    const eventsRes = await request.get(
      `${KC_URL}/admin/realms/workspace/events?type=LOGIN`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );
    expect(eventsRes.status()).toBe(200);
    const events = await eventsRes.json();
    expect(
      Array.isArray(events),
      'Events-Antwort ist kein Array'
    ).toBe(true);
    expect(
      events.length,
      'Kein LOGIN-Event in Keycloak-Event-Log gefunden'
    ).toBeGreaterThan(0);
    // Verify structure of first event
    expect(events[0]).toHaveProperty('type');
    expect(events[0]).toHaveProperty('realmId');
  });

  /**
   * T3: Admin-Aktionen im Admin-Event-Log prüfen.
   */
  test('T3: Admin-Events vorhanden', async ({ request }) => {
    test.skip(!process.env.KC_ADMIN_PASS, 'KC_ADMIN_PASS nicht gesetzt — Test übersprungen');

    const access_token = await getAdminToken(request);

    const adminEventsRes = await request.get(
      `${KC_URL}/admin/realms/workspace/admin-events`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );
    expect(adminEventsRes.status()).toBe(200);
    const adminEvents = await adminEventsRes.json();
    expect(
      Array.isArray(adminEvents),
      'Admin-Events-Antwort ist kein Array'
    ).toBe(true);
    expect(
      adminEvents.length,
      'Kein Admin-Event im Keycloak-Admin-Event-Log gefunden'
    ).toBeGreaterThan(0);
  });

  /**
   * T4: Im Browser Keycloak Admin Events-Seite erreichbar und zeigt keine 404.
   */
  test('T4: Keycloak Admin Events-Seite im Browser erreichbar', async ({ page }) => {
    test.skip(!process.env.PROD_DOMAIN, 'Browser-Test nur in Prod (PROD_DOMAIN fehlt)');
    const adminConsoleUrl = `${KC_URL}/admin/master/console/#/workspace/events`;
    await page.goto(adminConsoleUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    // Page should not be a bare 404 or error
    const bodyText = await page.locator('body').textContent();
    expect(
      bodyText,
      'Admin Events-Seite zeigt 404 oder Fehler'
    ).not.toContain('404 Not Found');
  });

  /**
   * Smoke: Events-API ohne auth → 401 (endpoint exists).
   */
  test('Smoke: Events-Endpunkt ohne Auth → 401', async ({ request }) => {
    const res = await request.get(`${KC_URL}/admin/realms/workspace/events`);
    expect([401, 403]).toContain(res.status());
  });
});
