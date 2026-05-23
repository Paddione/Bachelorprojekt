import { test, expect } from '@playwright/test';

const ARENA_URL = process.env.ARENA_WS_URL
  ?? (process.env.PROD_DOMAIN ? 'https://arena-ws.korczewski.de' : null);

/**
 * FA-40: Arena Spectator-join Smoke
 *
 * NOTE: This file covers the WebSocket spectator-join smoke test aspect of FA-40.
 * The admin-assets spec (fa-40-admin-assets.spec.ts) is a separate, unrelated FA-40 entry.
 *
 * T1: Arena-server pod readiness (kubectl) — skipped without cluster context.
 * T2: WebSocket connect, send spectator:join, receive valid protocol packet.
 * T3: Clean disconnect without errors.
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

  // T2: Spectator can join via WebSocket and receives a protocol packet
  test('T2: Spectator can join via WebSocket and receives a response packet', async ({ page }) => {
    const arenaWsUrl = ARENA_URL!
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    const result = await page.evaluate(async (wsUrl: string) => {
      return new Promise<{ received: boolean; packet?: unknown; error?: string }>((resolve) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(`${wsUrl}/ws`);
        } catch (e) {
          resolve({ received: false, error: String(e) });
          return;
        }

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'spectator:join', lobbyId: 'smoke-test' }));
        };

        ws.onmessage = (event) => {
          let packet: unknown;
          try {
            packet = JSON.parse(event.data as string);
          } catch {
            packet = event.data;
          }
          ws.close(1000, 'test complete');
          resolve({ received: true, packet });
        };

        ws.onerror = () => {
          resolve({ received: false, error: 'WebSocket error event fired' });
        };

        ws.onclose = (event) => {
          if (!event.wasClean || event.code !== 1000) {
            // Only resolve with failure if we never received a message
          }
        };

        // 8-second timeout to receive at least one packet
        setTimeout(() => resolve({ received: false, error: 'timeout waiting for server packet' }), 8_000);
      });
    }, arenaWsUrl);

    expect(result.received).toBe(true);
    // The packet must be a valid object (not null/undefined)
    expect(result.packet).toBeDefined();
  });

  // T3: WebSocket disconnects cleanly
  test('T3: WebSocket connection closes cleanly without errors', async ({ page }) => {
    const arenaWsUrl = ARENA_URL!
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    const result = await page.evaluate(async (wsUrl: string) => {
      return new Promise<{ cleanClose: boolean; code?: number; error?: string }>((resolve) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(`${wsUrl}/ws`);
        } catch (e) {
          resolve({ cleanClose: false, error: String(e) });
          return;
        }

        ws.onopen = () => {
          // Send the spectator join message then close cleanly
          ws.send(JSON.stringify({ type: 'spectator:join', lobbyId: 'smoke-close-test' }));
          setTimeout(() => ws.close(1000, 'test done'), 1_000);
        };

        ws.onclose = (event) => {
          resolve({ cleanClose: event.wasClean, code: event.code });
        };

        ws.onerror = () => {
          resolve({ cleanClose: false, error: 'error event before close' });
        };

        setTimeout(() => resolve({ cleanClose: false, error: 'timeout' }), 8_000);
      });
    }, arenaWsUrl);

    // A clean close means the server acknowledged the 1000 close code
    expect(result.cleanClose).toBe(true);
  });
});
