import { test, expect } from '@playwright/test';

// T901676 p1 — funktionale Whiteboard-Checks (Upstream-Container
// Nextcloud Whiteboard Collaboration Server: Banner, /status-JSON und
// Socket.IO-Handshake statt nur Erreichbarkeit). Basis nur aus BOARD_URL.
const BOARD_URL = (process.env.BOARD_URL || 'http://board.localhost').replace(/\/$/, '');

// Darf in keiner Antwort auftauchen: der Server ist sonst falsch konfiguriert
// (z. B. fehlendes Auth-Secret) statt funktional.
const AUTH_CONFIG_ERROR = /auth[^a-z]*(config|error|missing|failed)|not configured|missing secret/i;

test.describe('FA-24: Kollaboratives Whiteboard', () => {

  test('T1: Whiteboard service responds', async ({ page }) => {
    const res = await page.goto(BOARD_URL);
    // Whiteboard may redirect or return 200 depending on auth
    expect(res?.status()).toBeLessThan(500);
  });

  test('T2: Whiteboard is not returning server error', async ({ page }) => {
    const res = await page.goto(BOARD_URL);
    expect(res?.status()).not.toBe(502);
    expect(res?.status()).not.toBe(503);
  });

  test('T3: root serves the collaboration-server banner without auth config errors', async ({ request }) => {
    const res = await request.get(`${BOARD_URL}/`);
    expect(res.status()).toBeLessThan(500);
    const body = await res.text();
    expect(body).toContain('Whiteboard');
    expect(body).not.toMatch(AUTH_CONFIG_ERROR);
  });

  test('T4: /status reports a running server with a version', async ({ request }) => {
    const res = await request.get(`${BOARD_URL}/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(typeof body.version).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(AUTH_CONFIG_ERROR);
  });

  test('T5: socket.io polling handshake issues a session id', async ({ request }) => {
    const res = await request.get(`${BOARD_URL}/socket.io/?EIO=4&transport=polling`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('"sid"');
  });
});
