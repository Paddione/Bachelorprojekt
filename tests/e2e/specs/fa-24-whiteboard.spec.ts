import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

  // T-axe: Whiteboard hat 0 critical/serious (wcag2a/wcag2aa/wcag21a/wcag21aa,
  // Vorbild a11y-axe.spec.ts). Upstream-Fremd-UI (Nextcloud Whiteboard):
  // Befund NICHT aufweichen, sondern mit board-Version in phase-events.log
  // → PR-Body (Folge-Entscheidung, B3).
  test('T-axe: Whiteboard hat 0 critical/serious', async ({ page }) => {
    test.setTimeout(30_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
    const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join('\n');
    const detail = blocking
      .map((v) => [
        `· ${v.id} (${v.impact ?? 'unknown'}) — ${v.help}`,
        `  ${v.helpUrl}`,
        ...v.nodes.map((n) => `  - ${n.target.join(' ')} :: ${(n.failureSummary ?? '').replace(/\n/g, ' | ')}`),
      ].join('\n'))
      .join('\n');
    expect(blocking.length, `${summary}\n\n${detail}`).toBe(0);
  });
});
