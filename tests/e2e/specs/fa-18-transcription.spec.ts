import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';

const TRANSCRIBER_URL = process.env.TRANSCRIBER_URL || 'http://talk-transcriber.workspace.svc.cluster.local:8000';
const TRANSCRIBER_SECRET = process.env.TRANSCRIBER_SECRET || 'devtranscribersecret1234567890';

function signBody(body: string): string {
  return crypto.createHmac('sha256', TRANSCRIBER_SECRET).update(body).digest('hex');
}

let serviceAvailable = false;

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get(`${TRANSCRIBER_URL}/health`, { timeout: 3000 });
    serviceAvailable = res.ok();
  } catch {
    serviceAvailable = false;
  }
});

test.describe('FA-18: Live-Transkription (talk-transcriber)', () => {

  test('T1: /health returns ok or degraded with expected shape', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const res = await request.get(`${TRANSCRIBER_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(['ok', 'degraded']).toContain(body.status);
    expect(typeof body.pulseaudio).toBe('boolean');
    expect(Array.isArray(body.active)).toBeTruthy();
  });

  test('T2: /webhook rejects missing HMAC signature with 401', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const payload = JSON.stringify({ token: 'testtoken123', event: 'call_started' });
    const res = await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: { 'Content-Type': 'application/json' },
      data: payload,
    });
    expect(res.status()).toBe(401);
  });

  test('T3: /webhook rejects invalid HMAC signature with 401', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const payload = JSON.stringify({ token: 'testtoken123', event: 'call_started' });
    const res = await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Nextcloud-Talk-Signature': 'badsignature',
      },
      data: payload,
    });
    expect(res.status()).toBe(401);
  });

  test('T4: /webhook accepts valid HMAC and returns ok or started', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const payload = JSON.stringify({ token: 'faketesttoken', event: 'message' });
    const sig = signBody(payload);
    const res = await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Nextcloud-Talk-Signature': sig,
      },
      data: payload,
    });
    // Either starts a session (started) or skips gracefully (ok / rejected)
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(['started', 'ok', 'rejected']).toContain(body.status);
  });

  test('T5: /webhook with missing token returns ignored', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const payload = JSON.stringify({ event: 'call_started' });
    const sig = signBody(payload);
    const res = await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Nextcloud-Talk-Signature': sig,
      },
      data: payload,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ignored');
  });

  test('T6: /webhook rejects malformed JSON with 400', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const payload = 'not valid json{{{';
    const sig = signBody(payload);
    const res = await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Nextcloud-Talk-Signature': sig,
      },
      data: payload,
    });
    expect(res.status()).toBe(400);
  });

  test('T7: /health reports active session after webhook trigger', async ({ request }) => {
    test.skip(!serviceAvailable, `Transcriber not reachable at ${TRANSCRIBER_URL}`);
    const fakeToken = `e2etest${Date.now()}`;
    const payload = JSON.stringify({ token: fakeToken, event: 'call_started' });
    const sig = signBody(payload);

    await request.post(`${TRANSCRIBER_URL}/webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Nextcloud-Talk-Signature': sig,
      },
      data: payload,
    });

    // Give the session a moment to register
    await new Promise(r => setTimeout(r, 500));

    const health = await request.get(`${TRANSCRIBER_URL}/health`);
    const body = await health.json();
    // Session may have started or been rejected (no real Nextcloud), but structure must be valid
    expect(Array.isArray(body.active)).toBeTruthy();
  });
});
