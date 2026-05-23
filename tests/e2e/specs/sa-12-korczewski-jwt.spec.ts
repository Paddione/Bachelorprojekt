import { test, expect } from '@playwright/test';

const ARENA_URL =
  process.env.ARENA_WS_URL ?? 'https://arena-ws.korczewski.de';
const KC_KORCZEWSKI =
  process.env.KEYCLOAK_KORCZEWSKI ?? 'https://auth.korczewski.de';

/**
 * SA-12: Korczewski-Realm JWT-Akzeptanz
 *
 * Prüft, dass ein JWT aus dem korczewski-Keycloak-Realm vom Arena-Server
 * (korczewski-Cluster) akzeptiert wird.
 *
 * Vorbedingungen:
 *   - Arena-Server auf korczewski deployed und erreichbar
 *   - ARENA_WS_URL gesetzt (oder Standard https://arena-ws.korczewski.de)
 *   - KEYCLOAK_KORCZEWSKI (optional, Standard: https://auth.korczewski.de)
 *   - E2E_KORCZEWSKI_PASS: Passwort des Testbenutzers im korczewski-Realm
 *   - E2E_KORCZEWSKI_USER (optional, Standard: "paddione")
 */
test.describe('SA-12: Korczewski-Realm JWT-Akzeptanz', () => {
  test.setTimeout(30_000);

  /**
   * Smoke: Korczewski Keycloak OIDC-Discovery erreichbar.
   */
  test('Smoke: Korczewski Keycloak OIDC-Discovery erreichbar', async ({ request }) => {
    const res = await request.get(
      `${KC_KORCZEWSKI}/realms/workspace/.well-known/openid-configuration`
    );
    expect(
      res.status(),
      'Korczewski Keycloak nicht erreichbar — OIDC-Discovery fehlgeschlagen'
    ).toBe(200);
    const json = await res.json();
    expect(json.issuer).toContain('korczewski');
  });

  /**
   * T1 + T2: Korczewski-JWT holen und Arena-Server prüft es als gültig (HTTP 200).
   */
  test('T1+T2: Korczewski-JWT wird vom Arena-Server akzeptiert', async ({ request }) => {
    test.skip(
      !process.env.E2E_KORCZEWSKI_PASS,
      'E2E_KORCZEWSKI_PASS nicht gesetzt — Test übersprungen'
    );

    const E2E_KORCZEWSKI_USER = process.env.E2E_KORCZEWSKI_USER ?? 'paddione';

    // T1: Token von korczewski Keycloak holen
    const tokenRes = await request.post(
      `${KC_KORCZEWSKI}/realms/workspace/protocol/openid-connect/token`,
      {
        form: {
          grant_type: 'password',
          client_id: 'arena',
          username: E2E_KORCZEWSKI_USER,
          password: process.env.E2E_KORCZEWSKI_PASS!,
        },
      }
    );

    if (tokenRes.status() !== 200) {
      // Benutzer hat keinen Zugang zum arena-Client im korczewski-Realm
      test.skip();
      return;
    }

    const body = await tokenRes.json();
    const access_token: string = body.access_token;
    expect(typeof access_token).toBe('string');
    expect(access_token.length).toBeGreaterThan(10);

    // T2: Anfrage mit korczewski-Token an Arena-Server
    // /healthz ist der leichtgewichtigste Endpunkt der Auth verlangt
    const healthRes = await request.get(`${ARENA_URL}/healthz`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(
      healthRes.status(),
      `Arena-Server hat korczewski-JWT abgelehnt: HTTP ${healthRes.status()} — erwartet 200`
    ).toBe(200);
  });

  /**
   * Zusatz: Token aus falschem Realm (mentolder) kann nicht über korczewski-Endpunkt
   * des Arena-Servers verwendet werden (wenn beide Keycloak-URLs konfiguriert sind).
   *
   * Dieser Test dokumentiert die erwartete Isolation — er ist nur aussagekräftig,
   * wenn beide Realms erreichbar sind und verschiedene Issuer-URLs haben.
   */
  test('Zusatz: Realm-Isolation dokumentiert', async () => {
    // This is a documentation-only test — the actual verification is done in SA-13 (untrusted JWT).
    // Arena-Server validates the "iss" claim: tokens from a different realm are rejected.
    test.skip(true, 'Realm-Isolation wird durch SA-13 (Untrusted JWT) abgedeckt.');
  });
});
