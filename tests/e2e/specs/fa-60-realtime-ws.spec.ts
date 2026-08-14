// tests/e2e/specs/fa-60-realtime-ws.spec.ts
//
// FA-60: Realtime WebSocket (brett /sync) — E2E-Lücke "Echtzeit / WebSockets".
//
// Die einzige produktiv erreichbare Realtime-Surface ist das brett-Sync-
// WebSocket (wss://<brett>/sync?room=..&playerId=..). Die SSE-Streams der
// SDLC-Console (/sdlc/api/factory-floor/stream) existieren nur im lokalen
// k3d-Cluster und sind dort bewusst nicht in prod-fleet deployt.
//
// Dieses Spec verifiziert den echten Push-Pfad: Verbindung über oauth2-proxy
// (Session aus `.auth/mentolder-brett.json`), `join` senden und eine
// Server-Message (snapshot/presence_join) empfangen. Es läuft im
// `brett-mentolder`-Projekt, dessen Setup (brett-mentolder-auth-setup) seit
// T003163 den echten Pocket-ID-Login per One-Time-Access-Code durchführt.
import { test, expect } from '@playwright/test';

const BRETT_URL = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');

test.describe('FA-60: Realtime WebSocket (brett /sync)', { tag: ['@brett'] }, () => {
  test.setTimeout(120_000);

  test('T1: /sync WS stays open and delivers snapshot after join (authenticated)', async ({ page }) => {
    await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // storageState trägt die oauth2-proxy-Session — wir dürfen nicht am Login hängen.
    await expect(page).not.toHaveURL(/oauth2|sign_in|login/, { timeout: 60_000 });

    const result = await page.evaluate(() => {
      return new Promise<{ ok: boolean; messages: string[]; error?: string }>((resolve) => {
        const room = `e2e-${Date.now()}`;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${location.host}/sync?room=${room}&playerId=e2e-ws-probe`);
        const messages: string[] = [];
        const timer = setTimeout(() => {
          ws.close();
          resolve({ ok: messages.length > 0, messages });
        }, 15_000);
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ type: 'join', room, name: 'E2E-WS-Probe' }));
        });
        ws.addEventListener('message', (ev) => {
          const raw = String(ev.data);
          messages.push(raw);
          try {
            const msg = JSON.parse(raw);
            if (msg.type === 'snapshot' || msg.type === 'presence_join') {
              clearTimeout(timer);
              ws.close();
              resolve({ ok: true, messages });
            }
          } catch {
            /* heartbeat / non-JSON frames */
          }
        });
        ws.addEventListener('error', () => {
          clearTimeout(timer);
          resolve({ ok: false, messages, error: 'ws error event' });
        });
      });
    });

    expect(result.ok, `WS roundtrip fehlgeschlagen: ${JSON.stringify(result)}`).toBe(true);
  });
});
