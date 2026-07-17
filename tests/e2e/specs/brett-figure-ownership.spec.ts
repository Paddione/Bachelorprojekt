import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Coverage-Lücke (Gap-Analyse dev-flow-e2e, Folge-Runde): figure_type_set,
// admin_assign_figure (server-autoritativer Besitzwechsel) und die
// Lobby-Settings-Persistenz (admin_set_optik, admin_set_template) waren
// bisher ungetestet.

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');
const BRETT_OIDC_SECRET = process.env.BRETT_OIDC_SECRET ?? '';

test.describe('Brett figure ownership & lobby settings', () => {
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

  test('figure_type_set broadcasts figure_type_changed and rejects an unknown figure', async ({ browser }) => {
    const room = `e2e-figtype-${Math.random().toString(36).slice(2, 8)}`;
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(ctx, 'leiter-figtype-e2e', 'Leiter');
    const leiter = await ctx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-figtype-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      await captureMessages(leiter, ['figure_type_changed', 'error']);
      await sendWs(leiter, { type: 'figure_type_set', figureId, figureType: 'protagonist' });
      await leiter.waitForTimeout(400);
      const changed = (await getCaptured(leiter)).find((m) => m.type === 'figure_type_changed');
      expect(changed, 'figure_type_changed must be broadcast').toBeTruthy();
      expect(changed.figureType).toBe('protagonist');

      await sendWs(leiter, { type: 'figure_type_set', figureId: 'does-not-exist', figureType: 'protagonist' });
      await leiter.waitForTimeout(400);
      const err = (await getCaptured(leiter)).find((m) => m.type === 'error');
      expect(err.reason).toBe('not-found');
    } finally {
      await ctx.close();
    }
  });

  test('admin_assign_figure transfers ownership; a subsequent demotion to beobachter orphans it', async ({ browser }) => {
    const room = `e2e-assignfig-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const otherCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-assignfig-e2e', 'Leiter');
    await loginAs(otherCtx, 'owner-assignfig-e2e', 'Stellvertreter');
    const leiter = await leiterCtx.newPage();
    const other = await otherCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-assignfig-e2e', role: 'leiter' });
      await leiter.waitForFunction(() => (window as any).STATE?.figures?.length > 0, { timeout: 10000 });
      const figureId: string = await leiter.evaluate(() => (window as any).STATE.figures[0].id);

      await other.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(other);
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'owner-assignfig-e2e', role: 'stellvertreter' });
      await other.waitForTimeout(300);

      await captureMessages(leiter, ['figure_owner_changed']);
      await sendWs(leiter, { type: 'admin_assign_figure', figureId, toPlayerId: 'owner-assignfig-e2e' });
      await leiter.waitForTimeout(400);
      const assigned = (await getCaptured(leiter)).find((m) => m.type === 'figure_owner_changed');
      expect(assigned, 'figure_owner_changed must broadcast on assignment').toBeTruthy();
      expect(assigned.ownerId).toBe('owner-assignfig-e2e');

      // Demotion to beobachter must orphan the figure (owner-orphan, C6).
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'owner-assignfig-e2e', role: 'beobachter' });
      await leiter.waitForTimeout(400);
      const orphaned = (await getCaptured(leiter)).filter((m) => m.type === 'figure_owner_changed');
      expect(orphaned[orphaned.length - 1].ownerId).toBeNull();
    } finally {
      await leiterCtx.close();
      await otherCtx.close();
    }
  });

  test('admin_set_optik and admin_set_template persist and broadcast lobby settings', async ({ browser }) => {
    const room = `e2e-lobbysettings-${Math.random().toString(36).slice(2, 8)}`;
    const leiterCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const watcherCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await loginAs(leiterCtx, 'leiter-lobby-e2e', 'Leiter');
    await loginAs(watcherCtx, 'watcher-lobby-e2e', 'Beobachter');
    const leiter = await leiterCtx.newPage();
    const watcher = await watcherCtx.newPage();

    try {
      await leiter.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(leiter);
      await sendWs(leiter, { type: 'admin_session_create' });
      await sendWs(leiter, { type: 'admin_assign_role', targetPlayerId: 'leiter-lobby-e2e', role: 'leiter' });

      await watcher.goto(`${BRETT_URL}?room=${room}`);
      await waitForBoard(watcher);
      await captureMessages(watcher, ['lobby_settings_change']);

      await sendWs(leiter, { type: 'admin_set_optik', settings: { theme: 'dark' } });
      await sendWs(leiter, { type: 'admin_set_template', templateId: 'e2e-unknown-template' });
      await watcher.waitForTimeout(500);

      const events = await getCaptured(watcher);
      const optikMsg = events.find((m) => m.optik);
      expect(optikMsg, 'watcher must receive the optik lobby_settings_change').toBeTruthy();
      expect(optikMsg.optik.theme).toBe('dark');

      const templateMsg = events.find((m) => m.templateId);
      expect(templateMsg, 'watcher must receive the templateId lobby_settings_change').toBeTruthy();
      expect(templateMsg.templateId).toBe('e2e-unknown-template');
    } finally {
      await leiterCtx.close();
      await watcherCtx.close();
    }
  });
});
