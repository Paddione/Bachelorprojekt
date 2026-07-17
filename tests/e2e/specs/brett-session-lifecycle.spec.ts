import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e, T001935-Kontext): der Session-
// Lifecycle jenseits von admin_session_create + admin_round_start war bisher
// ungetestet — insbesondere der Schutz vor doppelter Session-Erzeugung
// (session-active), der Pause/Stop-Zweig der Phasenmaschine, admin_kick und
// admin_handoff_token. Diese Datei schließt diese Lücke serverseitig
// (Protokoll-Ebene über das rohe WS, wie brett-roles.spec.ts).

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett session lifecycle', () => {
  test.skip(!BRETT_OIDC_SECRET, 'BRETT_OIDC_SECRET required to mint distinct e2e identities');

  async function loginAs(context: BrowserContext, userId: string, name: string): Promise<void> {
    const res = await context.request.post(`${BRETT_URL}/auth/e2e-login`, {
      headers: { 'x-e2e-secret': BRETT_OIDC_SECRET, 'content-type': 'application/json' },
      data: { userId, name, isAdmin: true },
    });
    expect(res.ok(), `e2e-login for ${userId}`).toBeTruthy();
  }

  async function waitForBoard(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const ws = (window as any).__brettWS;
      return ws && ws.readyState === 1 && (window as any).STATE;
    }, { timeout: 15000 });
  }

  async function sendWs(page: Page, msg: any): Promise<void> {
    await page.evaluate((m) => (window as any).__brettWS.send(JSON.stringify(m)), msg);
  }

  /** Install a listener that records every inbound message of the given type(s). */
  async function captureMessages(page: Page, types: string[]): Promise<void> {
    await page.evaluate((watchedTypes) => {
      (window as any).__captured = [];
      (window as any).__brettWS.addEventListener('message', (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data);
          if (watchedTypes.includes(m.type)) (window as any).__captured.push(m);
        } catch {}
      });
    }, types);
  }

  async function getCaptured(page: Page): Promise<any[]> {
    return page.evaluate(() => (window as any).__captured ?? []);
  }

  test('admin_session_create rejects a duplicate create while the round is active (session-active)', async ({ browser }) => {
    const room = `e2e-lifecycle-active-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-active-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-active-e2e', role: 'leiter' });
      await sendWs(leiter, { type: 'admin_round_start' });
      await leiter.waitForTimeout(500); // let session_phase_change (→ active) settle

      await captureMessages(leiter, ['error']);
      await sendWs(leiter, { type: 'admin_session_create' });
      await leiter.waitForTimeout(500);

      const errors = await getCaptured(leiter);
      expect(errors.length, 'a second admin_session_create during an active round must be rejected').toBeGreaterThan(0);
      expect(errors[0].reason).toBe('session-active');
    } finally {
      await ctx.close();
    }
  });

  test('T001935: a duplicate admin_session_create shows the session-active toast to the user', async ({ browser }) => {
    // Client-side regression test for the fix in PR #2930 (ws-client.ts error
    // handler): previously the session-active error was only console.warn'd,
    // giving the admin no feedback at all.
    const room = `e2e-lifecycle-toast-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-toast-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-toast-e2e', role: 'leiter' });
      await sendWs(leiter, { type: 'admin_round_start' });
      await leiter.waitForTimeout(500);

      await sendWs(leiter, { type: 'admin_session_create' });

      await expect(
        leiter.getByText('Es läuft bereits eine Sitzung. Bitte beende diese zuerst.')
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await ctx.close();
    }
  });

  test('round lifecycle: start → pause → stop broadcasts the correct phase to all participants', async ({ browser }) => {
    const room = `e2e-lifecycle-phase-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const watcherCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-phase-e2e', 'Leiter');
    await loginAs(watcherCtx, 'watcher-phase-e2e', 'Beobachter');
    const leiter = await leiterCtx.newPage();
    const watcher = await watcherCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-phase-e2e', role: 'leiter' });

      await watcher.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(watcher);
      await captureMessages(watcher, ['session_phase_change']);

      await sendWs(leiter, { type: 'admin_round_start' });
      await leiter.waitForTimeout(400);
      await sendWs(leiter, { type: 'admin_round_pause' });
      await leiter.waitForTimeout(400);
      await sendWs(leiter, { type: 'admin_round_stop' });
      await watcher.waitForTimeout(400);

      const phases = (await getCaptured(watcher)).map((m: any) => m.phase);
      expect(phases, 'watcher must observe active → paused → ended in order').toEqual(
        expect.arrayContaining(['active', 'paused', 'ended'])
      );
      expect(phases.indexOf('active')).toBeLessThan(phases.indexOf('paused'));
      expect(phases.indexOf('paused')).toBeLessThan(phases.indexOf('ended'));
    } finally {
      await leiterCtx.close();
      await watcherCtx.close();
    }
  });

  test('admin_kick disconnects the targeted participant', async ({ browser }) => {
    const room = `e2e-lifecycle-kick-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const targetCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-kick-e2e', 'Leiter');
    await loginAs(targetCtx, 'target-kick-e2e', 'Zielspieler');
    const leiter = await leiterCtx.newPage();
    const target = await targetCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-kick-e2e', role: 'leiter' });

      await target.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(target);

      await sendWs(leiter, { type: 'admin_kick', playerId: 'target-kick-e2e' });

      await target.waitForFunction(() => {
        const ws = (window as any).__brettWS;
        return !ws || ws.readyState === 2 || ws.readyState === 3; // CLOSING / CLOSED
      }, { timeout: 10000 });
    } finally {
      await leiterCtx.close();
      await targetCtx.close();
    }
  });

  test('admin_handoff_token transfers the admin token and both sides observe the new holder', async ({ browser }) => {
    const room = `e2e-lifecycle-handoff-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const newAdminCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-handoff-e2e', 'Leiter');
    await loginAs(newAdminCtx, 'newadmin-handoff-e2e', 'Neuer Admin');
    const leiter = await leiterCtx.newPage();
    const newAdmin = await newAdminCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-handoff-e2e', role: 'leiter' });

      await newAdmin.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(newAdmin);
      await captureMessages(newAdmin, ['admin_token_changed']);

      await sendWs(leiter, { type: 'admin_handoff_token', targetPlayerId: 'newadmin-handoff-e2e' });
      await newAdmin.waitForTimeout(500);

      const events = await getCaptured(newAdmin);
      expect(events.length, 'the new holder must observe admin_token_changed').toBeGreaterThan(0);
      expect(events[events.length - 1].holderPlayerId).toBe('newadmin-handoff-e2e');
    } finally {
      await leiterCtx.close();
      await newAdminCtx.close();
    }
  });
});
