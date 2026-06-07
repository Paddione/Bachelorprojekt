import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Phase C / C7 — Rollen-Durchsetzung end-to-end.
// Proves the server-side rights chokepoint: an assigned `beobachter` cannot move
// a figure even though it authenticated as an OIDC-admin — enforcement keys on
// the assigned ROLE, not the isAdmin claim.

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett role enforcement (C7)', () => {
  test.skip(!BRETT_OIDC_SECRET, 'BRETT_OIDC_SECRET required to mint distinct e2e identities');

  /** POST /auth/e2e-login with a distinct identity and stamp the session cookie. */
  async function loginAs(context: BrowserContext, userId: string, name: string): Promise<void> {
    const res = await context.request.post(`${BRETT_URL}/auth/e2e-login`, {
      headers: { 'x-e2e-secret': BRETT_OIDC_SECRET, 'content-type': 'application/json' },
      data: { userId, name, isAdmin: true }, // both admin on purpose — proves role, not isAdmin, gates
    });
    expect(res.ok(), `e2e-login for ${userId}`).toBeTruthy();
  }

  /** Wait until window.__brettWS is OPEN and the join snapshot has populated STATE. */
  async function waitForBoard(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const ws = (window as any).__brettWS;
      return ws && ws.readyState === 1 && (window as any).STATE;
    }, { timeout: 15000 });
  }

  /** Send a raw protocol message over the page's live socket. */
  async function sendWs(page: Page, msg: any): Promise<void> {
    await page.evaluate((m) => (window as any).__brettWS.send(JSON.stringify(m)), msg);
  }

  test('an assigned beobachter cannot move a figure (server-enforced)', async ({ browser }) => {
    const room = `e2e-roles-${Math.random().toString(36).slice(2, 8)}`;

    // ── Two independent, distinctly-authenticated contexts ───────────────────
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const beobCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-e2e', 'Leiter');
    await loginAs(beobCtx, 'beob-e2e', 'Beobachter');

    const leiter = await leiterCtx.newPage();
    const beob = await beobCtx.newPage();

    try {
      // ── Leiter opens the board → creates a session, claims leiter role ──────
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      // The leiter (OIDC-admin) must hold the `leiter` role for the matrix to pass.
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-e2e', role: 'leiter' });

      // A figure to act on; capture its id from the leiter's authoritative STATE.
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      // ── Beobachter joins the same room (defaults to beobachter) ─────────────
      await beob.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(beob);
      // Explicit assignment by the leiter, then start the round (lobby → active).
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'beob-e2e', role: 'beobachter' });
      await sendWs(leiter, { type: 'admin_round_start' });
      await beob.waitForTimeout(500); // let role_changed / phase_change settle

      const xBefore: number = await leiter.evaluate((id) =>
        (window as any).STATE.figures.find((f: any) => f.id === id).x, figureId);

      // ── Beobachter installs an error listener, then attempts the move ───────
      await beob.evaluate(() => {
        (window as any).__lastError = null;
        (window as any).__brettWS.addEventListener('message', (ev: MessageEvent) => {
          try {
            const m = JSON.parse(ev.data);
            if (m.type === 'error') (window as any).__lastError = m;
          } catch {}
        });
      });
      await sendWs(beob, { type: 'move', id: figureId, x: 9, z: 9, facingY: 0 });
      await beob.waitForTimeout(500);

      // ── Assert: forbidden to the sender + position unchanged for the leiter ─
      const err = await beob.evaluate(() => (window as any).__lastError);
      expect(err, 'beobachter move must be rejected').toBeTruthy();
      expect(err.reason).toBe('forbidden');

      const xAfter: number = await leiter.evaluate((id) =>
        (window as any).STATE.figures.find((f: any) => f.id === id).x, figureId);
      expect(xAfter, 'figure position must be unchanged by the forbidden move').toBe(xBefore);
    } finally {
      await leiterCtx.close();
      await beobCtx.close();
    }
  });
});
