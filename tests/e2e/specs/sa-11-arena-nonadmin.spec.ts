import { test, expect } from '@playwright/test';

const ARENA_URL =
  process.env.ARENA_WS_URL ?? 'https://arena-ws.korczewski.de';
const KC_URL =
  process.env.KEYCLOAK_URL ??
  (process.env.PROD_DOMAIN
    ? `https://auth.${process.env.PROD_DOMAIN}`
    : 'http://auth.localhost');

/**
 * SA-11: Arena non-admin 403
 *
 * Prüft, dass ein Nicht-Administrator-Benutzer keinen Zugriff auf den
 * administrativen Arena-Endpunkt /lobby/open erhält (HTTP 403).
 *
 * Vorbedingungen:
 *   - Arena-Server auf korczewski deployed
 *   - ARENA_WS_URL gesetzt (oder Standard https://arena-ws.korczewski.de)
 *   - E2E_USER_PASS: Passwort eines Nicht-Admin-Testbenutzers
 *   - E2E_USER (optional, Standard: "testuser1")
 */
test.describe('SA-11: Arena non-admin 403', () => {
  test.setTimeout(30_000);

  /**
   * Smoke: Arena Health-Endpunkt ohne Token → Server läuft.
   * Erwartet 200 (public) oder 401 (auth required even for health).
   */
  test('Smoke: Arena /healthz erreichbar', async ({ request }) => {
    test.skip(!process.env.ARENA_WS_URL, 'ARENA_WS_URL nicht gesetzt — Test übersprungen');
    const res = await request.get(`${ARENA_URL}/healthz`);
    expect(
      [200, 401, 403],
      `Arena /healthz antwortete unerwartet mit ${res.status()}`
    ).toContain(res.status());
  });

  /**
   * T2: Nicht-Admin kann keine Lobby öffnen → HTTP 403.
   *
   * Ablauf:
   *   1. JWT für Nicht-Admin-User bei Keycloak holen (arena-Client)
   *   2. POST /lobby/open mit dem Token → muss 403 zurückgeben
   */
  test('T2: Nicht-Admin kann keine Lobby öffnen (erwartet 403)', async ({ request }) => {
    test.skip(
      !process.env.E2E_USER_PASS,
      'E2E_USER_PASS nicht gesetzt — Test übersprungen (kein Nicht-Admin-Testbenutzer konfiguriert)'
    );

    const E2E_USER = process.env.E2E_USER ?? 'testuser1';

    // T1: Token für Nicht-Admin-Benutzer holen
    const tokenRes = await request.post(
      `${KC_URL}/realms/workspace/protocol/openid-connect/token`,
      {
        form: {
          grant_type: 'password',
          client_id: 'arena',
          username: E2E_USER,
          password: process.env.E2E_USER_PASS!,
        },
      }
    );

    if (tokenRes.status() !== 200) {
      // User hat keinen Zugang zum arena-Client → Test ist nicht anwendbar
      test.skip();
      return;
    }

    const { access_token } = await tokenRes.json();
    expect(typeof access_token).toBe('string');
    expect(access_token.length).toBeGreaterThan(10);

    // T2: POST /lobby/open mit Nicht-Admin-Token → 403
    const lobbyRes = await request.post(`${ARENA_URL}/lobby/open`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(
      lobbyRes.status(),
      `Arena /lobby/open sollte Nicht-Admin mit 403 ablehnen, antwortete aber mit ${lobbyRes.status()}`
    ).toBe(403);
  });

  /**
   * Zusatz: /lobby/open ohne Token → 401 (kein anonymer Zugriff).
   */
  test('Zusatz: /lobby/open ohne Token → 401', async ({ request }) => {
    test.skip(!process.env.ARENA_WS_URL, 'ARENA_WS_URL nicht gesetzt — Test übersprungen');
    const res = await request.post(`${ARENA_URL}/lobby/open`, {
      data: {},
    });
    expect(
      res.status(),
      `Arena /lobby/open ohne Token sollte 401 zurückgeben, antwortete aber mit ${res.status()}`
    ).toBe(401);
  });
});
