import { test, expect } from '@playwright/test';

const PROD_DOMAIN = process.env.PROD_DOMAIN;
const MCP_URL =
  process.env.MCP_PROXY_URL ??
  (PROD_DOMAIN ? `https://mcp.${PROD_DOMAIN}` : null);

/**
 * SA-10: MCP-Endpunkt-Absicherung (ForwardAuth)
 *
 * Prüft, dass der MCP-ForwardAuth-Proxy Token-Validierung korrekt durchsetzt.
 * Der auth-proxy Endpunkt ist über den externen MCP_PROXY_URL (oder mcp.{PROD_DOMAIN})
 * erreichbar; intern läuft er als mcp-auth-proxy Service im workspace-Namespace.
 */
test.describe('SA-10: MCP-Endpunkt-Absicherung (ForwardAuth)', () => {
  /**
   * T1: ForwardAuth-Proxy-Pod prüfen — erfordert kubectl.
   */
  test.skip(
    true,
    'T1: ForwardAuth-Proxy-Pod-Status erfordert kubectl — manuell:\n' +
      '  kubectl get deploy mcp-auth-proxy -n workspace -o jsonpath=\'{.status.readyReplicas}\'\n' +
      '  Erwarteter Wert: > 0'
  );

  /**
   * T2: Anfrage ohne Authorization-Header → HTTP 401.
   */
  test('T2: Ohne Authorization-Header → 401', async ({ request }) => {
    test.skip(
      !MCP_URL,
      'MCP_PROXY_URL oder PROD_DOMAIN nicht gesetzt — Test übersprungen'
    );
    const res = await request.get(`${MCP_URL!}/auth`);
    expect(
      res.status(),
      `MCP-Auth-Endpunkt gibt ${res.status()} ohne Auth zurück — erwartet 401`
    ).toBe(401);
  });

  /**
   * T3: Anfrage mit ungültigem Bearer-Token → HTTP 401.
   */
  test('T3: Ungültiges Bearer-Token → 401', async ({ request }) => {
    test.skip(
      !MCP_URL,
      'MCP_PROXY_URL oder PROD_DOMAIN nicht gesetzt — Test übersprungen'
    );
    const res = await request.get(`${MCP_URL!}/auth`, {
      headers: { Authorization: 'Bearer this-is-not-a-valid-token-xyz-12345' },
    });
    expect(
      res.status(),
      `MCP-Auth-Endpunkt gibt ${res.status()} mit ungültigem Token zurück — erwartet 401`
    ).toBe(401);
  });

  /**
   * T4: Gültiger Token → HTTP 200 — erfordert gültiges Token aus Keycloak.
   * Dieser Test ist bedingt übersprungen, wenn kein Token verfügbar.
   */
  test('T4: Gültiger Token → 200 (wenn KC_ADMIN_PASS gesetzt)', async ({ request }) => {
    test.skip(
      !MCP_URL || !process.env.KC_ADMIN_PASS,
      'Gültiger-Token-Test erfordert MCP_PROXY_URL und KC_ADMIN_PASS'
    );
    const KC_URL =
      process.env.KEYCLOAK_URL ??
      (PROD_DOMAIN ? `https://auth.${PROD_DOMAIN}` : 'http://auth.localhost');

    // Get a real admin token from Keycloak
    const tokenRes = await request.post(
      `${KC_URL}/realms/master/protocol/openid-connect/token`,
      {
        form: {
          grant_type: 'password',
          client_id: 'admin-cli',
          username: process.env.KC_ADMIN_USER ?? 'admin',
          password: process.env.KC_ADMIN_PASS!,
        },
      }
    );
    if (tokenRes.status() !== 200) {
      test.skip(); // Cannot get token — skip gracefully
      return;
    }
    const { access_token } = await tokenRes.json();

    const authRes = await request.get(`${MCP_URL!}/auth`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(
      authRes.status(),
      `MCP-Auth-Endpunkt gibt ${authRes.status()} mit gültigem Token zurück — erwartet 200`
    ).toBe(200);
  });

  /**
   * Smoke: MCP-URL grundsätzlich erreichbar (auch ohne Auth).
   */
  test('Smoke: MCP-Proxy-Basis-URL erreichbar', async ({ request }) => {
    test.skip(
      !MCP_URL,
      'MCP_PROXY_URL oder PROD_DOMAIN nicht gesetzt — Smoke-Test übersprungen'
    );
    const res = await request.get(MCP_URL!, { maxRedirects: 3 });
    // Any response (including 401/403) means the service is up
    expect(
      res.status(),
      'MCP-Proxy-URL nicht erreichbar (Timeout/Verbindungsfehler)'
    ).toBeLessThan(600);
  });
});
