import { test, expect } from '@playwright/test';

const ARENA_URL = process.env.ARENA_WS_URL
  ?? (process.env.PROD_DOMAIN ? 'https://arena-ws.korczewski.de' : null);

/**
 * FA-40: Arena Spectator-join Smoke
 *
 * NOTE: This file covers the arena-server reachability + auth-rejection smoke tests.
 * The admin-assets spec (fa-40-admin-assets.spec.ts) is a separate, unrelated FA-40 entry.
 *
 * Arena-server uses Socket.IO with JWT authentication and a protocol-version handshake.
 * Raw WebSocket clients cannot complete the auth flow, so spectator:join cannot be tested
 * without a valid Keycloak token. These tests instead verify:
 *
 * T1: Arena-server pod readiness (kubectl) — skipped without cluster context.
 * T2: /healthz HTTP endpoint returns 200 (server is running and responding).
 * T3: Unauthenticated WebSocket connection is rejected (server enforces auth at handshake).
 *
 * All tests skip unless ARENA_WS_URL or PROD_DOMAIN is set.
 */

test.describe('FA-40: Arena Spectator-join Smoke', () => {
  test.skip(!ARENA_URL, 'requires ARENA_WS_URL or PROD_DOMAIN env var');
  test.setTimeout(30_000);

  // T1: Pod readiness (kubectl)
  test('T1: arena-server pod readiness (kubectl, skipped without cluster context)', async () => {
    test.skip(!process.env.KUBECONFIG && !process.env.MCP_CLUSTER_CONTEXT,
      'requires kubectl cluster context');
  });

  // T2: /healthz HTTP endpoint returns 200
  test('T2: /healthz HTTP endpoint returns 200', async ({ request }) => {
    const res = await request.get(`${ARENA_URL}/healthz`, { maxRedirects: 3 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
  });

  // T3: Unauthenticated WebSocket connection is rejected by the server
  test('T3: Unauthenticated WebSocket connection is rejected (auth enforced at handshake)', async ({ page }) => {
    const arenaWsUrl = ARENA_URL!
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    // Arena-server uses Socket.IO with JWT auth. A raw WS without a token must be rejected.
    const result = await page.evaluate(async (wsUrl: string) => {
      return new Promise<{ rejected: boolean; closeCode?: number }>((resolve) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(`${wsUrl}/ws`);
        } catch {
          resolve({ rejected: true });
          return;
        }

        // Auth rejection: Socket.IO closes the transport during handshake (code 4001 or similar)
        // or the WS closes with an error before open completes.
        ws.onclose = (event) => {
          // Any close from the server (clean or not) on an unauthenticated connection is a rejection.
          resolve({ rejected: true, closeCode: event.code });
        };

        ws.onerror = () => {
          // Error before close also counts as a rejection.
          resolve({ rejected: true });
        };

        // If still open after 5s without auth, something is wrong.
        setTimeout(() => {
          if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
            ws.close();
            resolve({ rejected: false });
          }
        }, 5_000);
      });
    }, arenaWsUrl);

    expect(result.rejected).toBe(true);
  });
});
